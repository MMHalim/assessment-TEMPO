import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseClient";
import { verifyCandidate } from "@/lib/candidateAccess";

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Server is not configured." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { name?: string; timestamp?: string; email?: string }
    | null;

  const name = (body?.name ?? "").trim();
  const check = await verifyCandidate(supabase, {
    name,
    timestamp: body?.timestamp ?? "",
    email: body?.email ?? "",
  });
  if (!check.ok) {
    return NextResponse.json({ ok: false, error: check.error }, { status: check.status });
  }
  const matchedEmail = check.email;

  const { count: completedCount, error: completedError } = await supabase
    .from("assessment_attempts")
    .select("id", { count: "exact", head: true })
    .eq("candidate_email", matchedEmail)
    .not("completed_at", "is", null);

  if (completedError) {
    return NextResponse.json(
      { ok: false, error: completedError.message },
      { status: 500 },
    );
  }

  if ((completedCount ?? 0) > 0) {
    return NextResponse.json(
      { ok: false, error: "You already submitted this assessment." },
      { status: 409 },
    );
  }

  const { data: existingAttempts, error: existingError } = await supabase
    .from("assessment_attempts")
    .select("id, started_at")
    .eq("candidate_email", matchedEmail)
    .is("completed_at", null)
    .order("started_at", { ascending: false });

  if (existingError) {
    return NextResponse.json(
      { ok: false, error: existingError.message },
      { status: 500 },
    );
  }

  if (existingAttempts && existingAttempts.length > 0) {
    let bestId = existingAttempts[0]?.id as string | undefined;
    let bestCount = -1;
    let bestStartedAt = new Date(String(existingAttempts[0]?.started_at ?? 0)).getTime();

    for (const a of existingAttempts as Array<{ id: string; started_at: string }>) {
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

    if (bestId) {
      return NextResponse.json({ ok: true, attemptId: bestId });
    }
  }

  const { data: attempt, error: insertError } = await supabase
    .from("assessment_attempts")
    .insert({
      candidate_name: name,
      candidate_email: matchedEmail,
    })
    .select("id")
    .single();

  if (insertError) {
    return NextResponse.json(
      { ok: false, error: insertError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, attemptId: attempt.id });
}
