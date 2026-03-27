import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseClient";

type CandidateListItem = {
  name: string;
  email: string;
  timestamp: string;
  source: string | null;
};

function pickString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Missing Supabase environment" },
      { status: 500 },
    );
  }

  const attempts = [
    { nameCol: "Name", emailCol: "Email_Address", tsCol: "Timestamp", sourceCol: "How_did_you_hear_about_the_Job_post_offer" },
    { nameCol: "Name", emailCol: "Email", tsCol: "Timestamp", sourceCol: "How_did_you_hear_about_the_Job_post_offer" },
    { nameCol: "name", emailCol: "email", tsCol: "timestamp", sourceCol: "How_did_you_hear_about_the_Job_post_offer" },
  ] as const;

  for (const { nameCol, emailCol, tsCol, sourceCol } of attempts) {
    const { data, error } = await supabase
      .from("empDB")
      .select(`${nameCol},${emailCol},${tsCol},${sourceCol}`)
      .limit(5000);

    if (error) continue;

    const items: CandidateListItem[] = (data ?? [])
      .map((row) => {
        const r = row as Record<string, unknown>;
        const name = pickString(r[nameCol]);
        const email = pickString(r[emailCol]);
        const timestamp = pickString(r[tsCol]);
        const source = pickString(r[sourceCol]);
        if (!name || !email || !timestamp) return null;
        return { name: name.trim(), email: email.trim(), timestamp, source: source ? source.trim() : null };
      })
      .filter((v): v is CandidateListItem => v != null);

    const unique = new Map<string, CandidateListItem>();
    for (const item of items) {
      unique.set(`${item.timestamp}::${item.email}::${item.name}`, item);
    }

    if (unique.size > 0) {
      return NextResponse.json({
        ok: true,
        candidates: Array.from(unique.values()),
      });
    }
  }

  return NextResponse.json(
    {
      ok: false,
      error: "Could not read candidates from empDB.",
    },
    { status: 500 },
  );
}
