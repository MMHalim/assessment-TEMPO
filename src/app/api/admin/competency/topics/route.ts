import { NextResponse } from "next/server";
import { getCompetencyDb, jsonError } from "@/lib/competencyDb.server";

export const dynamic = "force-dynamic";

export async function GET() {
  const conn = getCompetencyDb();
  if ("error" in conn) return conn.error;
  const { data, error } = await conn.db
    .from("competency_topics")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return jsonError(error.message);
  return NextResponse.json({ ok: true, topics: data ?? [] });
}

export async function POST(request: Request) {
  const conn = getCompetencyDb();
  if ("error" in conn) return conn.error;
  const body = (await request.json().catch(() => null)) as { title?: string; description?: string } | null;
  const title = (body?.title ?? "").trim();
  const description = (body?.description ?? "").trim();
  if (!title) return jsonError("Topic title is required.", 400);

  const { data, error } = await conn.db
    .from("competency_topics")
    .insert({ title, description: description || null })
    .select("*")
    .single();
  if (error) return jsonError(error.message);
  return NextResponse.json({ ok: true, topic: data });
}

export async function PATCH(request: Request) {
  const conn = getCompetencyDb();
  if ("error" in conn) return conn.error;
  const body = (await request.json().catch(() => null)) as
    | { id?: string; title?: string; description?: string | null; active?: boolean }
    | null;
  const id = body?.id ?? "";
  if (!id) return jsonError("Missing topic id.", 400);

  const patch: Record<string, unknown> = {};
  if (typeof body?.title === "string") {
    if (!body.title.trim()) return jsonError("Topic title is required.", 400);
    patch.title = body.title.trim();
  }
  if (body?.description !== undefined) patch.description = (body.description ?? "").trim() || null;
  if (typeof body?.active === "boolean") patch.active = body.active;

  const { data, error } = await conn.db.from("competency_topics").update(patch).eq("id", id).select("*").single();
  if (error) return jsonError(error.message);
  return NextResponse.json({ ok: true, topic: data });
}

export async function DELETE(request: Request) {
  const conn = getCompetencyDb();
  if ("error" in conn) return conn.error;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return jsonError("Missing topic id.", 400);

  // Past attempts keep their topic_title, so deleting a topic does not lose results.
  const { error } = await conn.db.from("competency_topics").delete().eq("id", id);
  if (error) return jsonError(error.message);
  return NextResponse.json({ ok: true });
}
