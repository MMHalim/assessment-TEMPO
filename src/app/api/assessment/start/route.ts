import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseClient";

function pickString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function normalizeEmail(email: string): string {
  return email
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeKeyPart(v: string): string {
  return (v ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, (m) => `\\${m}`);
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
    | { name?: string; timestamp?: string; email?: string }
    | null;

  const name = (body?.name ?? "").trim();
  const timestamp = (body?.timestamp ?? "").trim();
  const email = normalizeEmail(body?.email ?? "");

  if (!name || !timestamp) {
    return NextResponse.json(
      { ok: false, error: "Missing candidate selection" },
      { status: 400 },
    );
  }

  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { ok: false, error: "Invalid email" },
      { status: 400 },
    );
  }

  const lookups = [
    { nameCol: "Name", tsCol: "Timestamp", emailCol: "Email" },
    { nameCol: "Name", tsCol: "Timestamp", emailCol: "Email_Address" },
    { nameCol: "name", tsCol: "timestamp", emailCol: "email" },
    { nameCol: "name", tsCol: "timestamp", emailCol: "email_address" },
    { nameCol: "Name", tsCol: "Timestamp", emailCol: "email" },
    { nameCol: "Name", tsCol: "Timestamp", emailCol: "email_address" },
    { nameCol: "name", tsCol: "timestamp", emailCol: "Email" },
    { nameCol: "name", tsCol: "timestamp", emailCol: "Email_Address" },
  ] as const;

  let matchedEmail = "";
  let foundCandidateRow = false;
  let hadReadableLookup = false;
  const normalizedName = normalizeKeyPart(name);
  const normalizedTimestamp = normalizeKeyPart(timestamp);
  const namePrefix = `${escapeLike(normalizedName)}%`;
  const tsPrefix = `${escapeLike(normalizedTimestamp)}%`;

  for (const { nameCol, tsCol, emailCol } of lookups) {
    const { data, error } = await supabase
      .from("empDB")
      .select(`${nameCol},${tsCol},${emailCol}`)
      .ilike(nameCol, namePrefix)
      .ilike(tsCol, tsPrefix)
      .limit(20);

    if (error) continue;
    hadReadableLookup = true;
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) continue;

    for (const record of rows) {
      const rawName = pickString(record[nameCol]) ?? "";
      const rawTs = pickString(record[tsCol]) ?? "";
      const rowName = normalizeKeyPart(rawName);
      const rowTs = normalizeKeyPart(rawTs);
      if (rowName !== normalizedName) continue;
      if (rowTs !== normalizedTimestamp) continue;
      foundCandidateRow = true;

      const stored = normalizeEmail(pickString(record[emailCol]) ?? "");
      if (stored && stored === email) {
        matchedEmail = stored;
        break;
      }
    }

    if (matchedEmail) break;
  }

  if (!hadReadableLookup) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Assessment access is not configured. Please contact the administrator.",
      },
      { status: 500 },
    );
  }

  if (!foundCandidateRow) {
    return NextResponse.json(
      { ok: false, error: "Wrong email, please try again !" },
      { status: 404 },
    );
  }

  if (!matchedEmail) {
    return NextResponse.json(
      { ok: false, error: "Wrong email, please try again !" },
      { status: 403 },
    );
  }

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
