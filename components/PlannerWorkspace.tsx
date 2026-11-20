"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

declare global {
  interface Window {
    naver: any;
  }
}

export type PlaceCategory = "restaurant" | "cafe" | "sightseeing" | "activity";

export interface PlaceItem {
  id: number;
  lat: number;
  lng: number;
  title: string;
  memo: string;
  createdBy?: string;
  categoryType?: PlaceCategory;
  isMustVisit?: boolean;
}

export interface ScheduleSlotItem {
  id: string;
  dayIndex: number;
  timeSlot: string;
  placeId: number;
  title: string;
  memo?: string;
  categoryType?: PlaceCategory;
  isMustVisit?: boolean;
  createdBy?: string;
}

export interface TripScheduleConfig {
  startDateTime: string;
  endDateTime: string;
  items: ScheduleSlotItem[];
}

export interface PlanSummaryItem {
  id: string;
  title: string;
  startDateTime?: string;
  endDateTime?: string;
  placesCount: number;
  updatedAt?: string;
}

interface CandidatePlace {
  title: string;
  category?: string;
  address: string;
  lat: number;
  lng: number;
}

interface PlannerWorkspaceProps {
  planId?: string;
  initialTitle?: string;
  initialPlaces?: PlaceItem[];
  initialMembers?: string[];
}

type PlanGateMode = "choose" | "existing" | "new";
type UserGateMode = "choose" | "existing" | "new";
type WorkspaceViewMode = "map" | "schedule";
type MarkerDisplayMode = "full" | "compact" | "hidden";

interface CategoryStyle {
  label: string;
  icon: string;
  pinBg: string;
  pinBorder: string;
  pinText: string;
  badgeBg: string;
  cardBorder: string;
  cardHoverBorder: string;
  cardSelectedBg: string;
}

const CATEGORY_STYLES: Record<PlaceCategory, CategoryStyle> = {
  restaurant: {
    label: "식당",
    icon: "🍽️",
    pinBg: "#fff7ed",
    pinBorder: "#ea580c",
    pinText: "#9a3412",
    badgeBg: "bg-orange-100 text-orange-800 border-orange-200",
    cardBorder: "border-orange-200/90",
    cardHoverBorder: "hover:border-orange-400",
    cardSelectedBg: "bg-orange-50/40",
  },
  cafe: {
    label: "카페",
    icon: "☕",
    pinBg: "#fdf2f8",
    pinBorder: "#db2777",
    pinText: "#9d174d",
    badgeBg: "bg-pink-100 text-pink-800 border-pink-200",
    cardBorder: "border-pink-200/90",
    cardHoverBorder: "hover:border-pink-400",
    cardSelectedBg: "bg-pink-50/40",
  },
  sightseeing: {
    label: "관광",
    icon: "📷",
    pinBg: "#eff6ff",
    pinBorder: "#2563eb",
    pinText: "#1e40af",
    badgeBg: "bg-blue-100 text-blue-800 border-blue-200",
    cardBorder: "border-blue-200/90",
    cardHoverBorder: "hover:border-blue-400",
    cardSelectedBg: "bg-blue-50/40",
  },
  activity: {
    label: "액티비티",
    icon: "⚡",
    pinBg: "#f5f3ff",
    pinBorder: "#7c3aed",
    pinText: "#5b21b6",
    badgeBg: "bg-violet-100 text-violet-800 border-violet-200",
    cardBorder: "border-violet-200/90",
    cardHoverBorder: "hover:border-violet-400",
    cardSelectedBg: "bg-violet-50/40",
  },
};

const CATEGORY_ORDER: PlaceCategory[] = [
  "restaurant",
  "cafe",
  "sightseeing",
  "activity",
];

const TIME_SLOTS = [
  "07:00",
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00",
  "22:00",
];

const FALLBACK_START_DT = "2026-11-22T09:00";
const FALLBACK_END_DT = "2026-11-24T20:00";
const MEMBERS_META_ID = -999999;

function formatInputDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getDefaultTripRange(): { startDateTime: string; endDateTime: string } {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 24 * 60 * 60 * 1000);
  end.setHours(20, 0, 0, 0);
  return {
    startDateTime: formatInputDateTimeLocal(start),
    endDateTime: formatInputDateTimeLocal(end),
  };
}

function computeTripDays(
  startDateTime?: string,
  endDateTime?: string
): Array<{ dayIndex: number; dateLabel: string; weekdayLabel: string }> {
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const start = startDateTime ? new Date(startDateTime) : null;
  const end = endDateTime ? new Date(endDateTime) : null;

  if (
    !start ||
    !end ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    return [
      { dayIndex: 1, dateLabel: "1일차", weekdayLabel: "" },
      { dayIndex: 2, dateLabel: "2일차", weekdayLabel: "" },
      { dayIndex: 3, dateLabel: "3일차", weekdayLabel: "" },
    ];
  }

  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const diffDays = Math.floor(
    (endDay.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000)
  );
  const totalDays = Math.max(1, Math.min(30, diffDays + 1));

  return Array.from({ length: totalDays }, (_, idx) => {
    const d = new Date(startDay.getTime() + idx * 24 * 60 * 60 * 1000);
    return {
      dayIndex: idx + 1,
      dateLabel: `${d.getMonth() + 1}/${d.getDate()}`,
      weekdayLabel: weekdays[d.getDay()] || "",
    };
  });
}

function formatDateTimeDisplay(dt?: string): string {
  if (!dt) return "";
  const parsed = new Date(dt);
  if (Number.isNaN(parsed.getTime())) return dt;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parsed.getMonth() + 1}/${parsed.getDate()} ${pad(parsed.getHours())}:${pad(
    parsed.getMinutes()
  )}`;
}

function inferCategoryType(rawCategory?: string, title?: string): PlaceCategory {
  const text = `${rawCategory || ""} ${title || ""}`.toLowerCase();
  if (/카페|커피|디저트|베이커리|제과|마카롱|와플|빙수|tea|cafe|coffee/.test(text)) {
    return "cafe";
  }
  if (
    /액티비티|레저|스포츠|체험|서핑|카약|패러글라이딩|승마|다이빙|스노클링|카트|짚라인|요트|낚시|수상/.test(
      text
    )
  ) {
    return "activity";
  }
  if (
    /관광|명소|해수욕장|해변|오름|폭포|공원|전망대|박물관|미술관|수목원|유적|사찰|성당|일출봉|올레/.test(
      text
    )
  ) {
    return "sightseeing";
  }
  return "restaurant";
}

function getPlaceCategory(place: {
  categoryType?: PlaceCategory;
  title?: string;
}): PlaceCategory {
  if (place.categoryType && CATEGORY_STYLES[place.categoryType]) {
    return place.categoryType;
  }
  return inferCategoryType(undefined, place.title || "");
}

function isMembersMetaPlace(place: { id?: number; title?: string }): boolean {
  return place.id === MEMBERS_META_ID || place.title === "__MEMBERS__";
}

function parsePlanPayload(
  rawPlaces: unknown,
  rawMembers?: unknown,
  rawDeletedMembers?: unknown
): {
  parsedPlaces: PlaceItem[];
  parsedMembers: string[];
  parsedDeletedMembers: string[];
  parsedSchedule: TripScheduleConfig;
} {
  const realPlaces: PlaceItem[] = [];
  let metaMembers: string[] = [];
  let metaDeletedMembers: string[] = [];
  let schedule: TripScheduleConfig = {
    startDateTime: FALLBACK_START_DT,
    endDateTime: FALLBACK_END_DT,
    items: [],
  };

  if (Array.isArray(rawPlaces)) {
    for (const item of rawPlaces) {
      if (!item || typeof item !== "object") continue;
      const candidate = item as PlaceItem & {
        members?: unknown;
        deletedMembers?: unknown;
        scheduleConfig?: unknown;
      };
      if (isMembersMetaPlace(candidate)) {
        if (Array.isArray(candidate.members)) {
          metaMembers = candidate.members.filter(
            (m): m is string => typeof m === "string" && Boolean(m.trim())
          );
        }
        if (Array.isArray(candidate.deletedMembers)) {
          metaDeletedMembers = candidate.deletedMembers.filter(
            (m): m is string => typeof m === "string" && Boolean(m.trim())
          );
        }
        if (candidate.scheduleConfig && typeof candidate.scheduleConfig === "object") {
          const cfg = candidate.scheduleConfig as Partial<TripScheduleConfig>;
          schedule = {
            startDateTime:
              typeof cfg.startDateTime === "string" && cfg.startDateTime
                ? cfg.startDateTime
                : FALLBACK_START_DT,
            endDateTime:
              typeof cfg.endDateTime === "string" && cfg.endDateTime
                ? cfg.endDateTime
                : FALLBACK_END_DT,
            items: Array.isArray(cfg.items)
              ? cfg.items.filter(
                  (it): it is ScheduleSlotItem =>
                    Boolean(it) &&
                    typeof it.id === "string" &&
                    typeof it.dayIndex === "number" &&
                    typeof it.timeSlot === "string" &&
                    typeof it.title === "string"
                )
              : [],
          };
        }
      } else if (
        typeof candidate.id === "number" &&
        typeof candidate.lat === "number" &&
        typeof candidate.lng === "number" &&
        typeof candidate.title === "string"
      ) {
        realPlaces.push({
          id: candidate.id,
          lat: candidate.lat,
          lng: candidate.lng,
          title: candidate.title,
          memo: typeof candidate.memo === "string" ? candidate.memo : "",
          createdBy:
            typeof candidate.createdBy === "string" && candidate.createdBy.trim()
              ? candidate.createdBy.trim()
              : "익명",
          categoryType: candidate.categoryType,
          isMustVisit: Boolean(candidate.isMustVisit),
        });
      }
    }
  }

  const directMembers = Array.isArray(rawMembers)
    ? rawMembers.filter((m): m is string => typeof m === "string" && Boolean(m.trim()))
    : [];
  const directDeleted = Array.isArray(rawDeletedMembers)
    ? rawDeletedMembers.filter((m): m is string => typeof m === "string" && Boolean(m.trim()))
    : [];

  const mergedDeleted = Array.from(new Set([...directDeleted, ...metaDeletedMembers]));
  const deletedSet = new Set(mergedDeleted);
  const mergedMembers = Array.from(new Set([...directMembers, ...metaMembers])).filter(
    (name) => !deletedSet.has(name)
  );

  return {
    parsedPlaces: realPlaces,
    parsedMembers: mergedMembers,
    parsedDeletedMembers: mergedDeleted,
    parsedSchedule: schedule,
  };
}

function buildNaverMapCoordUrl(title: string, lat: number, lng: number): string {
  const safeTitle = title.trim();
  if (safeTitle) {
    return `https://map.naver.com/v5/search/${encodeURIComponent(
      safeTitle
    )}?c=${lng},${lat},16,0,0,0,dh`;
  }
  return `https://map.naver.com/v5/?c=${lng},${lat},16,0,0,0,dh`;
}

function getKnownPlansKey(): string {
  return "jeju_planner_known_plans_v1";
}

function loadKnownPlans(): PlanSummaryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getKnownPlansKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is PlanSummaryItem =>
            Boolean(item) && typeof item.id === "string" && typeof item.title === "string"
        )
      : [];
  } catch {
    return [];
  }
}

function saveKnownPlans(list: PlanSummaryItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getKnownPlansKey(), JSON.stringify(list));
  } catch {
    // 무시
  }
}

function upsertKnownPlan(summary: PlanSummaryItem): PlanSummaryItem[] {
  const next = [summary, ...loadKnownPlans().filter((item) => item.id !== summary.id)];
  saveKnownPlans(next);
  return next;
}

function removeKnownPlan(id: string): PlanSummaryItem[] {
  const next = loadKnownPlans().filter((item) => item.id !== id);
  saveKnownPlans(next);
  return next;
}

function mergeMembers(
  initialMembers: string[] = [],
  places: PlaceItem[] = [],
  deletedMembers: string[] = []
): string[] {
  const deletedSet = new Set(deletedMembers.map((m) => m.trim()).filter(Boolean));
  const fromPlaces = places
    .filter((p) => !isMembersMetaPlace(p))
    .map((p) => p.createdBy?.trim())
    .filter((name): name is string => Boolean(name) && name !== "익명");

  return Array.from(
    new Set([...initialMembers.map((m) => m.trim()).filter(Boolean), ...fromPlaces])
  ).filter((name) => !deletedSet.has(name));
}

export default function PlannerWorkspace({
  planId,
  initialTitle = "나의 제주 여행 일정",
  initialPlaces = [],
  initialMembers = [],
}: PlannerWorkspaceProps) {
  const router = useRouter();

  const [showPlanGate, setShowPlanGate] = useState<boolean>(() => !planId);
  const [planGateMode, setPlanGateMode] = useState<PlanGateMode>("choose");
  const [knownPlans, setKnownPlans] = useState<PlanSummaryItem[]>(() => loadKnownPlans());
  const [newPlanTitle, setNewPlanTitle] = useState("제주 여행 일정");
  const [newStartDateTime, setNewStartDateTime] = useState(FALLBACK_START_DT);
  const [newEndDateTime, setNewEndDateTime] = useState(FALLBACK_END_DT);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);

  const [currentPlanId, setCurrentPlanId] = useState<string | undefined>(planId);
  const [planTitle, setPlanTitle] = useState(initialTitle);
  const [places, setPlaces] = useState<PlaceItem[]>(() =>
    parsePlanPayload(initialPlaces, initialMembers).parsedPlaces
  );
  const [scheduleConfig, setScheduleConfig] = useState<TripScheduleConfig>(() =>
    parsePlanPayload(initialPlaces, initialMembers).parsedSchedule
  );
  const [deletedMembers, setDeletedMembers] = useState<string[]>([]);
  const [members, setMembers] = useState<string[]>(() =>
    parsePlanPayload(initialPlaces, initialMembers).parsedMembers
  );

  const [activeUser, setActiveUser] = useState<string | null>(null);
  const [userGateMode, setUserGateMode] = useState<UserGateMode>("choose");
  const [newUserName, setNewUserName] = useState("");
  const [showUserGate, setShowUserGate] = useState<boolean>(() => Boolean(planId));

  const [viewMode, setViewMode] = useState<WorkspaceViewMode>("map");
  const [activeDayIndex, setActiveDayIndex] = useState<number>(1);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>("09:00");

  const [mapInstance, setMapInstance] = useState<any>(null);
  const [markersRef, setMarkersRef] = useState<any[]>([]);
  const [mapAuthError, setMapAuthError] = useState<boolean>(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<number | null>(null);
  const [memoDrafts, setMemoDrafts] = useState<Record<number, string>>({});
  const [editingCategoryPlaceId, setEditingCategoryPlaceId] = useState<number | null>(null);
  const [hoveredPlaceTitle, setHoveredPlaceTitle] = useState<string | null>(null);
  const [markerDisplayMode, setMarkerDisplayMode] = useState<MarkerDisplayMode>("full");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<CandidatePlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [selectedCategories, setSelectedCategories] = useState<PlaceCategory[]>([]);
  const [onlyMustVisitFilter, setOnlyMustVisitFilter] = useState(false);
  const [selectedUserFilter, setSelectedUserFilter] = useState<string | null>(null);
  const [isUserFilterOpen, setIsUserFilterOpen] = useState(false);

  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );

  const [draftPlace, setDraftPlace] = useState<CandidatePlace | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftMemo, setDraftMemo] = useState("");
  const [draftCategory, setDraftCategory] = useState<PlaceCategory>("sightseeing");
  const [draftMustVisit, setDraftMustVisit] = useState(false);

  const currentPlanIdRef = useRef<string | undefined>(currentPlanId);
  const isApplyingRemoteRef = useRef(false);
  const memoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousViewportRef = useRef<{ lat: number; lng: number; zoom: number } | null>(
    null
  );

  useEffect(() => {
    currentPlanIdRef.current = currentPlanId;
  }, [currentPlanId]);

  useEffect(() => {
    const range = getDefaultTripRange();
    setNewStartDateTime(range.startDateTime);
    setNewEndDateTime(range.endDateTime);
  }, []);

  const visiblePlaces = useMemo(
    () => places.filter((p) => !isMembersMetaPlace(p)),
    [places]
  );

  const tripDays = useMemo(
    () => computeTripDays(scheduleConfig.startDateTime, scheduleConfig.endDateTime),
    [scheduleConfig.startDateTime, scheduleConfig.endDateTime]
  );

  const placesMapSignature = useMemo(
    () =>
      visiblePlaces
        .map(
          (p) =>
            `${p.id}:${p.lat}:${p.lng}:${p.title}:${getPlaceCategory(p)}:${
              p.isMustVisit ? 1 : 0
            }`
        )
        .join("|"),
    [visiblePlaces]
  );

  useEffect(() => {
    setMemoDrafts((prev) => {
      const next: Record<number, string> = {};
      for (const p of visiblePlaces) {
        next[p.id] = prev[p.id] !== undefined ? prev[p.id] : p.memo;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesMapSignature]);

  useEffect(() => {
    return () => {
      if (memoSaveTimerRef.current) clearTimeout(memoSaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (tripDays.length > 0 && activeDayIndex > tripDays.length) {
      setActiveDayIndex(tripDays.length);
    } else if (activeDayIndex < 1) {
      setActiveDayIndex(1);
    }
  }, [activeDayIndex, tripDays.length]);

  const filteredPlaces = useMemo(
    () =>
      visiblePlaces.filter((place) => {
        const matchesCategory =
          selectedCategories.length === 0 ||
          selectedCategories.includes(getPlaceCategory(place));
        const matchesMustVisit = !onlyMustVisitFilter || Boolean(place.isMustVisit);
        const matchesUser =
          selectedUserFilter === null ||
          (place.createdBy || "익명") === selectedUserFilter;
        return matchesCategory && matchesMustVisit && matchesUser;
      }),
    [visiblePlaces, selectedCategories, onlyMustVisitFilter, selectedUserFilter]
  );

  const filterableUsers = useMemo(
    () => mergeMembers(members, visiblePlaces, deletedMembers),
    [members, visiblePlaces, deletedMembers]
  );

  const currentDayScheduleItems = useMemo(
    () =>
      (scheduleConfig.items || []).filter((item) => item.dayIndex === activeDayIndex),
    [scheduleConfig.items, activeDayIndex]
  );

  const refreshAllPlansList = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("travel_plans")
        .select("id, title, places, updated_at")
        .order("updated_at", { ascending: false })
        .limit(30);

      if (!error && Array.isArray(data)) {
        const mapped: PlanSummaryItem[] = data
          .filter((row) => row && typeof row.id === "string")
          .map((row) => {
            const parsed = parsePlanPayload(row.places);
            return {
              id: row.id,
              title:
                typeof row.title === "string" && row.title.trim()
                  ? row.title
                  : "제목 없는 여행",
              startDateTime: parsed.parsedSchedule.startDateTime,
              endDateTime: parsed.parsedSchedule.endDateTime,
              placesCount: parsed.parsedPlaces.length,
              updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
            };
          });
        setKnownPlans(mapped);
        saveKnownPlans(mapped);
      }
    } catch (err) {
      console.error("여행 목록 조회 실패:", err);
    }
  }, []);

  useEffect(() => {
    if (showPlanGate && planGateMode === "existing") {
      refreshAllPlansList();
    }
  }, [showPlanGate, planGateMode, refreshAllPlansList]);

  const loadSinglePlan = useCallback(async (targetId: string) => {
    currentPlanIdRef.current = targetId;
    setCurrentPlanId(targetId);
    setSelectedPlaceId(null);
    setDraftPlace(null);
    setSearchResults([]);
    setSyncStatus("saving");

    try {
      const { data, error } = await supabase
        .from("travel_plans")
        .select("*")
        .eq("id", targetId)
        .maybeSingle();

      if (error) throw error;

      isApplyingRemoteRef.current = true;
      if (data) {
        const {
          parsedPlaces,
          parsedMembers,
          parsedDeletedMembers,
          parsedSchedule,
        } = parsePlanPayload(data.places, data.members);

        const nextTitle =
          typeof data.title === "string" && data.title.trim()
            ? data.title
            : "나의 제주 여행 일정";

        setPlanTitle(nextTitle);
        setPlaces(parsedPlaces);
        setScheduleConfig(parsedSchedule);
        setDeletedMembers(parsedDeletedMembers);
        setMembers(mergeMembers(parsedMembers, parsedPlaces, parsedDeletedMembers));
        setKnownPlans(
          upsertKnownPlan({
            id: targetId,
            title: nextTitle,
            startDateTime: parsedSchedule.startDateTime,
            endDateTime: parsedSchedule.endDateTime,
            placesCount: parsedPlaces.length,
            updatedAt: data.updated_at,
          })
        );
      } else {
        setPlaces([]);
        setScheduleConfig({
          startDateTime: FALLBACK_START_DT,
          endDateTime: FALLBACK_END_DT,
          items: [],
        });
        setDeletedMembers([]);
        setMembers([]);
      }
      setSyncStatus("saved");
    } catch (err) {
      console.error("일정 불러오기 실패:", err);
      setSyncStatus("error");
    } finally {
      setTimeout(() => {
        isApplyingRemoteRef.current = false;
      }, 150);
    }
  }, []);

  useEffect(() => {
    if (planId) {
      setShowPlanGate(false);
      setShowUserGate(true);
      loadSinglePlan(planId);
    }
  }, [planId, loadSinglePlan]);

  const commitPlanState = useCallback(
    async (params: {
      title?: string;
      places?: PlaceItem[];
      members?: string[];
      deletedMembers?: string[];
      schedule?: TripScheduleConfig;
      planIdOverride?: string;
    }) => {
      const targetId = params.planIdOverride || currentPlanIdRef.current;
      const nextTitle = params.title ?? planTitle;
      const nextPlaces = (params.places ?? visiblePlaces).filter(
        (p) => !isMembersMetaPlace(p)
      );
      const nextDeleted = params.deletedMembers ?? deletedMembers;
      const nextMembers = params.members ?? members;
      const nextSchedule = params.schedule ?? scheduleConfig;

      let savedId = targetId;
      setSyncStatus("saving");
      try {
        const payload = {
          title: nextTitle,
          places: [
            ...nextPlaces,
            {
              id: MEMBERS_META_ID,
              lat: 0,
              lng: 0,
              title: "__MEMBERS__",
              memo: "",
              members: nextMembers,
              deletedMembers: nextDeleted,
              scheduleConfig: nextSchedule,
            },
          ],
          members: nextMembers,
        };

        if (savedId) {
          const res = await fetch(`/api/plans/${savedId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error("일정 저장 실패");
        } else {
          const res = await fetch("/api/plans", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error("일정 생성 실패");
          const created = await res.json();
          if (created?.id) {
            savedId = created.id;
            currentPlanIdRef.current = created.id;
            setCurrentPlanId(created.id);
            router.replace(`/plan/${created.id}`);
          }
        }

        if (savedId) {
          setKnownPlans(
            upsertKnownPlan({
              id: savedId,
              title: nextTitle,
              startDateTime: nextSchedule.startDateTime,
              endDateTime: nextSchedule.endDateTime,
              placesCount: nextPlaces.length,
              updatedAt: new Date().toISOString(),
            })
          );
        }

        setSyncStatus("saved");
        return savedId;
      } catch (err) {
        console.error("저장 오류:", err);
        setSyncStatus("error");
        return savedId;
      }
    },
    [planTitle, visiblePlaces, deletedMembers, members, scheduleConfig, router]
  );

  const handleCreateNewTripPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = newPlanTitle.trim() || "제주 여행 일정";
    const effectiveStart = newStartDateTime || getDefaultTripRange().startDateTime;
    const effectiveEnd = newEndDateTime || getDefaultTripRange().endDateTime;

    if (new Date(effectiveEnd).getTime() < new Date(effectiveStart).getTime()) {
      alert("종료 날짜/시간이 시작 날짜/시간보다 빠를 수 없습니다.");
      return;
    }

    setIsCreatingPlan(true);
    try {
      const initialSchedule: TripScheduleConfig = {
        startDateTime: effectiveStart,
        endDateTime: effectiveEnd,
        items: [],
      };

      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          places: [
            {
              id: MEMBERS_META_ID,
              lat: 0,
              lng: 0,
              title: "__MEMBERS__",
              memo: "",
              members: [],
              deletedMembers: [],
              scheduleConfig: initialSchedule,
            },
          ],
          members: [],
        }),
      });
      if (!res.ok) throw new Error("여행 일정 생성 실패");
      const created = await res.json();
      const createdId = created?.id as string | undefined;

      currentPlanIdRef.current = createdId;
      setCurrentPlanId(createdId);
      setPlanTitle(trimmedTitle);
      setPlaces([]);
      setMemoDrafts({});
      setScheduleConfig(initialSchedule);
      setMembers([]);
      setDeletedMembers([]);
      setActiveUser(null);
      setActiveDayIndex(1);
      setViewMode("map");

      if (createdId) {
        setKnownPlans(
          upsertKnownPlan({
            id: createdId,
            title: trimmedTitle,
            startDateTime: effectiveStart,
            endDateTime: effectiveEnd,
            placesCount: 0,
            updatedAt: new Date().toISOString(),
          })
        );
        router.replace(`/plan/${createdId}`);
      }

      setShowPlanGate(false);
      setUserGateMode("choose");
      setShowUserGate(true);
    } catch (err) {
      console.error("새 여행 생성 오류:", err);
      alert("여행 일정을 생성하는 중 오류가 발생했습니다.");
    } finally {
      setIsCreatingPlan(false);
    }
  };

  const handleSelectExistingPlan = async (targetPlanId: string) => {
    setActiveUser(null);
    setActiveDayIndex(1);
    setViewMode("map");
    await loadSinglePlan(targetPlanId);
    setShowPlanGate(false);
    setUserGateMode("choose");
    setShowUserGate(true);
  };

  const handleRemoveKnownPlan = (targetId: string) => {
    setKnownPlans(removeKnownPlan(targetId));
  };

  useEffect(() => {
    if (!currentPlanId) return;

    const channel = supabase
      .channel(`travel-plan-${currentPlanId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "travel_plans",
          filter: `id=eq.${currentPlanId}`,
        },
        (payload) => {
          if (isApplyingRemoteRef.current || syncStatus === "saving") return;
          const updated = payload.new as {
            title?: string;
            places?: unknown;
            members?: unknown;
          };
          if (!updated) return;

          const {
            parsedPlaces,
            parsedMembers,
            parsedDeletedMembers,
            parsedSchedule,
          } = parsePlanPayload(updated.places, updated.members);

          isApplyingRemoteRef.current = true;
          if (typeof updated.title === "string" && updated.title.trim()) {
            setPlanTitle(updated.title);
          }
          setPlaces(parsedPlaces);
          setScheduleConfig(parsedSchedule);
          setDeletedMembers(parsedDeletedMembers);
          setMembers(mergeMembers(parsedMembers, parsedPlaces, parsedDeletedMembers));
          setTimeout(() => {
            isApplyingRemoteRef.current = false;
          }, 150);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentPlanId, syncStatus]);

  const resetSelectionAndViewport = useCallback(() => {
    setSelectedPlaceId(null);
    if (mapInstance && window.naver && previousViewportRef.current) {
      const { lat, lng, zoom } = previousViewportRef.current;
      mapInstance.setCenter(new window.naver.maps.LatLng(lat, lng));
      mapInstance.setZoom(zoom);
      previousViewportRef.current = null;
    }
  }, [mapInstance]);

  const handleSelectPin = useCallback(
    (place: PlaceItem) => {
      setDraftPlace(null);
      if (markerDisplayMode === "hidden") {
        setMarkerDisplayMode("compact");
      }
      if (!mapInstance || !window.naver) {
        setSelectedPlaceId(place.id);
        return;
      }
      if (selectedPlaceId === null && !previousViewportRef.current) {
        const c = mapInstance.getCenter();
        previousViewportRef.current = {
          lat: c.lat(),
          lng: c.lng(),
          zoom: mapInstance.getZoom(),
        };
      }
      setSelectedPlaceId(place.id);
      mapInstance.setCenter(new window.naver.maps.LatLng(place.lat, place.lng));
      mapInstance.setZoom(15);
    },
    [mapInstance, markerDisplayMode, selectedPlaceId]
  );

  useEffect(() => {
    if (showPlanGate || showUserGate || viewMode !== "map") {
      markersRef.forEach((m) => {
        try {
          m.setMap(null);
        } catch {
          // 무시
        }
      });
      setMarkersRef([]);
      setMapInstance(null);
      return;
    }

    let cancelled = false;
    setMapAuthError(false);

    const authFailHandler = () => {
      if (!cancelled) setMapAuthError(true);
    };
    window.addEventListener("naver_auth_fail", authFailHandler);
    if (window.naver && window.naver.maps && window.naver.maps.Event) {
      window.naver.maps.Event.addListener(window.naver.maps, "authfail", authFailHandler);
    }

    const initMap = () => {
      if (cancelled) return;
      const mapEl = document.getElementById("map");
      if (!mapEl) return;
      if (window.naver && window.naver.maps) {
        try {
          const first = visiblePlaces[0];
          const map = new window.naver.maps.Map(mapEl, {
            center: new window.naver.maps.LatLng(
              first ? first.lat : 33.3846,
              first ? first.lng : 126.5535
            ),
            zoom: first ? 12 : 10,
          });
          setMapInstance(map);
        } catch {
          setMapAuthError(true);
        }
      }
    };

    if (window.naver && window.naver.maps) {
      initMap();
    } else {
      const interval = setInterval(() => {
        if (window.naver && window.naver.maps) {
          clearInterval(interval);
          initMap();
        }
      }, 150);
      const timeout = setTimeout(() => {
        clearInterval(interval);
        if (!cancelled && (!window.naver || !window.naver.maps)) {
          setMapAuthError(true);
        }
      }, 4000);
      return () => {
        cancelled = true;
        clearInterval(interval);
        clearTimeout(timeout);
        window.removeEventListener("naver_auth_fail", authFailHandler);
      };
    }

    return () => {
      cancelled = true;
      window.removeEventListener("naver_auth_fail", authFailHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPlanGate, showUserGate, viewMode]);

  useEffect(() => {
    if (!mapInstance || !window.naver || viewMode !== "map") return;
    const listener = window.naver.maps.Event.addListener(mapInstance, "click", () => {
      if (selectedPlaceId !== null || previousViewportRef.current) {
        resetSelectionAndViewport();
      }
    });
    return () => {
      window.naver.maps.Event.removeListener(listener);
    };
  }, [mapInstance, viewMode, selectedPlaceId, resetSelectionAndViewport]);

  useEffect(() => {
    if (!mapInstance || !window.naver || viewMode !== "map") return;

    markersRef.forEach((m) => m.setMap(null));
    if (markerDisplayMode === "hidden") {
      setMarkersRef([]);
      return;
    }

    const nextMarkers = filteredPlaces.map((p, idx) => {
      const isSelected = p.id === selectedPlaceId;
      const cat = getPlaceCategory(p);
      const style = CATEGORY_STYLES[cat];
      const isCompact = markerDisplayMode === "compact" && !isSelected;
      const isStarred = Boolean(p.isMustVisit);

      const starBadgeHtml = isStarred
        ? `<span style="position:absolute;top:-7px;right:-6px;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:9999px;background:#facc15;border:1.5px solid #fff;font-size:10px;">⭐</span>`
        : "";

      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(p.lat, p.lng),
        map: mapInstance,
        cursor: "pointer",
        title: `${isStarred ? "⭐ " : ""}${p.title} (${style.label})`,
        zIndex: isSelected ? 200 : isStarred ? 150 + idx : 100 + idx,
        icon: isCompact
          ? {
              content: `<div style="position:relative;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;background:${style.pinBorder};color:#fff;border:2px solid ${isStarred ? "#facc15" : "#fff"};font-size:12px;font-weight:800;"><span>${style.icon}</span>${starBadgeHtml}</div>`,
              anchor: new window.naver.maps.Point(14, 14),
            }
          : {
              content: `<div style="position:relative;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:9999px;background:${isSelected ? style.pinBorder : style.pinBg};color:${isSelected ? "#fff" : style.pinText};border:2px solid ${style.pinBorder};font-size:12px;font-weight:700;white-space:nowrap;"><span>${style.icon}</span><span>${idx + 1}. ${p.title}</span>${starBadgeHtml}</div>`,
              anchor: new window.naver.maps.Point(16, 16),
            },
      });

      const hoverText = `${isStarred ? "⭐ " : ""}${style.icon} ${p.title} · ${style.label}`;
      window.naver.maps.Event.addListener(marker, "mouseover", () => {
        setHoveredPlaceTitle(hoverText);
      });
      window.naver.maps.Event.addListener(marker, "mouseout", () => {
        setHoveredPlaceTitle((prev) => (prev === hoverText ? null : prev));
      });
      window.naver.maps.Event.addListener(marker, "click", () => {
        handleSelectPin(p);
      });

      return marker;
    });

    setMarkersRef(nextMarkers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    placesMapSignature,
    mapInstance,
    viewMode,
    selectedPlaceId,
    markerDisplayMode,
    selectedCategories,
    onlyMustVisitFilter,
    selectedUserFilter,
    handleSelectPin,
  ]);

  const handleRegisterNewUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newUserName.trim();
    if (!trimmed) return;

    const nextDeleted = deletedMembers.filter((m) => m !== trimmed);
    const nextMembers = mergeMembers([...members, trimmed], visiblePlaces, nextDeleted);

    setDeletedMembers(nextDeleted);
    setMembers(nextMembers);
    setActiveUser(trimmed);
    setNewUserName("");
    setShowUserGate(false);

    await commitPlanState({ members: nextMembers, deletedMembers: nextDeleted });
  };

  const handlePickExistingUser = async (name: string) => {
    setActiveUser(name);
    setShowUserGate(false);
    if (currentPlanIdRef.current) {
      await loadSinglePlan(currentPlanIdRef.current);
    }
  };

  const handleDeleteUser = async (targetName: string) => {
    const nextDeleted = Array.from(new Set([...deletedMembers, targetName]));
    const nextMembers = members.filter((m) => m !== targetName);

    setDeletedMembers(nextDeleted);
    setMembers(nextMembers);
    if (activeUser === targetName) setActiveUser(null);
    if (selectedUserFilter === targetName) setSelectedUserFilter(null);

    await commitPlanState({ members: nextMembers, deletedMembers: nextDeleted });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchKeyword.trim();
    if (!trimmed) return;

    setIsSearching(true);
    try {
      const res = await fetch(`/api/search?query=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      const items: CandidatePlace[] = Array.isArray(data?.items) ? data.items : [];
      setSearchResults(items);
      if (items.length === 0) {
        alert("검색 결과가 없습니다. 다른 키워드로 검색해 보세요.");
      }
    } catch (err) {
      console.error("검색 요청 실패:", err);
      alert("검색 중 오류가 발생했습니다.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectCandidate = (candidate: CandidatePlace) => {
    setSelectedPlaceId(null);
    previousViewportRef.current = null;
    if (mapInstance && window.naver) {
      mapInstance.setCenter(new window.naver.maps.LatLng(candidate.lat, candidate.lng));
      mapInstance.setZoom(15);
    }
    setDraftPlace(candidate);
    setDraftTitle(candidate.title);
    setDraftMemo("");
    setDraftCategory(inferCategoryType(candidate.category, candidate.title));
    setDraftMustVisit(false);
    setSearchResults([]);
  };

  const handleConfirmDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftPlace) return;

    const finalTitle = draftTitle.trim() || draftPlace.title.trim() || "제주 장소";
    const finalMemo = draftMemo.trim();
    const creator = activeUser || "익명";
    const newId = Date.now();

    const nextPlaces: PlaceItem[] = [
      ...visiblePlaces,
      {
        id: newId,
        lat: draftPlace.lat,
        lng: draftPlace.lng,
        title: finalTitle,
        memo: finalMemo,
        createdBy: creator,
        categoryType: draftCategory,
        isMustVisit: draftMustVisit,
      },
    ];

    setPlaces(nextPlaces);
    setMemoDrafts((prev) => ({ ...prev, [newId]: finalMemo }));
    setDraftPlace(null);
    setDraftTitle("");
    setDraftMemo("");
    setDraftMustVisit(false);
    setSearchKeyword("");

    await commitPlanState({ places: nextPlaces });
  };

  const handleUpdateMemo = useCallback(
    (id: number, nextMemo: string) => {
      setMemoDrafts((prev) => ({ ...prev, [id]: nextMemo }));
      if (memoSaveTimerRef.current) clearTimeout(memoSaveTimerRef.current);

      memoSaveTimerRef.current = setTimeout(() => {
        const nextPlaces = visiblePlaces.map((p) =>
          p.id === id ? { ...p, memo: nextMemo } : p
        );
        setPlaces(nextPlaces);
        commitPlanState({ places: nextPlaces });
      }, 250);
    },
    [visiblePlaces, commitPlanState]
  );

  const handleChangePlaceCategory = async (id: number, nextCategory: PlaceCategory) => {
    const nextPlaces = visiblePlaces.map((p) =>
      p.id === id ? { ...p, categoryType: nextCategory } : p
    );
    setPlaces(nextPlaces);
    setEditingCategoryPlaceId(null);
    await commitPlanState({ places: nextPlaces });
  };

  const handleTogglePlaceMustVisit = async (id: number) => {
    const nextPlaces = visiblePlaces.map((p) =>
      p.id === id ? { ...p, isMustVisit: !p.isMustVisit } : p
    );
    setPlaces(nextPlaces);
    await commitPlanState({ places: nextPlaces });
  };

  const handleDeletePlace = async (id: number) => {
    if (selectedPlaceId === id) {
      resetSelectionAndViewport();
    }
    if (editingCategoryPlaceId === id) {
      setEditingCategoryPlaceId(null);
    }
    setMemoDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    const nextPlaces = visiblePlaces.filter((p) => p.id !== id);
    const nextSchedule: TripScheduleConfig = {
      ...scheduleConfig,
      items: (scheduleConfig.items || []).filter((it) => it.placeId !== id),
    };

    setPlaces(nextPlaces);
    setScheduleConfig(nextSchedule);
    await commitPlanState({ places: nextPlaces, schedule: nextSchedule });
  };

  const handleAddPlaceToDaySchedule = async (place: PlaceItem, targetSlot?: string) => {
    const slot = targetSlot || selectedTimeSlot || "09:00";
    const newSlotItem: ScheduleSlotItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      dayIndex: activeDayIndex,
      timeSlot: slot,
      placeId: place.id,
      title: place.title,
      memo: memoDrafts[place.id] ?? place.memo,
      categoryType: getPlaceCategory(place),
      isMustVisit: Boolean(place.isMustVisit),
      createdBy: place.createdBy || "익명",
    };

    const nextSchedule: TripScheduleConfig = {
      ...scheduleConfig,
      items: [...(scheduleConfig.items || []), newSlotItem],
    };

    setScheduleConfig(nextSchedule);
    await commitPlanState({ schedule: nextSchedule });
  };

  const handleRemoveScheduleItem = async (slotItemId: string) => {
    const nextSchedule: TripScheduleConfig = {
      ...scheduleConfig,
      items: (scheduleConfig.items || []).filter((it) => it.id !== slotItemId),
    };
    setScheduleConfig(nextSchedule);
    await commitPlanState({ schedule: nextSchedule });
  };

  const handleUpdateScheduleItemSlot = async (slotItemId: string, nextTimeSlot: string) => {
    const nextSchedule: TripScheduleConfig = {
      ...scheduleConfig,
      items: (scheduleConfig.items || []).map((it) =>
        it.id === slotItemId ? { ...it, timeSlot: nextTimeSlot } : it
      ),
    };
    setScheduleConfig(nextSchedule);
    await commitPlanState({ schedule: nextSchedule });
  };

  const handleCopyShareLink = async () => {
    const targetId = currentPlanIdRef.current || (await commitPlanState({}));
    if (!targetId) return;
    const shareUrl = `${window.location.origin}/plan/${targetId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert(`공유 링크가 복사되었습니다!\n${shareUrl}`);
    } catch {
      prompt("아래 공유 링크를 복사하세요:", shareUrl);
    }
  };

  const selectedIndex =
    selectedPlaceId !== null
      ? filteredPlaces.findIndex((p) => p.id === selectedPlaceId)
      : -1;
  const selectedPlace = selectedIndex >= 0 ? filteredPlaces[selectedIndex] : null;
  const selectedCategoryStyle = selectedPlace
    ? CATEGORY_STYLES[getPlaceCategory(selectedPlace)]
    : null;

  const isAllFilterActive = selectedCategories.length === 0 && !onlyMustVisitFilter;
  const currentDayMeta = tripDays[activeDayIndex - 1] || tripDays[0];

  const statusLabel = {
    idle: currentPlanId ? "실시간 동기화 중" : "추가 시 자동 저장",
    saving: "DB 저장 중...",
    saved: "자동 저장 완료",
    error: "저장 오류 발생",
  }[syncStatus];

  if (showPlanGate) {
    return (
      <div className="min-h-screen w-screen bg-gradient-to-b from-emerald-50/70 to-white flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-200 shadow-lg p-6 md:p-8 space-y-6">
          <div className="text-center space-y-1.5">
            <div className="text-3xl" role="img" aria-label="jeju">
              ✈️
            </div>
            <h1 className="text-xl font-bold text-gray-900">제주 여행 일정 선택</h1>
            <p className="text-sm text-gray-500">
              참여할 여행 일정을 선택하거나 새 여행 일정을 만들어 주세요.
            </p>
          </div>

          {planGateMode === "choose" && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setPlanGateMode("new")}
                className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                + 새로운 여행 일정 생성하기
              </button>
              <button
                type="button"
                onClick={() => setPlanGateMode("existing")}
                className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 text-sm font-semibold transition-colors cursor-pointer"
              >
                기존 여행 일정 선택하기
              </button>
            </div>
          )}

          {planGateMode === "new" && (
            <form onSubmit={handleCreateNewTripPlan} className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-700">
                  새로운 여행 일정 생성하기
                </span>
                <button
                  type="button"
                  onClick={() => setPlanGateMode("choose")}
                  className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer"
                >
                  뒤로가기
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  여행 일정 이름
                </label>
                <input
                  type="text"
                  value={newPlanTitle}
                  onChange={(e) => setNewPlanTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-xl outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    시작 날짜 / 시간
                  </label>
                  <input
                    type="datetime-local"
                    value={newStartDateTime}
                    onChange={(e) => setNewStartDateTime(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    여행 종료 날짜 / 시간
                  </label>
                  <input
                    type="datetime-local"
                    value={newEndDateTime}
                    onChange={(e) => setNewEndDateTime(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isCreatingPlan}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
              >
                {isCreatingPlan
                  ? "일정 생성 중..."
                  : "여행 일정 만들고 사용자 선택으로 이동"}
              </button>
            </form>
          )}

          {planGateMode === "existing" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-600">
                  기존 여행 일정 선택하기
                </span>
                <button
                  type="button"
                  onClick={() => setPlanGateMode("choose")}
                  className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer"
                >
                  뒤로가기
                </button>
              </div>

              {knownPlans.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center space-y-3">
                  <p className="text-sm text-gray-500">불러올 기존 여행 일정이 없습니다.</p>
                  <button
                    type="button"
                    onClick={() => setPlanGateMode("new")}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer"
                  >
                    + 새 여행 일정 만들기
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {knownPlans.map((item) => {
                    const dayCount = computeTripDays(
                      item.startDateTime,
                      item.endDateTime
                    ).length;
                    return (
                      <div
                        key={item.id}
                        className="w-full p-3 rounded-xl border border-gray-200 hover:border-emerald-500 hover:bg-emerald-50/40 flex items-center justify-between gap-2 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectExistingPlan(item.id)}
                          className="flex-1 text-left cursor-pointer min-w-0"
                        >
                          <div className="font-semibold text-sm text-gray-900 truncate">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>{dayCount}일차</span>
                            {item.startDateTime && item.endDateTime && (
                              <span>
                                · {formatDateTimeDisplay(item.startDateTime)} ~{" "}
                                {formatDateTimeDisplay(item.endDateTime)}
                              </span>
                            )}
                            <span>· 장소 {item.placesCount}곳</span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveKnownPlan(item.id)}
                          className="text-xs text-gray-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 cursor-pointer shrink-0"
                        >
                          제거
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (showUserGate) {
    return (
      <div className="min-h-screen w-screen bg-gradient-to-b from-emerald-50/70 to-white flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-lg p-6 md:p-8 space-y-6">
          <div className="text-center space-y-1.5">
            <div className="text-3xl" role="img" aria-label="jeju">
              🍊
            </div>
            <h1 className="text-xl font-bold text-gray-900">{planTitle}</h1>
            <p className="text-xs text-emerald-700 font-medium">
              {formatDateTimeDisplay(scheduleConfig.startDateTime)} ~{" "}
              {formatDateTimeDisplay(scheduleConfig.endDateTime)} ({tripDays.length}일차)
            </p>
            <p className="text-sm text-gray-500">이용 방식을 선택해 주세요.</p>
          </div>

          {userGateMode === "choose" && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setUserGateMode("existing")}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                기존 사용자 선택
              </button>
              <button
                type="button"
                onClick={() => setUserGateMode("new")}
                className="w-full py-3 px-4 rounded-xl bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 text-sm font-semibold transition-colors cursor-pointer"
              >
                신규 이용자 등록
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUserGate(false);
                  setPlanGateMode("choose");
                  setShowPlanGate(true);
                }}
                className="w-full py-2 text-xs text-gray-500 hover:text-gray-800 cursor-pointer"
              >
                ← 다른 여행 일정 선택/생성하기
              </button>
            </div>
          )}

          {userGateMode === "existing" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-600">기존 사용자 선택</span>
                <button
                  type="button"
                  onClick={() => setUserGateMode("choose")}
                  className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer"
                >
                  뒤로가기
                </button>
              </div>

              {members.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center space-y-3">
                  <p className="text-sm text-gray-500">기존 사용자 없음</p>
                  <button
                    type="button"
                    onClick={() => setUserGateMode("choose")}
                    className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-100 cursor-pointer"
                  >
                    뒤로가기
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {members.map((name) => (
                    <div
                      key={name}
                      className="w-full py-2 px-3.5 rounded-xl border border-gray-200 hover:border-emerald-500 hover:bg-emerald-50/50 text-sm font-medium text-gray-900 flex items-center justify-between gap-2 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => handlePickExistingUser(name)}
                        className="flex-1 text-left py-0.5 flex items-center justify-between cursor-pointer"
                      >
                        <span>{name}</span>
                        <span className="text-xs text-emerald-700 font-semibold">선택 →</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteUser(name)}
                        className="text-xs text-gray-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 cursor-pointer shrink-0"
                      >
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {userGateMode === "new" && (
            <form onSubmit={handleRegisterNewUser} className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-700">신규 이용자 등록</span>
                <button
                  type="button"
                  onClick={() => setUserGateMode("choose")}
                  className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer"
                >
                  뒤로가기
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  이름
                </label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="이름을 입력하세요"
                  autoFocus
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-xl outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
              >
                등록하고 여행 열기
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <header className="h-[60px] shrink-0 px-4 md:px-6 border-b border-gray-200 bg-white flex items-center justify-between z-20 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl shrink-0" role="img" aria-label="jeju">
            🍊
          </span>
          <button
            type="button"
            onClick={() => {
              setPlanGateMode("choose");
              setShowPlanGate(true);
            }}
            className="text-lg font-bold tracking-tight text-gray-900 hover:text-emerald-700 truncate cursor-pointer text-left"
          >
            {planTitle || "제주 여행 플래너"}
          </button>
          <span
            className={`hidden sm:inline-block text-xs px-2.5 py-0.5 rounded-full shrink-0 ${
              syncStatus === "error"
                ? "text-red-700 bg-red-50"
                : "text-emerald-700 bg-emerald-50"
            }`}
          >
            {statusLabel}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setUserGateMode("choose");
              setShowUserGate(true);
            }}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
          >
            {activeUser ? `👤 ${activeUser}` : "사용자 설정"}
          </button>

          <button
            type="button"
            onClick={handleCopyShareLink}
            className="px-3.5 py-2 text-xs sm:text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer"
          >
            공유 링크 복사
          </button>
        </div>
      </header>

      {viewMode === "map" ? (
        <main className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          <section className="w-full h-1/2 md:w-[60%] md:h-full relative border-b md:border-b-0 md:border-r border-gray-200 overflow-hidden">
            <div className="flex items-center gap-1.5 absolute top-4 right-4 z-20">
              <button
                type="button"
                onClick={() => setViewMode("schedule")}
                className="px-3.5 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold shadow-md transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <span>📅</span>
                <span>일정</span>
              </button>

              <div className="hidden sm:flex items-center gap-1 bg-white/95 p-1 rounded-lg shadow-md border border-gray-200 text-xs">
                {(["full", "compact", "hidden"] as MarkerDisplayMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setMarkerDisplayMode(mode)}
                    className={`px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                      markerDisplayMode === mode
                        ? "bg-emerald-600 text-white"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                    }`}
                  >
                    {mode === "full"
                      ? "전체"
                      : mode === "compact"
                      ? "간략히 보기"
                      : "숨기기"}
                  </button>
                ))}
              </div>
            </div>

            <div className="absolute top-4 left-4 right-28 sm:right-68 md:right-auto md:w-88 z-20">
              <form
                onSubmit={handleSearch}
                className="flex shadow-md rounded-lg overflow-hidden bg-white border border-gray-200"
              >
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="장소·명소·상호 검색 (예: 협재해수욕장)"
                  className="flex-1 px-3 py-2.5 text-sm outline-none text-gray-800"
                />
                <button
                  type="submit"
                  disabled={isSearching}
                  className="px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                >
                  {isSearching ? "검색 중" : "검색"}
                </button>
              </form>

              {hoveredPlaceTitle && (
                <div className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-900/90 text-white text-xs font-medium shadow-md">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>{hoveredPlaceTitle}</span>
                </div>
              )}

              {searchResults.length > 0 && (
                <ul className="mt-1.5 bg-white rounded-lg shadow-lg border border-gray-200 divide-y divide-gray-100 max-h-60 overflow-y-auto">
                  {searchResults.map((item, idx) => {
                    const inferred =
                      CATEGORY_STYLES[inferCategoryType(item.category, item.title)];
                    return (
                      <li
                        key={`${item.title}-${idx}`}
                        onClick={() => handleSelectCandidate(item)}
                        className="p-3 hover:bg-emerald-50 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm text-gray-900">
                            {item.title}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${inferred.badgeBg}`}
                          >
                            {inferred.icon} {inferred.label}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">{item.address}</div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {draftPlace && (
                <form
                  onSubmit={handleConfirmDraft}
                  className="mt-2 bg-white rounded-xl shadow-xl border border-emerald-200 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-700">
                      선택 장소 등록 ({activeUser || "익명"})
                    </span>
                    <button
                      type="button"
                      onClick={() => setDraftPlace(null)}
                      className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      취소
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    {CATEGORY_ORDER.map((catKey) => {
                      const cStyle = CATEGORY_STYLES[catKey];
                      const active = draftCategory === catKey;
                      return (
                        <button
                          key={catKey}
                          type="button"
                          onClick={() => setDraftCategory(catKey)}
                          className={`py-1.5 px-1 rounded-lg border text-[11px] font-semibold flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                            active
                              ? `${cStyle.badgeBg} ring-2 ring-offset-1 ring-gray-400`
                              : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                          }`}
                        >
                          <span>{cStyle.icon}</span>
                          <span>{cStyle.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <input
                    type="text"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    placeholder="장소명"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-emerald-500"
                  />

                  <input
                    type="text"
                    value={draftMemo}
                    onChange={(e) => setDraftMemo(e.target.value)}
                    placeholder="메모 (선택)"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-emerald-500"
                  />

                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setDraftMustVisit((prev) => !prev)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                        draftMustVisit
                          ? "bg-amber-50 text-amber-800 border-amber-300"
                          : "bg-gray-50 text-gray-600 border-gray-200"
                      }`}
                    >
                      <span>{draftMustVisit ? "⭐" : "☆"}</span>
                      <span>꼭 가고 싶은 곳</span>
                    </button>

                    <a
                      href={buildNaverMapCoordUrl(
                        draftTitle || draftPlace.title,
                        draftPlace.lat,
                        draftPlace.lng
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-emerald-700 underline"
                    >
                      네이버 지도 ↗
                    </a>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg cursor-pointer"
                  >
                    일정에 추가하고 저장
                  </button>
                </form>
              )}
            </div>

            {mapAuthError ? (
              <div className="w-full h-full bg-gray-100 flex flex-col items-center justify-center p-6 text-center space-y-2">
                <p className="text-sm font-semibold text-gray-800">
                  네이버 지도 API 인증이 완료되지 않았습니다.
                </p>
                <p className="text-xs text-gray-500 max-w-sm">
                  네이버 클라우드 플랫폼 콘솔의 Web 서비스 URL(현재 접속 주소)과
                  클라이언트 키 설정을 확인해 주세요. 검색 및 장소 추가·일정 관리는
                  아래 목록에서 계속 이용할 수 있습니다.
                </p>
              </div>
            ) : (
              <div id="map" className="w-full h-full bg-gray-200" />
            )}
          </section>

          <section className="w-full h-1/2 md:w-[40%] md:h-full overflow-y-auto bg-white p-6 md:p-10">
            <div className="max-w-2xl mx-auto">
              {selectedPlace && selectedCategoryStyle && (
                <div
                  className={`mb-6 p-4 rounded-2xl border-2 shadow-sm space-y-2.5 ${selectedCategoryStyle.cardBorder} ${selectedCategoryStyle.cardSelectedBg}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-bold ${selectedCategoryStyle.badgeBg}`}
                      >
                        <span>{selectedCategoryStyle.icon}</span>
                        <span>{selectedCategoryStyle.label}</span>
                      </span>
                      <span className="text-xs font-semibold text-gray-600">
                        #{selectedIndex + 1}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={resetSelectionAndViewport}
                      className="text-xs font-medium text-gray-700 bg-white px-2.5 py-1 rounded-md border border-gray-200 cursor-pointer"
                    >
                      닫기
                    </button>
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h2 className="text-lg font-bold text-gray-900">
                        {selectedPlace.title}
                      </h2>
                      <input
                        type="text"
                        value={memoDrafts[selectedPlace.id] ?? selectedPlace.memo}
                        onChange={(e) => handleUpdateMemo(selectedPlace.id, e.target.value)}
                        placeholder="멘트를 입력해 보세요..."
                        className="w-full text-sm text-gray-700 mt-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 focus:border-emerald-500 outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeletePlace(selectedPlace.id)}
                      className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 rounded cursor-pointer"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              )}

              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div className="flex-1 min-w-[200px]">
                  <input
                    type="text"
                    value={planTitle}
                    onChange={(e) => {
                      const nextTitle = e.target.value;
                      setPlanTitle(nextTitle);
                      commitPlanState({ title: nextTitle });
                    }}
                    className="w-full text-2xl font-bold text-gray-900 tracking-tight border-b border-transparent hover:border-gray-200 focus:border-emerald-500 outline-none pb-1"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    카테고리나 ⭐ 표시로 필터링하고 상태를 바꿀 수 있습니다.
                  </p>
                </div>

                <div className="relative flex items-center gap-1 bg-gray-100 p-1 rounded-lg text-xs shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUserFilter(null);
                      setIsUserFilterOpen(false);
                    }}
                    className={`px-2.5 py-1 rounded-md font-medium cursor-pointer ${
                      selectedUserFilter === null
                        ? "bg-white text-gray-900"
                        : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    등록순
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsUserFilterOpen((prev) => !prev)}
                    className={`px-2.5 py-1 rounded-md font-medium cursor-pointer ${
                      selectedUserFilter !== null
                        ? "bg-white text-emerald-700 font-semibold"
                        : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    {selectedUserFilter ? `👤 ${selectedUserFilter}` : "이름 선택"} ▾
                  </button>

                  {isUserFilterOpen && (
                    <div className="absolute right-0 top-9 z-30 min-w-[140px] bg-white border border-gray-200 rounded-xl shadow-lg p-1.5 space-y-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUserFilter(null);
                          setIsUserFilterOpen(false);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-gray-700 hover:bg-gray-100 cursor-pointer"
                      >
                        전체 보기
                      </button>
                      {filterableUsers.map((userName) => (
                        <button
                          key={userName}
                          type="button"
                          onClick={() => {
                            setSelectedUserFilter(userName);
                            setIsUserFilterOpen(false);
                          }}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-gray-700 hover:bg-gray-100 cursor-pointer"
                        >
                          {userName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-6 flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategories([]);
                    setOnlyMustVisitFilter(false);
                  }}
                  className={`px-2.5 py-1 rounded-full border text-xs font-semibold cursor-pointer ${
                    isAllFilterActive
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-600 border-gray-200"
                  }`}
                >
                  전체
                </button>
                {CATEGORY_ORDER.map((catKey) => {
                  const cStyle = CATEGORY_STYLES[catKey];
                  const isSelectedCat = selectedCategories.includes(catKey);
                  return (
                    <button
                      key={catKey}
                      type="button"
                      onClick={() =>
                        setSelectedCategories((prev) =>
                          prev.includes(catKey)
                            ? prev.filter((item) => item !== catKey)
                            : [...prev, catKey]
                        )
                      }
                      className={`px-2.5 py-1 rounded-full border text-xs font-semibold inline-flex items-center gap-1 cursor-pointer ${
                        isSelectedCat
                          ? `${cStyle.badgeBg} ring-2 ring-offset-1 ring-gray-300`
                          : "bg-white text-gray-600 border-gray-200"
                      }`}
                    >
                      <span>{cStyle.icon}</span>
                      <span>{cStyle.label}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setOnlyMustVisitFilter((prev) => !prev)}
                  className={`px-2.5 py-1 rounded-full border text-xs font-semibold cursor-pointer ${
                    onlyMustVisitFilter
                      ? "bg-amber-100 text-amber-800 border-amber-300"
                      : "bg-white text-gray-600 border-gray-200"
                  }`}
                >
                  ⭐
                </button>
              </div>

              {filteredPlaces.length === 0 ? (
                <div className="text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl p-10 text-center bg-gray-50/50">
                  {visiblePlaces.length === 0
                    ? "아직 추가된 장소가 없습니다. 검색으로 장소를 추가해 보세요! 🗺️"
                    : "선택한 필터 조건에 해당하는 장소가 없습니다."}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredPlaces.map((p, index) => {
                    const isSelected = p.id === selectedPlaceId;
                    const isEditingCategory = editingCategoryPlaceId === p.id;
                    const cat = getPlaceCategory(p);
                    const cStyle = CATEGORY_STYLES[cat];

                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSelectPin(p)}
                        className={`p-4 pb-3 rounded-xl border transition-all flex items-start justify-between gap-4 cursor-pointer relative ${
                          isSelected
                            ? `${cStyle.cardBorder} ${cStyle.cardSelectedBg} ring-2 ring-offset-1 ring-gray-200`
                            : `${cStyle.cardBorder} ${cStyle.cardHoverBorder} bg-white`
                        }`}
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <span
                            className={`flex items-center justify-center w-6 h-6 rounded-full border text-xs font-bold shrink-0 mt-0.5 ${cStyle.badgeBg}`}
                          >
                            {index + 1}
                          </span>
                          <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-2 flex-wrap relative">
                              <h3
                                onClick={() => handleSelectPin(p)}
                                className="font-semibold text-gray-900 text-base cursor-pointer truncate"
                              >
                                {p.title}
                              </h3>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingCategoryPlaceId((prev) =>
                                    prev === p.id ? null : p.id
                                  );
                                }}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold cursor-pointer ${cStyle.badgeBg}`}
                              >
                                <span>{cStyle.icon}</span>
                                <span>{cStyle.label}</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTogglePlaceMustVisit(p.id);
                                }}
                                className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full border text-[11px] cursor-pointer ${
                                  p.isMustVisit
                                    ? "bg-amber-100 text-amber-800 border-amber-300"
                                    : "bg-gray-50 text-gray-400 border-gray-200"
                                }`}
                              >
                                {p.isMustVisit ? "⭐" : "☆"}
                              </button>

                              {isEditingCategory && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute left-0 top-7 z-30 bg-white border border-gray-200 rounded-xl shadow-lg p-1.5 flex items-center gap-1"
                                >
                                  {CATEGORY_ORDER.map((catKey) => {
                                    const optionStyle = CATEGORY_STYLES[catKey];
                                    return (
                                      <button
                                        key={catKey}
                                        type="button"
                                        onClick={() => handleChangePlaceCategory(p.id, catKey)}
                                        className="px-2 py-1 rounded-lg text-[11px] font-semibold hover:bg-gray-100 text-gray-700 cursor-pointer"
                                      >
                                        {optionStyle.icon} {optionStyle.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            <input
                              type="text"
                              value={memoDrafts[p.id] ?? p.memo}
                              onChange={(e) => handleUpdateMemo(p.id, e.target.value)}
                              placeholder="멘트를 입력해 보세요..."
                              className="w-full text-xs text-gray-600 mt-1.5 px-2 py-1 rounded border border-transparent hover:border-gray-200 focus:border-emerald-400 outline-none"
                            />
                            <div className="mt-2 pt-1.5 border-t border-gray-100 flex items-center justify-between gap-2 px-2">
                              <a
                                href={buildNaverMapCoordUrl(p.title, p.lat, p.lng)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-900 underline"
                              >
                                네이버 지도 링크 ↗
                              </a>
                              <span className="text-[10px] text-gray-400">
                                {p.createdBy || "익명"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePlace(p.id);
                          }}
                          className="text-gray-400 hover:text-red-500 text-sm px-2 py-1 rounded cursor-pointer shrink-0"
                        >
                          삭제
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </main>
      ) : (
        <main className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden bg-gray-50/60">
          <section className="w-full h-3/5 md:w-[60%] md:h-full flex flex-col border-b md:border-b-0 md:border-r border-gray-200 bg-white min-h-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-3 shrink-0">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                    {activeDayIndex}일차
                  </span>
                  {currentDayMeta?.dateLabel && (
                    <span className="text-sm font-semibold text-gray-800">
                      {currentDayMeta.dateLabel}
                      {currentDayMeta.weekdayLabel
                        ? ` (${currentDayMeta.weekdayLabel})`
                        : ""}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    · 총 {tripDays.length}일차 중 {activeDayIndex}일차
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  시간대를 고른 뒤 우측 저장된 장소 카드를 클릭하면 {activeDayIndex}일차
                  시간표에 추가됩니다.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setViewMode("map")}
                className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 shrink-0"
              >
                <span>🗺️</span>
                <span>지도로 돌아가기</span>
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-2">
              {TIME_SLOTS.map((slot) => {
                const slotItems = currentDayScheduleItems.filter(
                  (it) => it.timeSlot === slot
                );
                const isSelectedSlot = selectedTimeSlot === slot;

                return (
                  <div
                    key={slot}
                    onClick={() => setSelectedTimeSlot(slot)}
                    className={`rounded-xl border p-2.5 transition-all flex items-start gap-3 cursor-pointer ${
                      isSelectedSlot
                        ? "border-emerald-400 bg-emerald-50/40 ring-1 ring-emerald-300"
                        : "border-gray-100 bg-white hover:border-gray-200"
                    }`}
                  >
                    <div className="w-14 shrink-0 pt-1">
                      <span
                        className={`text-xs font-bold tabular-nums ${
                          isSelectedSlot ? "text-emerald-700" : "text-gray-500"
                        }`}
                      >
                        {slot}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      {slotItems.length === 0 ? (
                        <div className="h-7 flex items-center text-[11px] text-gray-400">
                          {isSelectedSlot
                            ? "우측 장소를 클릭하면 이 시간대에 추가됩니다"
                            : "일정 없음"}
                        </div>
                      ) : (
                        slotItems.map((sc) => {
                          const cat = getPlaceCategory(sc);
                          const cStyle = CATEGORY_STYLES[cat];
                          return (
                            <div
                              key={sc.id}
                              onClick={(e) => e.stopPropagation()}
                              className={`p-2.5 rounded-lg border ${cStyle.cardBorder} ${cStyle.cardSelectedBg} flex items-center justify-between gap-2`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span
                                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cStyle.badgeBg}`}
                                  >
                                    {cStyle.icon} {cStyle.label}
                                  </span>
                                  <span className="text-sm font-semibold text-gray-900 truncate">
                                    {sc.title}
                                  </span>
                                </div>
                                {sc.memo && (
                                  <p className="text-xs text-gray-600 mt-1 truncate">
                                    {sc.memo}
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <select
                                  value={sc.timeSlot}
                                  onChange={(e) =>
                                    handleUpdateScheduleItemSlot(sc.id, e.target.value)
                                  }
                                  className="text-[11px] border border-gray-200 rounded-md px-1.5 py-1 bg-white text-gray-700 cursor-pointer"
                                >
                                  {TIME_SLOTS.map((t) => (
                                    <option key={t} value={t}>
                                      {t}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveScheduleItem(sc.id)}
                                  className="text-xs text-gray-400 hover:text-red-600 px-1.5 py-1 rounded cursor-pointer"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-2.5 flex items-center justify-center z-20">
              <div className="bg-gray-50 border border-gray-200 rounded-full px-3 py-1.5 flex items-center gap-1.5 max-w-full">
                <button
                  type="button"
                  disabled={activeDayIndex <= 1}
                  onClick={() => setActiveDayIndex((prev) => Math.max(1, prev - 1))}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold text-gray-700 hover:bg-gray-200/70 disabled:opacity-35 disabled:pointer-events-none cursor-pointer shrink-0"
                >
                  ◀ 이전
                </button>

                <div className="flex items-center gap-1 overflow-x-auto max-w-[220px] sm:max-w-[360px] px-1">
                  {tripDays.map((day) => {
                    const isCurrentDay = day.dayIndex === activeDayIndex;
                    return (
                      <button
                        key={day.dayIndex}
                        type="button"
                        onClick={() => setActiveDayIndex(day.dayIndex)}
                        className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer ${
                          isCurrentDay
                            ? "bg-emerald-600 text-white"
                            : "text-gray-600 hover:bg-gray-200/70"
                        }`}
                      >
                        {day.dayIndex}일차
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  disabled={activeDayIndex >= tripDays.length}
                  onClick={() =>
                    setActiveDayIndex((prev) => Math.min(tripDays.length, prev + 1))
                  }
                  className="px-2.5 py-1 rounded-full text-xs font-semibold text-gray-700 hover:bg-gray-200/70 disabled:opacity-35 disabled:pointer-events-none cursor-pointer shrink-0"
                >
                  다음 ▶
                </button>
              </div>
            </div>
          </section>

          <section className="w-full h-2/5 md:w-[40%] md:h-full overflow-y-auto bg-white p-5 md:p-7">
            <div className="max-w-xl mx-auto space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-3">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                    <span>📄 저장된 장소 보드</span>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900 mt-1">
                    장소를 클릭해 {activeDayIndex}일차 ({selectedTimeSlot})에 추가
                  </h2>
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {visiblePlaces.length}곳
                </span>
              </div>

              {visiblePlaces.length === 0 ? (
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">
                  아직 저장된 장소가 없습니다. ‘지도로 돌아가기’를 눌러 장소를
                  먼저 저장해 보세요!
                </div>
              ) : (
                <div className="space-y-2.5">
                  {visiblePlaces.map((place) => {
                    const cat = getPlaceCategory(place);
                    const cStyle = CATEGORY_STYLES[cat];
                    const addedCountToday = currentDayScheduleItems.filter(
                      (sc) => sc.placeId === place.id
                    ).length;
                    const currentMemo = memoDrafts[place.id] ?? place.memo;

                    return (
                      <button
                        key={place.id}
                        type="button"
                        onClick={() => handleAddPlaceToDaySchedule(place)}
                        className={`w-full text-left p-3.5 rounded-xl border ${cStyle.cardBorder} ${cStyle.cardHoverBorder} bg-white hover:bg-emerald-50/30 transition-all cursor-pointer space-y-1.5`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${cStyle.badgeBg}`}
                            >
                              {cStyle.icon} {cStyle.label}
                            </span>
                            <span className="font-semibold text-sm text-gray-900 truncate">
                              {place.title}
                            </span>
                          </div>
                          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md shrink-0">
                            + {activeDayIndex}일차 추가
                          </span>
                        </div>

                        {currentMemo && (
                          <p className="text-xs text-gray-600 line-clamp-2">{currentMemo}</p>
                        )}

                        <div className="pt-1 flex items-center justify-between text-[11px] text-gray-400">
                          <span>작성: {place.createdBy || "익명"}</span>
                          {addedCountToday > 0 && (
                            <span className="text-emerald-700 font-semibold">
                              오늘 시간표에 {addedCountToday}회 담김
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}