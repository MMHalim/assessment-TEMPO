import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseClient";

type CandidateListItem = {
  name: string;
  timestamp: string;
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

  const tableAttempts = ["empDB", "intRltdTo"] as const;
  const attempts = [
    { nameCol: "Name", tsCol: "Timestamp" },
    { nameCol: "name", tsCol: "timestamp" },
  ] as const;

  for (const tableName of tableAttempts) {
    for (const { nameCol, tsCol } of attempts) {
      const { data, error } = await supabase
        .from(tableName)
        .select(`${nameCol},${tsCol}`)
        .limit(5000);

      if (error) continue;

      const items: CandidateListItem[] = (data ?? [])
        .map((row) => {
          const r = row as Record<string, unknown>;
          const name = pickString(r[nameCol]);
          const timestamp = pickString(r[tsCol]);
          if (!name || !timestamp) return null;
          return { name: name.trim(), timestamp };
        })
        .filter((v): v is CandidateListItem => v != null);

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
