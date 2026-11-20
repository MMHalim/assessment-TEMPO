import { NextResponse } from "next/server";
import { getCompetencyDb, jsonError } from "@/lib/competencyDb.server";

export const dynamic = "force-dynamic";

export async function GET() {
  const conn = getCompetencyDb();
  if ("error" in conn) return conn.error;
  const { data, error } = await conn.db
    .from("competency_attempts")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(5000);
  if (error) return jsonError(error.message);
  return NextResponse.json({ ok: true, attempts: data ?? [] });
}
