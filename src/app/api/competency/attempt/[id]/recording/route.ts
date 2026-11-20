import { NextResponse } from "next/server";
import {
  SUFFICIENT_ANSWER,
  cefrLevelFor,
  computeOverallScore,
  type CompetencyReport,
  type SpeechMetrics,
} from "@/lib/competency";
import {
  CompetencyAiError,
  analyzeSpeech,
  generateFollowUpQuestion,
  transcribeRecording,
} from "@/lib/competencyAi.server";
import { getCompetencyDb, jsonError, type CompetencyAttemptRow } from "@/lib/competencyDb.server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 24 * 1024 * 1024; // Groq free tier accepts up to 25 MB.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conn = getCompetencyDb();
  if ("error" in conn) return conn.error;
  const { db } = conn;

  const form = await request.formData().catch(() => null);
  const stage = form?.get("stage");
  const audio = form?.get("audio");
  if (stage !== "main" && stage !== "followup") return jsonError("Invalid stage.", 400);
  if (!(audio instanceof File) || audio.size === 0) return jsonError("No recording received.", 400);
  if (audio.size > MAX_AUDIO_BYTES) return jsonError("The recording is too large.", 413);

  const { data, error } = await db.from("competency_attempts").select("*").eq("id", id).maybeSingle();
  if (error) return jsonError(error.message);
  if (!data) return jsonError("Assessment not found.", 404);
  const attempt = data as CompetencyAttemptRow;

  if (attempt.status === "completed") return jsonError("This assessment was already submitted.", 409);
  if (stage === "main" && (attempt.status !== "started" || !attempt.topic_title)) {
    return jsonError("Please choose a topic first.", 409);
  }
  if (stage === "followup" && attempt.status !== "followup") {
    return jsonError("No follow-up question is pending.", 409);
  }

  let topic = { title: attempt.topic_title ?? "", description: null as string | null };
  if (attempt.topic_id) {
    const { data: t } = await db
      .from("competency_topics")
      .select("title,description")
      .eq("id", attempt.topic_id)
      .maybeSingle();
    if (t) topic = { title: attempt.topic_title ?? t.title, description: t.description };
  }

  try {
    const { text, metrics } = await transcribeRecording(audio);
    if (metrics.wordCount < 3) {
      return jsonError(
        "We couldn't hear you clearly. Please check your microphone and record your answer again.",
        422,
      );
    }

    if (stage === "main") {
      const tooShort =
        metrics.speechSec < SUFFICIENT_ANSWER.minSpeechSec || metrics.wordCount < SUFFICIENT_ANSWER.minWords;

      if (tooShort) {
        const question = await generateFollowUpQuestion(topic, text);
        return await askFollowUp(db, id, { transcript: text, metrics, question });
      }

      const analysis = await analyzeSpeech({
        topic,
        main: { transcript: text, metrics },
        canAskFollowUp: true,
      });
      if (analysis.followUpQuestion) {
        return await askFollowUp(db, id, { transcript: text, metrics, question: analysis.followUpQuestion });
      }
      return await complete(db, id, { transcript: text, metrics }, analysis.report);
    }

    // Follow-up answer: score both answers together. Only one follow-up is ever asked.
    const analysis = await analyzeSpeech({
      topic,
      main: { transcript: attempt.transcript ?? "", metrics: attempt.metrics as SpeechMetrics },
      followUp: { question: attempt.followup_question ?? "", transcript: text, metrics },
      canAskFollowUp: false,
    });
    return await complete(db, id, { followup_transcript: text, followup_metrics: metrics }, analysis.report);
  } catch (e) {
    if (e instanceof CompetencyAiError) return jsonError(e.message, e.status);
    console.error("Competency recording failed:", e);
    return jsonError("Something went wrong while analysing your recording. Please try again.", 500);
  }
}

type Db = Exclude<ReturnType<typeof getCompetencyDb>, { error: unknown }>["db"];

async function askFollowUp(
  db: Db,
  id: string,
  input: { transcript: string; metrics: SpeechMetrics; question: string },
) {
  const { error } = await db
    .from("competency_attempts")
    .update({
      status: "followup",
      transcript: input.transcript,
      metrics: input.metrics,
      followup_question: input.question,
    })
    .eq("id", id);
  if (error) return jsonError(error.message);
  return NextResponse.json({ ok: true, next: "followup", question: input.question });
}

async function complete(db: Db, id: string, fields: Record<string, unknown>, report: CompetencyReport) {
  const overall = computeOverallScore(report.scores);
  const { error } = await db
    .from("competency_attempts")
    .update({
      ...fields,
      status: "completed",
      report,
      overall_score: overall,
      cefr_level: cefrLevelFor(overall),
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return jsonError(error.message);
  return NextResponse.json({ ok: true, next: "done" });
}
