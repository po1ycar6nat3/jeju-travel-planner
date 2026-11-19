import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const { data, error } = await supabase
    .from("travel_plans")
    .select("id, title, places, created_at, updated_at")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ plan: data });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const body = await request.json();
    const updates: { title?: string; places?: unknown[]; updated_at: string } = {
      updated_at: new Date().toISOString(),
    };

    if (typeof body?.title === "string" && body.title.trim()) {
      updates.title = body.title.trim();
    }
    if (Array.isArray(body?.places)) {
      updates.places = body.places;
    }

    const { data, error } = await supabase
      .from("travel_plans")
      .update(updates)
      .eq("id", id)
      .select("id, title, places, updated_at")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "일정 수정 실패" }, { status: 400 });
    }

    return NextResponse.json({ plan: data });
  } catch (err) {
    console.error("PATCH /api/plans/[id] 오류:", err);
    return NextResponse.json({ error: "일정 수정 중 오류" }, { status: 500 });
  }
}
