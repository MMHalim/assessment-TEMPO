import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseClient";

function pickString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export async function POST(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Admin reset requires SUPABASE_SERVICE_ROLE_KEY on the server (RLS may block deletes otherwise).",
      },
      { status: 500 },
    );
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Server is not configured." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { attemptId?: string; candidateEmail?: string; sectionId?: string }
    | null;

  const attemptId = pickString(body?.attemptId)?.trim() ?? "";
  const candidateEmail = (pickString(body?.candidateEmail)?.trim() ?? "").toLowerCase();
  const sectionId = pickString(body?.sectionId)?.trim() ?? "";

  if ((!attemptId && !candidateEmail) || !sectionId) {
    return NextResponse.json(
      { ok: false, error: "Missing attemptId/candidateEmail or sectionId." },
      { status: 400 },
    );
  }

  let resolvedAttemptId = attemptId;

  if (!resolvedAttemptId) {
    const { data: attempts, error: attemptsError } = await supabase
      .from("assessment_attempts")
      .select("id, started_at")
      .eq("candidate_email", candidateEmail)
      .order("started_at", { ascending: false })
      .limit(50);

    if (attemptsError) {
      return NextResponse.json({ ok: false, error: attemptsError.message }, { status: 500 });
    }

    const list = (attempts ?? []) as Array<{ id: string; started_at: string }>;
    if (list.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No attempts found for this user." },
        { status: 404 },
      );
    }

    let bestId = String(list[0]?.id ?? "");
    let bestCount = -1;
    let bestStartedAt = new Date(String(list[0]?.started_at ?? 0)).getTime();

    for (const a of list) {
      const { count, error: countError } = await supabase
        .from("assessment_attempt_answers")
        .select("attempt_id", { count: "exact", head: true })
        .eq("attempt_id", a.id);
      if (countError) continue;

      const c = typeof count === "number" ? count : 0;
      const t = new Date(a.started_at).getTime();
      if (c > bestCount || (c === bestCount && t > bestStartedAt)) {
        bestId = a.id;
        bestCount = c;
        bestStartedAt = t;
      }
    }

    resolvedAttemptId = bestId;
  }

  let deletedAnswerRows = 0;
  let deletedTypingRows = 0;

  if (sectionId === "__typing__") {
    const { count: beforeCount, error: beforeErr } = await supabase
      .from("typing_test_results")
      .select("attempt_id", { count: "exact", head: true })
      .eq("attempt_id", resolvedAttemptId);
    if (beforeErr) {
      return NextResponse.json({ ok: false, error: beforeErr.message }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("typing_test_results")
      .delete()
      .eq("attempt_id", resolvedAttemptId)
      .select("attempt_id");
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    deletedTypingRows = (data ?? []).length;

    const { count: afterCount, error: afterErr } = await supabase
      .from("typing_test_results")
      .select("attempt_id", { count: "exact", head: true })
      .eq("attempt_id", resolvedAttemptId);
    if (afterErr) {
      return NextResponse.json({ ok: false, error: afterErr.message }, { status: 500 });
    }

    if ((beforeCount ?? 0) > 0 && (afterCount ?? 0) > 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Typing reset did not remove the row. Check RLS policies / service role configuration.",
        },
        { status: 500 },
      );
    }
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

    const { count: beforeCount, error: beforeErr } = await supabase
      .from("assessment_attempt_answers")
      .select("id", { count: "exact", head: true })
      .eq("attempt_id", resolvedAttemptId)
      .in("question_id", ids);
    if (beforeErr) {
      return NextResponse.json({ ok: false, error: beforeErr.message }, { status: 500 });
    }

    const { data: deleted, error: delErr } = await supabase
      .from("assessment_attempt_answers")
      .delete()
      .eq("attempt_id", resolvedAttemptId)
      .in("question_id", ids)
      .select("question_id");
    if (delErr) {
      return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
    }
    deletedAnswerRows = (deleted ?? []).length;

    const { count: afterCount, error: afterErr } = await supabase
      .from("assessment_attempt_answers")
      .select("id", { count: "exact", head: true })
      .eq("attempt_id", resolvedAttemptId)
      .in("question_id", ids);
    if (afterErr) {
      return NextResponse.json({ ok: false, error: afterErr.message }, { status: 500 });
    }

    if ((beforeCount ?? 0) > 0 && (afterCount ?? 0) > 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Reset did not delete any rows for this attempt+assessment. Check that you reset the correct attempt and that RLS is not blocking deletes.",
        },
        { status: 500 },
      );
    }
  }

  const { error: attemptErr } = await supabase
    .from("assessment_attempts")
    .update({ completed_at: null, total_score: null, max_score: null })
    .eq("id", resolvedAttemptId);

  if (attemptErr) {
    return NextResponse.json({ ok: false, error: attemptErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    attemptId: resolvedAttemptId,
    deletedAnswerRows,
    deletedTypingRows,
  });
}
