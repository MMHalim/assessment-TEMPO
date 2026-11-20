// Server-only helpers for the English Competency tables.
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabaseClient";

/**
 * The competency tables have RLS enabled with no policies, so they are only
 * reachable with the service role key.
 */
export function getCompetencyDb(): { db: SupabaseClient } | { error: NextResponse } {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      error: NextResponse.json(
        { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not configured on the server." },
        { status: 500 },
      ),
    };
  }
  const db = getSupabaseServerClient();
  if (!db) {
    return { error: NextResponse.json({ ok: false, error: "Server is not configured." }, { status: 500 }) };
  }
  return { db };
}

export function jsonError(error: string, status = 500) {
  return NextResponse.json({ ok: false, error }, { status });
}

export type CompetencyAttemptRow = {
  id: string;
  candidate_name: string;
  candidate_email: string;
  topic_id: string | null;
  topic_title: string | null;
  status: "started" | "followup" | "completed";
  transcript: string | null;
  metrics: unknown;
  followup_question: string | null;
  followup_transcript: string | null;
  followup_metrics: unknown;
  report: unknown;
  overall_score: number | null;
  cefr_level: string | null;
  started_at: string;
  completed_at: string | null;
};
