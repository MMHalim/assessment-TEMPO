"use server";

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseClient";

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Missing Supabase environment" }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  const password = String(body?.password ?? "");
  if (!password) {
    return NextResponse.json({ ok: false, error: "Missing password" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("verify_admin_password", { p_password: password });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, valid: Boolean(data) });
}
