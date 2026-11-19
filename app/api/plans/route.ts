import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const places = Array.isArray(body?.places) ? body.places : [];
    const title =
      typeof body?.title === "string" && body.title.trim()
        ? body.title.trim()
        : "나의 제주 여행 일정";

    const { data, error } = await supabase
      .from("travel_plans")
      .insert([{ title, places }])
      .select("id, title, places, created_at")
      .single();

    if (error) {
      console.error("Supabase 저장 오류:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data.id, plan: data }, { status: 201 });
  } catch (err) {
    console.error("POST /api/plans 오류:", err);
    return NextResponse.json({ error: "일정 저장 실패" }, { status: 500 });
  }
}
