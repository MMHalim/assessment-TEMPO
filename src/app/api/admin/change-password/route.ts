"use server";

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseClient";

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Missing Supabase environment" }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as
    | { currentPassword?: string; newPassword?: string }
    | null;

  const currentPassword = String(body?.currentPassword ?? "");
  const newPassword = String(body?.newPassword ?? "");
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ ok: false, error: "Missing password fields" }, { status: 400 });
  }
  if (newPassword.length < 10) {
    return NextResponse.json({ ok: false, error: "New password must be at least 10 characters" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("set_admin_password", {
    p_current: currentPassword,
    p_new: newPassword,
  });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ ok: false, error: "Current password is incorrect" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
