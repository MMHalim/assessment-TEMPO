import { NextResponse } from "next/server";
import { getCompetencyDb, jsonError } from "@/lib/competencyDb.server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conn = getCompetencyDb();
  if ("error" in conn) return conn.error;
  const { db } = conn;

  const body = (await request.json().catch(() => null)) as { topicId?: string } | null;
  const topicId = typeof body?.topicId === "string" ? body.topicId : "";
  if (!topicId) return jsonError("Please choose a topic.", 400);

  const { data: attempt, error: attemptError } = await db
    .from("competency_attempts")
    .select("id,status,transcript")
    .eq("id", id)
    .maybeSingle();
  if (attemptError) return jsonError(attemptError.message);
  if (!attempt) return jsonError("Assessment not found.", 404);
  if (attempt.status !== "started" || attempt.transcript) {
    return jsonError("The topic can no longer be changed.", 409);
  }

  const { data: topic, error: topicError } = await db
    .from("competency_topics")
    .select("id,title,description,active")
    .eq("id", topicId)
    .maybeSingle();
  if (topicError) return jsonError(topicError.message);
  if (!topic || !topic.active) return jsonError("This topic is not available.", 404);

  const { error: updateError } = await db
    .from("competency_attempts")
    .update({ topic_id: topic.id, topic_title: topic.title })
    .eq("id", id);
  if (updateError) return jsonError(updateError.message);

  return NextResponse.json({
    ok: true,
    topic: { title: topic.title, description: topic.description },
  });
}
