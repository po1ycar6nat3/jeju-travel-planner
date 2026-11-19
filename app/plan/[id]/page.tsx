import { Suspense } from "react";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PlannerWorkspace, { PlaceItem } from "@/components/PlannerWorkspace";

const MEMBERS_META_ID = -999999;

function extractPlacesAndMembers(rawPlaces: unknown): {
  places: PlaceItem[];
  members: string[];
} {
  if (!Array.isArray(rawPlaces)) {
    return { places: [], members: [] };
  }

  const places: PlaceItem[] = [];
  const memberSet = new Set<string>();

  for (const item of rawPlaces) {
    if (!item || typeof item !== "object") continue;
    const record = item as PlaceItem & { members?: unknown };

    if (record.id === MEMBERS_META_ID || record.title === "__MEMBERS__") {
      if (Array.isArray(record.members)) {
        for (const m of record.members) {
          if (typeof m === "string" && m.trim()) {
            memberSet.add(m.trim());
          }
        }
      }
      continue;
    }

    places.push(record);

    if (typeof record.createdBy === "string" && record.createdBy.trim() && record.createdBy !== "익명") {
      memberSet.add(record.createdBy.trim());
    }
  }

  return {
    places,
    members: Array.from(memberSet),
  };
}

async function SharedPlanContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data, error } = await supabase
    .from("travel_plans")
    .select("id, title, places")
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const { places, members } = extractPlacesAndMembers(data.places);

  return (
    <PlannerWorkspace
      planId={data.id}
      initialTitle={data.title || "나의 제주 여행 일정"}
      initialPlaces={places}
      initialMembers={members}
    />
  );
}

export default function SharedPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="h-screen w-screen flex items-center justify-center text-sm text-gray-500">
          일정을 불러오는 중...
        </div>
      }
    >
      <SharedPlanContent params={params} />
    </Suspense>
  );
}