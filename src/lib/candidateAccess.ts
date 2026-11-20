import type { SupabaseClient } from "@supabase/supabase-js";

function pickString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export function normalizeEmail(email: string): string {
  return email
    .replace(/ /g, " ")
    .replace(/[​-‍﻿]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeKeyPart(v: string): string {
  return (v ?? "")
    .replace(/ /g, " ")
    .replace(/[​-‍﻿]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export type CandidateCheck =
  | { ok: true; email: string }
  | { ok: false; status: number; error: string };

/**
 * Confirms that the selected empDB row (name + timestamp) exists and that the
 * typed email matches the email stored on that row.
 */
export async function verifyCandidate(
  supabase: SupabaseClient,
  input: { name: string; timestamp: string; email: string },
): Promise<CandidateCheck> {
  const name = (input.name ?? "").trim();
  const timestamp = (input.timestamp ?? "").trim();
  const email = normalizeEmail(input.email ?? "");

  if (!name || !timestamp) {
    return { ok: false, status: 400, error: "Missing candidate selection" };
  }
  if (!email || !email.includes("@")) {
    return { ok: false, status: 400, error: "Invalid email" };
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
      const rowName = normalizeKeyPart(pickString(record[nameCol]) ?? "");
      const rowTs = normalizeKeyPart(pickString(record[tsCol]) ?? "");
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
    return {
      ok: false,
      status: 500,
      error: "Assessment access is not configured. Please contact the administrator.",
    };
  }
  if (!foundCandidateRow) {
    return { ok: false, status: 404, error: "Wrong email, please try again !" };
  }
  if (!matchedEmail) {
    return { ok: false, status: 403, error: "Wrong email, please try again !" };
  }
  return { ok: true, email: matchedEmail };
}
