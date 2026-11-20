import { NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/candidateAccess";
import { getCompetencyDb, jsonError } from "@/lib/competencyDb.server";

/**
 * Deletes the candidate's English Competency result and reopens their main
 * assessment, so they can take the English Competency section again.
 */
export async function POST(request: Request) {
  const conn = getCompetencyDb();
  if ("error" in conn) return conn.error;
  const { db } = conn;

  const body = (await request.json().catch(() => null)) as
    | { attemptId?: string; candidateEmail?: string }
    | null;
  let attemptId = (body?.attemptId ?? "").trim();
  const email = normalizeEmail(body?.candidateEmail ?? "");
  if (!attemptId && !email) return jsonError("Missing attemptId or candidate email.", 400);

  if (!attemptId) {
    const { data: rows, error } = await db
      .from("competency_attempts")
      .select("id")
      .eq("candidate_email", email)
      .order("started_at", { ascending: false })
      .limit(1);
    if (error) return jsonError(error.message);
    attemptId = rows?.[0]?.id ?? "";
    if (!attemptId) return jsonError("No English Competency attempt found for this user.", 404);
  }

  const { data: deleted, error: deleteError } = await db
    .from("competency_attempts")
    .delete()
    .eq("id", attemptId)
    .select("id");
  if (deleteError) return jsonError(deleteError.message);
  if ((deleted ?? []).length === 0) {
    return jsonError("This user has no English Competency result to reset.", 404);
  }

  // Reopen the main assessment so the candidate can come back and retake it.
  const { error: reopenError } = await db
    .from("assessment_attempts")
    .update({ completed_at: null, total_score: null, max_score: null })
    .eq("id", attemptId);
  if (reopenError) return jsonError(reopenError.message);

  return NextResponse.json({ ok: true, attemptId, deletedAttempts: deleted?.length ?? 0 });
}
