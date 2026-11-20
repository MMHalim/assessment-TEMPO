import { NextResponse } from "next/server";
import { getCompetencyDb, jsonError } from "@/lib/competencyDb.server";

export const dynamic = "force-dynamic";

/** Candidate-facing state of an attempt. Never returns scores or transcripts. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conn = getCompetencyDb();
  if ("error" in conn) return conn.error;

  const { data, error } = await conn.db
    .from("competency_attempts")
    .select("id,candidate_name,topic_id,topic_title,status,followup_question")
    .eq("id", id)
    .maybeSingle();
  if (error) return jsonError(error.message);
  if (!data) return jsonError("Assessment not found.", 404);

  let topicDescription: string | null = null;
  if (data.topic_id) {
    const { data: topic } = await conn.db
      .from("competency_topics")
      .select("description")
      .eq("id", data.topic_id)
      .maybeSingle();
    topicDescription = topic?.description ?? null;
  }

  const stage =
    data.status === "completed"
      ? "done"
      : data.status === "followup"
        ? "record_followup"
        : data.topic_title
          ? "record_main"
          : "topic";

  return NextResponse.json({
    ok: true,
    attempt: {
      id: data.id,
      candidateName: data.candidate_name,
      topicTitle: data.topic_title,
      topicDescription,
      followUpQuestion: data.status === "followup" ? data.followup_question : null,
      stage,
    },
  });
}
