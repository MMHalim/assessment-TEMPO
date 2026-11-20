import { NextResponse } from "next/server";
import { getCompetencyDb, jsonError } from "@/lib/competencyDb.server";

/**
 * English Competency is the last section of the main assessment.
 * Its attempt row reuses the main assessment attempt id, so this creates it
 * (once) from the main attempt's candidate details.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conn = getCompetencyDb();
  if ("error" in conn) return conn.error;
  const { db } = conn;

  const { data: existing, error: existingError } = await db
    .from("competency_attempts")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (existingError) return jsonError(existingError.message);
  if (existing) return NextResponse.json({ ok: true });

  const { data: main, error: mainError } = await db
    .from("assessment_attempts")
    .select("id,candidate_name,candidate_email,completed_at")
    .eq("id", id)
    .maybeSingle();
  if (mainError) return jsonError(mainError.message);
  if (!main) return jsonError("Assessment not found.", 404);
  if (main.completed_at) return jsonError("This assessment has already been completed.", 409);

  const { error: insertError } = await db.from("competency_attempts").insert({
    id: main.id,
    candidate_name: main.candidate_name ?? "",
    candidate_email: String(main.candidate_email ?? "").toLowerCase(),
  });
  // 23505 = unique violation: a parallel request already created it.
  if (insertError && insertError.code !== "23505") return jsonError(insertError.message);

  return NextResponse.json({ ok: true });
}
