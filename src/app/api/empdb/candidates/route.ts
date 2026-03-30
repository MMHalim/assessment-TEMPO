import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseClient";

type CandidateListItem = {
  name: string;
  timestamp: string;
  submitted: boolean;
};

function pickString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Missing Supabase environment" },
      { status: 500 },
    );
  }

  const tableAttempts = ["empDB", "intRltdTo"] as const;
  const attempts = [
    { nameCol: "Name", tsCol: "Timestamp", emailCol: "Email" },
    { nameCol: "Name", tsCol: "Timestamp", emailCol: "Email_Address" },
    { nameCol: "name", tsCol: "timestamp", emailCol: "email" },
    { nameCol: "name", tsCol: "timestamp", emailCol: "email_address" },
  ] as const;

  for (const tableName of tableAttempts) {
    for (const { nameCol, tsCol, emailCol } of attempts) {
      const { data, error } = await supabase
        .from(tableName)
        .select(`${nameCol},${tsCol},${emailCol}`)
        .limit(5000);

      if (error) continue;

      const rowsWithEmail: Array<CandidateListItem & { email: string }> = (data ?? [])
        .map((row) => {
          const r = row as Record<string, unknown>;
          const name = pickString(r[nameCol]);
          const timestamp = pickString(r[tsCol]);
          const rawEmail = pickString(r[emailCol]);
          if (!name || !timestamp) return null;
          const email = rawEmail ? normalizeEmail(rawEmail) : "";
          if (!email) return null;
          return { name: name.trim(), timestamp, email, submitted: false };
        })
        .filter(
          (v): v is CandidateListItem & { email: string } => v != null,
        );

      const emailList = Array.from(
        new Set(rowsWithEmail.map((r) => r.email).filter(Boolean)),
      );

      const submittedEmails = new Set<string>();
      if (emailList.length > 0) {
        const { data: submittedRows, error: submittedError } = await supabase
          .from("assessment_attempts")
          .select("candidate_email")
          .in("candidate_email", emailList)
          .not("completed_at", "is", null);

        if (!submittedError) {
          for (const row of submittedRows ?? []) {
            const email = pickString(
              (row as Record<string, unknown>)["candidate_email"],
            );
            if (email) submittedEmails.add(normalizeEmail(email));
          }
        }
      }

      const items: CandidateListItem[] = rowsWithEmail.map((r) => ({
        name: r.name,
        timestamp: r.timestamp,
        submitted: submittedEmails.has(r.email),
      }));

      const unique = new Map<string, CandidateListItem>();
      for (const item of items) {
        unique.set(`${item.timestamp}::${item.name}`, item);
      }

      if (unique.size > 0) {
        return NextResponse.json({
          ok: true,
          candidates: Array.from(unique.values()),
          sourceTable: tableName,
        });
      }
    }
  }

  return NextResponse.json(
    {
      ok: false,
      error:
        "Could not read candidates from empDB/intRltdTo. Check RLS/policies and column names.",
    },
    { status: 500 },
  );
}
