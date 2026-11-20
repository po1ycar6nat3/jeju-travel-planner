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

interface MapViewportSnapshot {
  lat: number;
  lng: number;
  zoom: number;
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
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const start = new Date(now.getTime() + 24 * 60 * 60 * 1000);
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
  const diffMs = endDay.getTime() - startDay.getTime();
  const totalDays = Math.max(
    1,
    Math.min(30, Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1)
  );

  return Array.from({ length: totalDays }, (_, idx) => {
    const d = new Date(startDay.getTime() + idx * 24 * 60 * 60 * 1000);
    return {
      dayIndex: idx + 1,
      dateLabel: `${d.getMonth() + 1}/${d.getDate()}`,
      weekdayLabel: weekdays[d.getDay()],
    };
  });
}

function formatDateTimeDisplay(dt?: string): string {
  if (!dt) return "";
  const parsed = new Date(dt);
  if (Number.isNaN(parsed.getTime())) return dt;
  const month = parsed.getMonth() + 1;
  const day = parsed.getDate();
  const hours = String(parsed.getHours()).padStart(2, "0");
  const mins = String(parsed.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${mins}`;
}

function inferCategoryType(rawCategory?: string, title?: string): PlaceCategory {
  const text = `${rawCategory || ""} ${title || ""}`.toLowerCase();

  if (
    /카페|커피|디저트|베이커리|제과|마카롱|와플|빙수|tea|cafe|coffee/.test(text)
  ) {
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

  if (
    /음식점|식당|맛집|고기|흑돼지|회|국수|해장국|치킨|피자|분식|일식|중식|양식|술집|포차|횟집|밥집/.test(
      text
    )
  ) {
    return "restaurant";
  }

  return "sightseeing";
}

function getPlaceCategory(place: {
  categoryType?: PlaceCategory;
  title: string;
}): PlaceCategory {
  if (place.categoryType && CATEGORY_STYLES[place.categoryType]) {
    return place.categoryType;
  }
  return inferCategoryType(undefined, place.title);
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

  const mergedMembers = Array.from(
    new Set([...directMembers, ...metaMembers])
  ).filter((name) => !deletedSet.has(name));

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
    return `https://map.naver.com/v5/search/${encodeURIComponent(safeTitle)}?c=${lng},${lat},16,0,0,0,dh`;
  }
  return `https://map.naver.com/v5/?c=${lng},${lat},16,0,0,0,dh`;
}

function getMemberStorageKey(id?: string): string {
  return id ? `jeju_planner_members_plan_${id}` : "jeju_planner_members_draft";
}

function getDeletedMemberStorageKey(id?: string): string {
  return id
    ? `jeju_planner_deleted_members_plan_${id}`
    : "jeju_planner_deleted_members_draft";
}

function getKnownPlansStorageKey(): string {
  return "jeju_planner_known_plans_v1";
}

function loadKnownPlans(): PlanSummaryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getKnownPlansStorageKey());
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
    window.localStorage.setItem(getKnownPlansStorageKey(), JSON.stringify(list));
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
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(getMemberStorageKey(id));
      window.localStorage.removeItem(getDeletedMemberStorageKey(id));
    } catch {
      // 무시
    }
  }
  return next;
}

function loadStoredMembers(id?: string): string[] {
  if (!id || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getMemberStorageKey(id));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string" && Boolean(v.trim()))
      : [];
  } catch {
    return [];
  }
}

function saveStoredMembers(id: string | undefined, list: string[]): void {
  if (!id || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getMemberStorageKey(id), JSON.stringify(list));
  } catch {
    // 무시
  }
}

function loadStoredDeletedMembers(id?: string): string[] {
  if (!id || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getDeletedMemberStorageKey(id));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string" && Boolean(v.trim()))
      : [];
  } catch {
    return [];
  }
}

function saveStoredDeletedMembers(id: string | undefined, list: string[]): void {
  if (!id || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getDeletedMemberStorageKey(id), JSON.stringify(list));
  } catch {
    // 무시
  }
}

function mergePlanMembers(
  planMembers: string[] = [],
  planPlaces: PlaceItem[] = [],
  deletedMembers: string[] = []
): string[] {
  const deletedSet = new Set(deletedMembers.map((m) => m.trim()).filter(Boolean));
  const fromPlaces = planPlaces
    .filter((p) => !isMembersMetaPlace(p))
    .map((p) => p.createdBy?.trim())
    .filter((name): name is string => Boolean(name) && name !== "익명");

  return Array.from(
    new Set([
      ...planMembers.map((m) => m.trim()).filter(Boolean),
      ...fromPlaces,
    ])
  ).filter((name) => !deletedSet.has(name));
}

export default function PlannerWorkspace({
  planId,
  initialTitle = "나의 제주 여행 일정",
  initialPlaces = [],
  initialMembers = [],
}: PlannerWorkspaceProps) {
  const router = useRouter();
  const initialDeleted = loadStoredDeletedMembers(planId);
  const initialParsed = parsePlanPayload(
    initialPlaces,
    initialMembers,
    initialDeleted
  );

  const [showPlanGate, setShowPlanGate] = useState<boolean>(() => !planId);
  const [planGateMode, setPlanGateMode] = useState<PlanGateMode>("choose");
  const [knownPlans, setKnownPlans] = useState<PlanSummaryItem[]>(() => loadKnownPlans());
  const [newPlanTitle, setNewPlanTitle] = useState("제주 여행 일정");
  const [newStartDateTime, setNewStartDateTime] = useState(FALLBACK_START_DT);
  const [newEndDateTime, setNewEndDateTime] = useState(FALLBACK_END_DT);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);

  const [currentPlanId, setCurrentPlanId] = useState<string | undefined>(planId);
  const [planTitle, setPlanTitle] = useState(initialTitle);
  const [places, setPlaces] = useState<PlaceItem[]>(initialParsed.parsedPlaces);
  const [scheduleConfig, setScheduleConfig] = useState<TripScheduleConfig>(
    initialParsed.parsedSchedule
  );
  const [deletedMembers, setDeletedMembers] = useState<string[]>(
    initialParsed.parsedDeletedMembers
  );
  const [members, setMembers] = useState<string[]>(() =>
    mergePlanMembers(
      initialParsed.parsedMembers,
      initialParsed.parsedPlaces,
      initialParsed.parsedDeletedMembers
    )
  );

  useEffect(() => {
    const range = getDefaultTripRange();
    setNewStartDateTime(range.startDateTime);
    setNewEndDateTime(range.endDateTime);
  }, []);

  const [activeUser, setActiveUser] = useState<string | null>(null);
  const [userGateMode, setUserGateMode] = useState<UserGateMode>("choose");
  const [newUserName, setNewUserName] = useState("");
  const [showUserGate, setShowUserGate] = useState<boolean>(Boolean(planId));

  const [viewMode, setViewMode] = useState<WorkspaceViewMode>("map");
  const [activeDayIndex, setActiveDayIndex] = useState<number>(1);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>("09:00");

  const [mapInstance, setMapInstance] = useState<any>(null);
  const [markersRef, setMarkersRef] = useState<any[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<number | null>(null);
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

  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [draftPlace, setDraftPlace] = useState<CandidatePlace | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftMemo, setDraftMemo] = useState("");
  const [draftCategory, setDraftCategory] = useState<PlaceCategory>("sightseeing");
  const [draftMustVisit, setDraftMustVisit] = useState(false);

  const hasHydratedFromDbRef = useRef(false);
  const isApplyingRemoteRef = useRef(false);
  const hasUserMutatedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPlanIdRef = useRef<string | undefined>(currentPlanId);
  const previousViewportRef = useRef<MapViewportSnapshot | null>(null);
  const selectedPlaceIdRef = useRef<number | null>(null);

  const visiblePlaces = places.filter((p) => !isMembersMetaPlace(p));
  const tripDays = useMemo(
    () => computeTripDays(scheduleConfig.startDateTime, scheduleConfig.endDateTime),
    [scheduleConfig.startDateTime, scheduleConfig.endDateTime]
  );

  useEffect(() => {
    if (activeDayIndex > tripDays.length) {
      setActiveDayIndex(tripDays.length);
    } else if (activeDayIndex < 1) {
      setActiveDayIndex(1);
    }
  }, [activeDayIndex, tripDays.length]);

  const filteredPlaces = visiblePlaces.filter((place) => {
    const matchesCategory =
      selectedCategories.length === 0 ||
      selectedCategories.includes(getPlaceCategory(place));
    const matchesMustVisit = !onlyMustVisitFilter || Boolean(place.isMustVisit);
    const matchesUser =
      selectedUserFilter === null ||
      (place.createdBy || "익명") === selectedUserFilter;
    return matchesCategory && matchesMustVisit && matchesUser;
  });

  const filterableUsers = mergePlanMembers(members, visiblePlaces, deletedMembers);

  const currentDayScheduleItems = useMemo(
    () => scheduleConfig.items.filter((item) => item.dayIndex === activeDayIndex),
    [scheduleConfig.items, activeDayIndex]
  );

  useEffect(() => {
    selectedPlaceIdRef.current = selectedPlaceId;
  }, [selectedPlaceId]);

  useEffect(() => {
    currentPlanIdRef.current = currentPlanId;
    if (currentPlanId) {
      saveStoredMembers(currentPlanId, members);
      saveStoredDeletedMembers(currentPlanId, deletedMembers);
    }
  }, [currentPlanId, members, deletedMembers]);

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

  const hydratePlanFromServer = useCallback(async (targetId?: string) => {
    if (!targetId) return;

    setPlaces([]);
    setScheduleConfig({
      startDateTime: FALLBACK_START_DT,
      endDateTime: FALLBACK_END_DT,
      items: [],
    });
    setMembers([]);
    setDeletedMembers([]);
    setSelectedPlaceId(null);
    setSelectedUserFilter(null);
    hasUserMutatedRef.current = false;

    try {
      const { data: row, error } = await supabase
        .from("travel_plans")
        .select("*")
        .eq("id", targetId)
        .maybeSingle();

      if (error) throw error;

      if (row) {
        const localDeleted = loadStoredDeletedMembers(targetId);
        const localMembers = loadStoredMembers(targetId);
        const {
          parsedPlaces,
          parsedMembers,
          parsedDeletedMembers,
          parsedSchedule,
        } = parsePlanPayload(row.places, row.members, localDeleted);

        const nextDeleted = Array.from(new Set([...parsedDeletedMembers, ...localDeleted]));
        const nextMembers = mergePlanMembers(
          [...parsedMembers, ...localMembers],
          parsedPlaces,
          nextDeleted
        );

        const nextTitle =
          typeof row.title === "string" && row.title.trim()
            ? row.title
            : "나의 제주 여행 일정";

        isApplyingRemoteRef.current = true;
        setPlanTitle(nextTitle);
        setPlaces(parsedPlaces);
        setScheduleConfig(parsedSchedule);
        setDeletedMembers(nextDeleted);
        setMembers(nextMembers);
        saveStoredDeletedMembers(targetId, nextDeleted);
        saveStoredMembers(targetId, nextMembers);
        setKnownPlans(
          upsertKnownPlan({
            id: targetId,
            title: nextTitle,
            startDateTime: parsedSchedule.startDateTime,
            endDateTime: parsedSchedule.endDateTime,
            placesCount: parsedPlaces.length,
            updatedAt: row.updated_at,
          })
        );
        setSyncStatus("saved");
        setTimeout(() => {
          isApplyingRemoteRef.current = false;
        }, 120);
      }
    } catch (err) {
      console.error("일정 불러오기 실패:", err);
      setSyncStatus("error");
    } finally {
      hasHydratedFromDbRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (planId) {
      currentPlanIdRef.current = planId;
      setCurrentPlanId(planId);
      setShowPlanGate(false);
      setShowUserGate(true);
      hydratePlanFromServer(planId);
    }
  }, [planId, hydratePlanFromServer]);

  const persistPlanToDb = useCallback(
    async (
      nextTitle: string,
      nextPlaces: PlaceItem[],
      nextMembers: string[],
      nextDeletedMembers: string[] = deletedMembers,
      nextSchedule: TripScheduleConfig = scheduleConfig,
      overridePlanId?: string
    ): Promise<string | undefined> => {
      const activeId = overridePlanId || currentPlanIdRef.current;
      saveStoredMembers(activeId, nextMembers);
      saveStoredDeletedMembers(activeId, nextDeletedMembers);
      setSyncStatus("saving");
      try {
        const cleanPlaces = nextPlaces.filter((p) => !isMembersMetaPlace(p));
        const placesWithMeta = [
          ...cleanPlaces,
          {
            id: MEMBERS_META_ID,
            lat: 0,
            lng: 0,
            title: "__MEMBERS__",
            memo: "",
            members: nextMembers,
            deletedMembers: nextDeletedMembers,
            scheduleConfig: nextSchedule,
          } as PlaceItem & {
            members: string[];
            deletedMembers: string[];
            scheduleConfig: TripScheduleConfig;
          },
        ];

        const payload = {
          title: nextTitle,
          places: placesWithMeta,
          members: nextMembers,
        };

        let savedId = activeId;

        if (activeId) {
          const res = await fetch(`/api/plans/${activeId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error("업데이트 실패");
        } else {
          const res = await fetch("/api/plans", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error("생성 실패");
          const data = await res.json();
          if (data?.id) {
            savedId = data.id;
            currentPlanIdRef.current = data.id;
            setCurrentPlanId(data.id);
            saveStoredMembers(data.id, nextMembers);
            saveStoredDeletedMembers(data.id, nextDeletedMembers);
            router.replace(`/plan/${data.id}`);
          }
        }

        if (savedId) {
          setKnownPlans(
            upsertKnownPlan({
              id: savedId,
              title: nextTitle,
              startDateTime: nextSchedule.startDateTime,
              endDateTime: nextSchedule.endDateTime,
              placesCount: cleanPlaces.length,
              updatedAt: new Date().toISOString(),
            })
          );
        }

        setSyncStatus("saved");
        return savedId;
      } catch (error) {
        console.error("자동 저장 오류:", error);
        setSyncStatus("error");
        return activeId;
      }
    },
    [deletedMembers, router, scheduleConfig]
  );

  const handleCreateNewTripPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = newPlanTitle.trim() || "제주 여행 일정";
    const effectiveStart = newStartDateTime || getDefaultTripRange().startDateTime;
    const effectiveEnd = newEndDateTime || getDefaultTripRange().endDateTime;

    if (!effectiveStart || !effectiveEnd) {
      alert("시작 날짜/시간과 종료 날짜/시간을 모두 선택해 주세요.");
      return;
    }
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

      hasUserMutatedRef.current = false;
      setPlanTitle(trimmedTitle);
      setPlaces([]);
      setScheduleConfig(initialSchedule);
      setMembers([]);
      setDeletedMembers([]);
      setActiveUser(null);
      setSelectedUserFilter(null);
      setActiveDayIndex(1);
      setViewMode("map");

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
      const data = await res.json();
      const createdId = data?.id;

      if (createdId) {
        currentPlanIdRef.current = createdId;
        setCurrentPlanId(createdId);
        saveStoredMembers(createdId, []);
        saveStoredDeletedMembers(createdId, []);
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

      hasHydratedFromDbRef.current = true;
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
    currentPlanIdRef.current = targetPlanId;
    setCurrentPlanId(targetPlanId);
    setActiveUser(null);
    setSelectedUserFilter(null);
    setActiveDayIndex(1);
    setViewMode("map");
    hasHydratedFromDbRef.current = false;
    await hydratePlanFromServer(targetPlanId);
    setShowPlanGate(false);
    setUserGateMode("choose");
    setShowUserGate(true);
  };

  const handleRemoveKnownPlan = async (targetId: string) => {
    try {
      const { error } = await supabase
        .from("travel_plans")
        .delete()
        .eq("id", targetId);

      if (error) throw error;

      const next = removeKnownPlan(targetId);
      setKnownPlans(next);

      if (currentPlanIdRef.current === targetId) {
        currentPlanIdRef.current = undefined;
        setCurrentPlanId(undefined);
        setPlaces([]);
        setMembers([]);
        setDeletedMembers([]);
        setActiveUser(null);
        router.replace("/");
      }
    } catch (err) {
      console.error("일정 삭제 실패:", err);
      alert("여행 일정을 삭제하는 중 오류가 발생했습니다.");
    }
  };

  useEffect(() => {
    if (showPlanGate || showUserGate) return;
    if (!hasHydratedFromDbRef.current) return;
    if (isApplyingRemoteRef.current) return;
    if (!hasUserMutatedRef.current) return;
    if (!currentPlanIdRef.current) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      persistPlanToDb(planTitle, visiblePlaces, members, deletedMembers, scheduleConfig);
    }, 300);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, planTitle, members, deletedMembers, scheduleConfig, showPlanGate, showUserGate, persistPlanToDb]);

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
          const updated = payload.new as {
            title?: string;
            places?: unknown;
            members?: unknown;
          };
          if (!updated) return;

          if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
          }

          const {
            parsedPlaces,
            parsedMembers,
            parsedDeletedMembers,
            parsedSchedule,
          } = parsePlanPayload(
            updated.places,
            updated.members,
            deletedMembers
          );

          isApplyingRemoteRef.current = true;
          if (typeof updated.title === "string" && updated.title.trim()) {
            setPlanTitle(updated.title);
          }
          setPlaces(parsedPlaces);
          setScheduleConfig(parsedSchedule);
          setDeletedMembers(parsedDeletedMembers);
          setMembers(
            mergePlanMembers(parsedMembers, parsedPlaces, parsedDeletedMembers)
          );
          setSyncStatus("saved");

          setTimeout(() => {
            isApplyingRemoteRef.current = false;
          }, 120);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentPlanId, deletedMembers]);

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

      if (selectedPlaceIdRef.current === null && !previousViewportRef.current) {
        const currentCenter = mapInstance.getCenter();
        previousViewportRef.current = {
          lat: currentCenter.lat(),
          lng: currentCenter.lng(),
          zoom: mapInstance.getZoom(),
        };
      }

      setSelectedPlaceId(place.id);
      mapInstance.setCenter(new window.naver.maps.LatLng(place.lat, place.lng));
      mapInstance.setZoom(15);
    },
    [mapInstance, markerDisplayMode]
  );

  const handleMapClick = useCallback(() => {
    if (selectedPlaceIdRef.current !== null || previousViewportRef.current) {
      resetSelectionAndViewport();
    }
  }, [resetSelectionAndViewport]);

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

    const initMap = () => {
      if (cancelled) return;
      const mapEl = document.getElementById("map");
      if (!mapEl) return;
      if (window.naver && window.naver.maps) {
        const firstPlace = visiblePlaces[0];
        const centerLat = firstPlace ? firstPlace.lat : 33.3846;
        const centerLng = firstPlace ? firstPlace.lng : 126.5535;
        const zoomLevel = firstPlace ? 12 : 10;

        const map = new window.naver.maps.Map(mapEl, {
          center: new window.naver.maps.LatLng(centerLat, centerLng),
          zoom: zoomLevel,
        });
        setMapInstance(map);
      }
    };

    if (window.naver && window.naver.maps) {
      initMap();
    } else {
      const checkInterval = setInterval(() => {
        if (window.naver && window.naver.maps) {
          clearInterval(checkInterval);
          initMap();
        }
      }, 100);
      return () => {
        cancelled = true;
        clearInterval(checkInterval);
      };
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPlanGate, showUserGate, viewMode]);

  useEffect(() => {
    if (!mapInstance || !window.naver || viewMode !== "map") return;
    const listener = window.naver.maps.Event.addListener(mapInstance, "click", handleMapClick);
    return () => {
      window.naver.maps.Event.removeListener(listener);
    };
  }, [mapInstance, viewMode, handleMapClick]);

  useEffect(() => {
    if (!mapInstance || !window.naver || viewMode !== "map") return;

    markersRef.forEach((m) => m.setMap(null));

    if (markerDisplayMode === "hidden") {
      setMarkersRef([]);
      return;
    }

    const nextMarkers = filteredPlaces.map((p, idx) => {
      const isSelected = p.id === selectedPlaceId;
      const position = new window.naver.maps.LatLng(p.lat, p.lng);
      const cat = getPlaceCategory(p);
      const style = CATEGORY_STYLES[cat];
      const isCompact = markerDisplayMode === "compact" && !isSelected;
      const isStarred = Boolean(p.isMustVisit);

      const starBadgeHtml = isStarred
        ? `<span style="
            position: absolute;
            top: -7px;
            right: -6px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 16px;
            height: 16px;
            border-radius: 9999px;
            background: #facc15;
            border: 1.5px solid #ffffff;
            box-shadow: 0 2px 4px rgba(0,0,0,0.22);
            font-size: 10px;
            line-height: 1;
          ">⭐</span>`
        : "";

      const marker = new window.naver.maps.Marker({
        position,
        map: mapInstance,
        cursor: "pointer",
        title: `${isStarred ? "⭐ " : ""}${p.title} (${style.label})`,
        zIndex: isSelected ? 200 : isStarred ? 150 + idx : 100 + idx,
        icon: isCompact
          ? {
              content: `
                <div style="
                  position: relative;
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  width: 28px;
                  height: 28px;
                  border-radius: 9999px;
                  background: ${style.pinBorder};
                  color: #ffffff;
                  border: 2px solid ${isStarred ? "#facc15" : "#ffffff"};
                  box-shadow: 0 3px 8px rgba(0,0,0,0.22);
                  font-size: 12px;
                  font-weight: 800;
                  cursor: pointer;
                ">
                  <span>${style.icon}</span>
                  ${starBadgeHtml}
                </div>
              `,
              anchor: new window.naver.maps.Point(14, 14),
            }
          : {
              content: `
                <div style="
                  position: relative;
                  display: inline-flex;
                  align-items: center;
                  gap: 6px;
                  padding: 6px 10px;
                  border-radius: 9999px;
                  background: ${isSelected ? style.pinBorder : style.pinBg};
                  color: ${isSelected ? "#ffffff" : style.pinText};
                  border: 2px solid ${style.pinBorder};
                  box-shadow: 0 4px 10px rgba(0,0,0,0.18);
                  font-size: 12px;
                  font-weight: 700;
                  white-space: nowrap;
                  cursor: pointer;
                  transform: ${isSelected ? "scale(1.08)" : "scale(1)"};
                  transition: transform 0.15s ease, background-color 0.15s ease;
                ">
                  <span style="
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 20px;
                    height: 20px;
                    border-radius: 9999px;
                    background: ${isSelected ? "#ffffff" : style.pinBorder};
                    color: ${isSelected ? style.pinBorder : "#ffffff"};
                    font-size: 11px;
                  ">${style.icon}</span>
                  <span>${idx + 1}. ${p.title}</span>
                  ${starBadgeHtml}
                </div>
              `,
              anchor: new window.naver.maps.Point(16, 16),
            },
      });

      const hoverText = `${isStarred ? "⭐ " : ""}${style.icon} ${p.title} · ${style.label}`;

      window.naver.maps.Event.addListener(marker, "mouseover", () => {
        setHoveredPlaceTitle(hoverText);
        marker.setZIndex(300);
      });

      window.naver.maps.Event.addListener(marker, "mouseout", () => {
        setHoveredPlaceTitle((prev) => (prev === hoverText ? null : prev));
        marker.setZIndex(isSelected ? 200 : isStarred ? 150 + idx : 100 + idx);
      });

      window.naver.maps.Event.addListener(marker, "click", () => {
        handleSelectPin(p);
      });

      return marker;
    });

    setMarkersRef(nextMarkers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    places,
    mapInstance,
    viewMode,
    selectedPlaceId,
    markerDisplayMode,
    selectedCategories,
    onlyMustVisitFilter,
    selectedUserFilter,
    handleSelectPin,
  ]);

  const handleToggleCategoryFilter = (cat: PlaceCategory) => {
    setSelectedCategories((prev) => {
      if (prev.includes(cat)) {
        return prev.filter((item) => item !== cat);
      }
      const next = [...prev, cat];
      return next.length === CATEGORY_ORDER.length ? [] : next;
    });
  };

  const handleResetAllCategoryFilters = () => {
    setSelectedCategories([]);
    setOnlyMustVisitFilter(false);
  };

  const handleRegisterNewUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newUserName.trim();
    if (!trimmed) return;

    hasUserMutatedRef.current = true;
    const nextDeleted = deletedMembers.filter((m) => m !== trimmed);
    const updatedMembers = mergePlanMembers([...members, trimmed], visiblePlaces, nextDeleted);

    setDeletedMembers(nextDeleted);
    setMembers(updatedMembers);
    saveStoredDeletedMembers(currentPlanIdRef.current, nextDeleted);
    saveStoredMembers(currentPlanIdRef.current, updatedMembers);
    setActiveUser(trimmed);
    setNewUserName("");
    setShowUserGate(false);

    await persistPlanToDb(planTitle, visiblePlaces, updatedMembers, nextDeleted, scheduleConfig);
  };

  const handlePickExistingUser = async (name: string) => {
    setActiveUser(name);
    setShowUserGate(false);
    await hydratePlanFromServer(currentPlanIdRef.current);
  };

  const handleDeleteUser = async (targetName: string) => {
    hasUserMutatedRef.current = true;
    const nextDeleted = Array.from(new Set([...deletedMembers, targetName]));
    const nextMembers = members.filter((m) => m !== targetName);

    setDeletedMembers(nextDeleted);
    setMembers(nextMembers);
    saveStoredDeletedMembers(currentPlanIdRef.current, nextDeleted);
    saveStoredMembers(currentPlanIdRef.current, nextMembers);

    if (activeUser === targetName) {
      setActiveUser(null);
    }
    if (selectedUserFilter === targetName) {
      setSelectedUserFilter(null);
    }

    await persistPlanToDb(planTitle, visiblePlaces, nextMembers, nextDeleted, scheduleConfig);
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
    } catch (error) {
      console.error("검색 요청 실패:", error);
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

    hasUserMutatedRef.current = true;
    const nextPlaces: PlaceItem[] = [
      ...visiblePlaces,
      {
        id: Date.now(),
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
    setDraftPlace(null);
    setDraftTitle("");
    setDraftMemo("");
    setDraftMustVisit(false);
    setSearchKeyword("");

    await persistPlanToDb(planTitle, nextPlaces, members, deletedMembers, scheduleConfig);
  };

  const handleUpdateMemo = (id: number, nextMemo: string) => {
    hasUserMutatedRef.current = true;
    setPlaces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, memo: nextMemo } : p))
    );
  };

  const handleChangePlaceCategory = (id: number, nextCategory: PlaceCategory) => {
    hasUserMutatedRef.current = true;
    setPlaces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, categoryType: nextCategory } : p))
    );
    setEditingCategoryPlaceId(null);
  };

  const handleTogglePlaceMustVisit = (id: number) => {
    hasUserMutatedRef.current = true;
    setPlaces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isMustVisit: !p.isMustVisit } : p))
    );
  };

  const handleDeletePlace = (id: number) => {
    hasUserMutatedRef.current = true;
    if (selectedPlaceId === id) {
      resetSelectionAndViewport();
    }
    if (editingCategoryPlaceId === id) {
      setEditingCategoryPlaceId(null);
    }
    setPlaces((prev) => prev.filter((p) => p.id !== id));
  };

  const handleAddPlaceToDaySchedule = async (place: PlaceItem, targetSlot?: string) => {
    const slot = targetSlot || selectedTimeSlot || "09:00";
    hasUserMutatedRef.current = true;

    const newSlotItem: ScheduleSlotItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      dayIndex: activeDayIndex,
      timeSlot: slot,
      placeId: place.id,
      title: place.title,
      memo: place.memo,
      categoryType: getPlaceCategory(place),
      isMustVisit: Boolean(place.isMustVisit),
      createdBy: place.createdBy || "익명",
    };

    const nextSchedule: TripScheduleConfig = {
      ...scheduleConfig,
      items: [...scheduleConfig.items, newSlotItem],
    };

    setScheduleConfig(nextSchedule);
    await persistPlanToDb(planTitle, visiblePlaces, members, deletedMembers, nextSchedule);
  };

  const handleRemoveScheduleItem = async (slotItemId: string) => {
    hasUserMutatedRef.current = true;
    const nextSchedule: TripScheduleConfig = {
      ...scheduleConfig,
      items: scheduleConfig.items.filter((it) => it.id !== slotItemId),
    };
    setScheduleConfig(nextSchedule);
    await persistPlanToDb(planTitle, visiblePlaces, members, deletedMembers, nextSchedule);
  };

  const handleUpdateScheduleItemSlot = async (slotItemId: string, nextTimeSlot: string) => {
    hasUserMutatedRef.current = true;
    const nextSchedule: TripScheduleConfig = {
      ...scheduleConfig,
      items: scheduleConfig.items.map((it) =>
        it.id === slotItemId ? { ...it, timeSlot: nextTimeSlot } : it
      ),
    };
    setScheduleConfig(nextSchedule);
    await persistPlanToDb(planTitle, visiblePlaces, members, deletedMembers, nextSchedule);
  };

  const handleCopyShareLink = async () => {
    if (!currentPlanIdRef.current) {
      hasUserMutatedRef.current = true;
      await persistPlanToDb(planTitle, visiblePlaces, members, deletedMembers, scheduleConfig);
    }
    const targetId = currentPlanIdRef.current;
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

  const statusLabel = {
    idle: currentPlanId ? "실시간 동기화 중" : "추가 시 자동 저장",
    saving: "DB 저장 중...",
    saved: "자동 저장 완료 · 실시간 동기화",
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
                className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors cursor-pointer shadow-xs"
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
                  placeholder="예: 11월 제주 우정 여행"
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

              <div className="rounded-xl bg-emerald-50/70 border border-emerald-200/80 px-3.5 py-2.5 text-xs text-emerald-900 flex items-center justify-between">
                <span>예상 여행 기간</span>
                <span className="font-bold">
                  총 {computeTripDays(newStartDateTime, newEndDateTime).length}일차 일정 생성
                </span>
              </div>

              <button
                type="submit"
                disabled={isCreatingPlan}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
              >
                {isCreatingPlan ? "일정 생성 중..." : "여행 일정 만들고 사용자 선택으로 이동"}
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
                    const dayCount = computeTripDays(item.startDateTime, item.endDateTime).length;
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
                          title="일정 삭제"
                          className="text-xs text-gray-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors cursor-pointer shrink-0"
                        >
                          삭제
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
                        title={`${name} 삭제`}
                        className="text-xs text-gray-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors cursor-pointer shrink-0"
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
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-white">
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
            title="다른 여행 일정 선택 또는 생성"
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
            title="사용자 변경 또는 추가"
          >
            {activeUser ? `👤 ${activeUser}` : "사용자 설정"}
          </button>

          <button
            type="button"
            onClick={handleCopyShareLink}
            className="px-3.5 py-2 text-xs sm:text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg transition-colors cursor-pointer shadow-xs"
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

              <div className="hidden sm:flex items-center gap-1 bg-white/95 backdrop-blur-xs p-1 rounded-lg shadow-md border border-gray-200 text-xs">
                <button
                  type="button"
                  onClick={() => setMarkerDisplayMode("full")}
                  className={`px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                    markerDisplayMode === "full"
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  전체
                </button>
                <button
                  type="button"
                  onClick={() => setMarkerDisplayMode("compact")}
                  className={`px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                    markerDisplayMode === "compact"
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  간략히 보기
                </button>
                <button
                  type="button"
                  onClick={() => setMarkerDisplayMode("hidden")}
                  className={`px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                    markerDisplayMode === "hidden"
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  숨기기
                </button>
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
                  placeholder="장소·명소·상호 검색 (예: 협재해수욕장, 성산일출봉)"
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
                    const inferred = CATEGORY_STYLES[inferCategoryType(item.category, item.title)];
                    return (
                      <li
                        key={`${item.title}-${idx}`}
                        onClick={() => handleSelectCandidate(item)}
                        className="p-3 hover:bg-emerald-50 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm text-gray-900">{item.title}</span>
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

                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">카테고리 꼬리표</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {CATEGORY_ORDER.map((catKey) => {
                        const cStyle = CATEGORY_STYLES[catKey];
                        const active = draftCategory === catKey;
                        return (
                          <button
                            key={catKey}
                            type="button"
                            onClick={() => setDraftCategory(catKey)}
                            className={`py-1.5 px-1 rounded-lg border text-[11px] font-semibold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
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
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">장소명</label>
                    <input
                      type="text"
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      placeholder="장소명을 확인하거나 수정하세요"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">메모</label>
                    <input
                      type="text"
                      value={draftMemo}
                      onChange={(e) => setDraftMemo(e.target.value)}
                      placeholder="메모를 바로 입력하세요 (선택)"
                      autoFocus
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setDraftMustVisit((prev) => !prev)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                        draftMustVisit
                          ? "bg-amber-50 text-amber-800 border-amber-300 ring-1 ring-amber-300"
                          : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
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
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900 underline underline-offset-2 shrink-0"
                    >
                      네이버 지도 ↗
                    </a>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
                  >
                    일정에 추가하고 자동 저장
                  </button>
                </form>
              )}
            </div>

            <div id="map" className="w-full h-full bg-gray-200" />
          </section>

          <section className="w-full h-1/2 md:w-[40%] md:h-full overflow-y-auto bg-white p-6 md:p-10">
            <div className="max-w-2xl mx-auto">
              {selectedPlace && selectedCategoryStyle && (
                <div
                  className={`mb-6 p-4 rounded-2xl border-2 shadow-sm space-y-2.5 relative ${selectedCategoryStyle.cardBorder} ${selectedCategoryStyle.cardSelectedBg}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-bold ${selectedCategoryStyle.badgeBg}`}
                      >
                        <span>{selectedCategoryStyle.icon}</span>
                        <span>{selectedCategoryStyle.label}</span>
                      </span>
                      {selectedPlace.isMustVisit && (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold">
                          ⭐ 꼭 가고 싶은 곳
                        </span>
                      )}
                      <span className="text-xs font-semibold text-gray-600">
                        #{selectedIndex + 1}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={resetSelectionAndViewport}
                      className="text-xs font-medium text-gray-700 hover:text-gray-950 bg-white/90 px-2.5 py-1 rounded-md border border-gray-200 cursor-pointer"
                    >
                      원위치로 닫기
                    </button>
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h2 className="text-lg font-bold text-gray-900">{selectedPlace.title}</h2>
                      <input
                        type="text"
                        value={selectedPlace.memo}
                        onChange={(e) => handleUpdateMemo(selectedPlace.id, e.target.value)}
                        placeholder="멘트를 입력해 보세요..."
                        className="w-full text-sm text-gray-700 mt-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 focus:border-emerald-500 outline-none"
                      />
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <a
                          href={buildNaverMapCoordUrl(
                            selectedPlace.title,
                            selectedPlace.lat,
                            selectedPlace.lng
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline underline-offset-2"
                        >
                          네이버 지도에서 열기 ↗
                        </a>
                        <span className="text-[11px] text-gray-400 select-none">
                          by {selectedPlace.createdBy || "익명"}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeletePlace(selectedPlace.id)}
                      className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 rounded cursor-pointer shrink-0"
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
                      hasUserMutatedRef.current = true;
                      setPlanTitle(e.target.value);
                    }}
                    className="w-full text-2xl font-bold text-gray-900 tracking-tight border-b border-transparent hover:border-gray-200 focus:border-emerald-500 outline-none pb-1"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    카테고리 아이콘이나 ⭐ 표시를 눌러 필터링하고 상태를 바꿀 수 있습니다.
                  </p>
                </div>

                <div className="relative flex items-center gap-1 bg-gray-100 p-1 rounded-lg text-xs shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUserFilter(null);
                      setIsUserFilterOpen(false);
                    }}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      selectedUserFilter === null
                        ? "bg-white text-gray-900 shadow-2xs"
                        : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    등록순
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsUserFilterOpen((prev) => !prev)}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer inline-flex items-center gap-1 ${
                      selectedUserFilter !== null
                        ? "bg-white text-emerald-700 shadow-2xs font-semibold"
                        : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    <span>{selectedUserFilter ? `👤 ${selectedUserFilter}` : "이름 선택"}</span>
                    <span className="text-[10px]">▾</span>
                  </button>

                  {isUserFilterOpen && (
                    <div className="absolute right-0 top-9 z-30 min-w-[140px] bg-white border border-gray-200 rounded-xl shadow-lg p-1.5 space-y-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUserFilter(null);
                          setIsUserFilterOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                          selectedUserFilter === null
                            ? "bg-emerald-50 text-emerald-700 font-semibold"
                            : "text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        전체 보기
                      </button>
                      {filterableUsers.length === 0 ? (
                        <div className="px-2.5 py-1.5 text-[11px] text-gray-400">
                          등록된 사용자 없음
                        </div>
                      ) : (
                        filterableUsers.map((userName) => (
                          <button
                            key={userName}
                            type="button"
                            onClick={() => {
                              setSelectedUserFilter(userName);
                              setIsUserFilterOpen(false);
                            }}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-between ${
                              selectedUserFilter === userName
                                ? "bg-emerald-50 text-emerald-700 font-semibold"
                                : "text-gray-700 hover:bg-gray-100"
                            }`}
                          >
                            <span>{userName}</span>
                            {selectedUserFilter === userName && <span>✓</span>}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-6 flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleResetAllCategoryFilters}
                  className={`px-2.5 py-1 rounded-full border text-xs font-semibold transition-colors cursor-pointer ${
                    isAllFilterActive
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
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
                      onClick={() => handleToggleCategoryFilter(catKey)}
                      className={`px-2.5 py-1 rounded-full border text-xs font-semibold inline-flex items-center gap-1 transition-all cursor-pointer ${
                        isSelectedCat
                          ? `${cStyle.badgeBg} ring-2 ring-offset-1 ring-gray-300`
                          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
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
                  title="꼭 가고 싶은 곳만 보기"
                  className={`px-2.5 py-1 rounded-full border text-xs font-semibold inline-flex items-center justify-center transition-all cursor-pointer ${
                    onlyMustVisitFilter
                      ? "bg-amber-100 text-amber-800 border-amber-300 ring-2 ring-offset-1 ring-amber-300"
                      : "bg-white text-gray-600 border-gray-200 hover:bg-amber-50/60"
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
                            ? `${cStyle.cardBorder} ${cStyle.cardSelectedBg} ring-2 ring-offset-1 ring-gray-200 shadow-xs`
                            : `${cStyle.cardBorder} ${cStyle.cardHoverBorder} bg-white shadow-xs`
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
                                  setEditingCategoryPlaceId((prev) => (prev === p.id ? null : p.id));
                                }}
                                title="카테고리 변경하기"
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold shrink-0 transition-transform active:scale-95 cursor-pointer ${cStyle.badgeBg}`}
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
                                title={
                                  p.isMustVisit
                                    ? "꼭 가고 싶은 곳 해제"
                                    : "꼭 가고 싶은 곳으로 표시"
                                }
                                className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full border text-[11px] transition-transform active:scale-95 cursor-pointer shrink-0 ${
                                  p.isMustVisit
                                    ? "bg-amber-100 text-amber-800 border-amber-300"
                                    : "bg-gray-50 text-gray-400 border-gray-200 hover:text-amber-500 hover:border-amber-200"
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
                                    const isCurrent = cat === catKey;
                                    return (
                                      <button
                                        key={catKey}
                                        type="button"
                                        onClick={() => handleChangePlaceCategory(p.id, catKey)}
                                        className={`px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                                          isCurrent
                                            ? `${optionStyle.badgeBg} ring-1 ring-gray-400`
                                            : "hover:bg-gray-100 text-gray-700"
                                        }`}
                                      >
                                        <span>{optionStyle.icon}</span>
                                        <span>{optionStyle.label}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            <input
                              type="text"
                              value={p.memo}
                              onChange={(e) => handleUpdateMemo(p.id, e.target.value)}
                              placeholder="멘트를 입력해 보세요..."
                              className="w-full text-xs text-gray-600 mt-1.5 px-2 py-1 rounded border border-transparent hover:border-gray-200 focus:border-emerald-400 focus:bg-emerald-50/30 outline-none transition-colors"
                            />
                            <div className="mt-2 pt-1.5 border-t border-gray-100 flex items-center justify-between gap-2 px-2">
                              <a
                                href={buildNaverMapCoordUrl(p.title, p.lat, p.lng)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-900 underline underline-offset-2"
                              >
                                네이버 지도 링크 ↗
                              </a>
                              <span className="text-[10px] tracking-tight text-gray-400/90 select-none">
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
                          className="text-gray-400 hover:text-red-500 text-sm px-2 py-1 rounded transition-colors cursor-pointer shrink-0"
                          title="삭제"
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
          {/* 좌측: 1일차 ~ N일차 연속 스크롤 시간표 */}
          <section className="w-full h-3/5 md:w-[60%] md:h-full flex flex-col border-b md:border-b-0 md:border-r border-gray-200 bg-white min-h-0 overflow-hidden">
            {/* 상단 요약 + 1일차·2일차·3일차 탭 */}
            <div className="px-5 py-3.5 border-b border-gray-200 shrink-0 bg-white space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                      {activeDayIndex}일차 선택 중
                    </span>
                    <span className="text-xs text-gray-500">
                      총 {tripDays.length}일차 · 1일차부터 {tripDays.length}일차까지 아래로 쭉 이어집니다
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    원하는 일차·시간대를 고른 뒤 우측 저장된 장소 카드를 클릭하면 해당 일차 시간표에 추가됩니다.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setViewMode("map")}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 shrink-0"
                >
                  <span>🗺️</span>
                  <span>지도로 돌아가기</span>
                </button>
              </div>

              {/* 상단 일차 숫자 탭 */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {tripDays.map((day) => {
                  const isSelectedDay = day.dayIndex === activeDayIndex;
                  return (
                    <button
                      key={day.dayIndex}
                      type="button"
                      onClick={() => {
                        setActiveDayIndex(day.dayIndex);
                        const el = document.getElementById(`schedule-day-${day.dayIndex}`);
                        if (el) {
                          el.scrollIntoView({ behavior: "smooth", block: "start" });
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer border ${
                        isSelectedDay
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                          : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      {day.dayIndex}일차
                      {day.dateLabel ? ` (${day.dateLabel})` : ""}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 1일차 ~ N일차 전체 연속 스크롤 영역 */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-6 bg-white">
              {tripDays.map((day) => {
                const dayItems = scheduleConfig.items.filter(
                  (item) => item.dayIndex === day.dayIndex
                );
                const isCurrentDay = day.dayIndex === activeDayIndex;

                return (
                  <div
                    key={day.dayIndex}
                    id={`schedule-day-${day.dayIndex}`}
                    onClick={() => setActiveDayIndex(day.dayIndex)}
                    className={`rounded-2xl border p-3.5 transition-colors ${
                      isCurrentDay
                        ? "border-emerald-300 bg-emerald-50/15"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                          {day.dayIndex}일차
                        </span>
                        {day.dateLabel && (
                          <span className="text-sm font-semibold text-gray-800">
                            {day.dateLabel}
                            {day.weekdayLabel ? ` (${day.weekdayLabel})` : ""}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-gray-400">
                        일정 {dayItems.length}개
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {TIME_SLOTS.map((slot) => {
                        const slotItems = dayItems.filter((it) => it.timeSlot === slot);
                        const isSelectedSlot =
                          isCurrentDay && selectedTimeSlot === slot;

                        return (
                          <div
                            key={`${day.dayIndex}-${slot}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveDayIndex(day.dayIndex);
                              setSelectedTimeSlot(slot);
                            }}
                            className={`rounded-xl border p-2 transition-all flex items-start gap-3 cursor-pointer ${
                              isSelectedSlot
                                ? "border-emerald-400 bg-emerald-50/50 ring-1 ring-emerald-300"
                                : "border-gray-100 bg-white hover:border-gray-200"
                            }`}
                          >
                            <div className="w-12 shrink-0 pt-0.5 flex flex-col items-start">
                              <span
                                className={`text-xs font-bold tabular-nums ${
                                  isSelectedSlot ? "text-emerald-700" : "text-gray-500"
                                }`}
                              >
                                {slot}
                              </span>
                              {isSelectedSlot && (
                                <span className="text-[10px] text-emerald-600 font-semibold">
                                  선택됨
                                </span>
                              )}
                            </div>

                            <div className="flex-1 min-w-0 space-y-1.5">
                              {slotItems.length === 0 ? (
                                <div className="h-6 flex items-center text-[11px] text-gray-400">
                                  {isSelectedSlot
                                    ? `우측 장소를 클릭하면 ${day.dayIndex}일차 ${slot}에 추가됩니다`
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
                                      className={`p-2 rounded-lg border ${cStyle.cardBorder} ${cStyle.cardSelectedBg} flex items-center justify-between gap-2`}
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span
                                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cStyle.badgeBg}`}
                                          >
                                            {cStyle.icon} {cStyle.label}
                                          </span>
                                          {sc.isMustVisit && (
                                            <span className="text-[11px] font-bold text-amber-700">
                                              ⭐
                                            </span>
                                          )}
                                          <span className="text-sm font-semibold text-gray-900 truncate">
                                            {sc.title}
                                          </span>
                                        </div>
                                        {sc.memo && (
                                          <p className="text-xs text-gray-600 mt-0.5 truncate">
                                            {sc.memo}
                                          </p>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <select
                                          value={sc.timeSlot}
                                          onChange={(e) =>
                                            handleUpdateScheduleItemSlot(
                                              sc.id,
                                              e.target.value
                                            )
                                          }
                                          aria-label="시간대 변경"
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
                                          title="시간표에서 제거"
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
                  </div>
                );
              })}
            </div>
          </section>

          {/* 우측: 저장된 장소 보드 */}
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
                  아직 저장된 장소가 없습니다. ‘지도로 돌아가기’를 눌러 장소를 먼저
                  저장해 보세요!
                </div>
              ) : (
                <div className="space-y-2.5">
                  {visiblePlaces.map((place) => {
                    const cat = getPlaceCategory(place);
                    const cStyle = CATEGORY_STYLES[cat];
                    const addedCountOnDay = scheduleConfig.items.filter(
                      (sc) =>
                        sc.dayIndex === activeDayIndex && sc.placeId === place.id
                    ).length;

                    return (
                      <button
                        key={place.id}
                        type="button"
                        onClick={() => handleAddPlaceToDaySchedule(place)}
                        className={`w-full text-left p-3.5 rounded-xl border ${cStyle.cardBorder} ${cStyle.cardHoverBorder} bg-white hover:bg-emerald-50/30 transition-all cursor-pointer shadow-2xs space-y-1.5`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${cStyle.badgeBg}`}
                            >
                              {cStyle.icon} {cStyle.label}
                            </span>
                            {place.isMustVisit && (
                              <span className="text-xs font-bold text-amber-600 shrink-0">
                                ⭐
                              </span>
                            )}
                            <span className="font-semibold text-sm text-gray-900 truncate">
                              {place.title}
                            </span>
                          </div>

                          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md shrink-0">
                            + {activeDayIndex}일차 추가
                          </span>
                        </div>

                        {place.memo && (
                          <p className="text-xs text-gray-600 line-clamp-2 pl-0.5">
                            {place.memo}
                          </p>
                        )}

                        <div className="pt-1 flex items-center justify-between text-[11px] text-gray-400">
                          <span>작성: {place.createdBy || "익명"}</span>
                          {addedCountOnDay > 0 && (
                            <span className="text-emerald-700 font-semibold">
                              {activeDayIndex}일차에 {addedCountOnDay}회 담김
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