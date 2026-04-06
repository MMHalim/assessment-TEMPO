import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseClient";

function pickString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Server is not configured." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { attemptId?: string; sectionId?: string }
    | null;

  const attemptId = pickString(body?.attemptId)?.trim() ?? "";
  const sectionId = pickString(body?.sectionId)?.trim() ?? "";

  if (!attemptId || !sectionId) {
    return NextResponse.json(
      { ok: false, error: "Missing attemptId/sectionId." },
      { status: 400 },
    );
  }

  let deletedAnswerRows = 0;
  let deletedTypingRows = 0;

  if (sectionId === "__typing__") {
    const { data, error } = await supabase
      .from("typing_test_results")
      .delete()
      .eq("attempt_id", attemptId)
      .select("attempt_id");
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    deletedTypingRows = (data ?? []).length;
  } else {
    const { data: qs, error: qErr } = await supabase
      .from("assessment_questions")
      .select("id")
      .eq("section_id", sectionId)
      .limit(5000);
    if (qErr) {
      return NextResponse.json({ ok: false, error: qErr.message }, { status: 500 });
    }

    const ids = (qs ?? [])
      .map((r) => pickString((r as Record<string, unknown>)["id"]))
      .filter((v): v is string => Boolean(v));

    if (ids.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No questions found for this section." },
        { status: 400 },
      );
    }

    const { data: deleted, error: delErr } = await supabase
      .from("assessment_attempt_answers")
      .delete()
      .eq("attempt_id", attemptId)
      .in("question_id", ids)
      .select("question_id");
    if (delErr) {
      return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
    }
    deletedAnswerRows = (deleted ?? []).length;
  }

  const { error: attemptErr } = await supabase
    .from("assessment_attempts")
    .update({ completed_at: null, total_score: null, max_score: null })
    .eq("id", attemptId);

  if (attemptErr) {
    return NextResponse.json({ ok: false, error: attemptErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    deletedAnswerRows,
    deletedTypingRows,
  });
}

