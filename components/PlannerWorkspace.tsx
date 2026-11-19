"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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

type EntryMode = "choose" | "existing" | "new";
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

function getPlaceCategory(place: PlaceItem): PlaceCategory {
  if (place.categoryType && CATEGORY_STYLES[place.categoryType]) {
    return place.categoryType;
  }
  return inferCategoryType(undefined, place.title);
}

const MEMBERS_META_ID = -999999;

function isMembersMetaPlace(place: PlaceItem): boolean {
  return place.id === MEMBERS_META_ID || place.title === "__MEMBERS__";
}

function buildNaverMapCoordUrl(title: string, lat: number, lng: number): string {
  const safeTitle = title.trim();
  if (safeTitle) {
    return `https://map.naver.com/v5/search/${encodeURIComponent(safeTitle)}?c=${lng},${lat},16,0,0,0,dh`;
  }
  return `https://map.naver.com/v5/?c=${lng},${lat},16,0,0,0,dh`;
}

function getMemberStorageKey(id?: string): string {
  return `jeju_planner_members_${id || "default"}`;
}

function loadStoredMembers(id?: string): string[] {
  if (typeof window === "undefined") return [];
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
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getMemberStorageKey(id), JSON.stringify(list));
  } catch {
    // 스토리지 제한 무시
  }
}

function mergeMembers(
  initialMembers: string[] = [],
  places: PlaceItem[] = [],
  storedMembers: string[] = []
): string[] {
  const fromPlaces = places
    .filter((p) => !isMembersMetaPlace(p))
    .map((p) => p.createdBy?.trim())
    .filter((name): name is string => Boolean(name) && name !== "익명");

  return Array.from(
    new Set([
      ...initialMembers.map((m) => m.trim()).filter(Boolean),
      ...storedMembers.map((m) => m.trim()).filter(Boolean),
      ...fromPlaces,
    ])
  );
}

export default function PlannerWorkspace({
  planId,
  initialTitle = "나의 제주 여행 일정",
  initialPlaces = [],
  initialMembers = [],
}: PlannerWorkspaceProps) {
  const router = useRouter();
  const cleanInitialPlaces = initialPlaces.filter((p) => !isMembersMetaPlace(p));

  const [currentPlanId, setCurrentPlanId] = useState<string | undefined>(planId);
  const [planTitle, setPlanTitle] = useState(initialTitle);
  const [places, setPlaces] = useState<PlaceItem[]>(cleanInitialPlaces);
  const [members, setMembers] = useState<string[]>(() =>
    mergeMembers(initialMembers, cleanInitialPlaces, loadStoredMembers(planId))
  );
  const [activeUser, setActiveUser] = useState<string | null>(null);

  const [entryMode, setEntryMode] = useState<EntryMode>("choose");
  const [newUserName, setNewUserName] = useState("");
  const [showUserGate, setShowUserGate] = useState(true);

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

  const isFirstMountRef = useRef(true);
  const isApplyingRemoteRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPlanIdRef = useRef<string | undefined>(planId);
  const previousViewportRef = useRef<MapViewportSnapshot | null>(null);
  const selectedPlaceIdRef = useRef<number | null>(null);

  const visiblePlaces = places.filter((p) => !isMembersMetaPlace(p));

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

  const filterableUsers = mergeMembers(members, visiblePlaces, []);

  useEffect(() => {
    selectedPlaceIdRef.current = selectedPlaceId;
  }, [selectedPlaceId]);

  useEffect(() => {
    currentPlanIdRef.current = currentPlanId;
    saveStoredMembers(currentPlanId, members);
  }, [currentPlanId, members]);

  useEffect(() => {
    setCurrentPlanId(planId);
    currentPlanIdRef.current = planId;
    setMembers((prev) =>
      mergeMembers(initialMembers, visiblePlaces, [...prev, ...loadStoredMembers(planId)])
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  useEffect(() => {
    isApplyingRemoteRef.current = true;
    setPlanTitle(initialTitle);
    const timer = setTimeout(() => {
      isApplyingRemoteRef.current = false;
    }, 0);
    return () => clearTimeout(timer);
  }, [initialTitle]);

  useEffect(() => {
    setMembers((prev) => mergeMembers(initialMembers, visiblePlaces, prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMembers, places]);

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

  const persistPlanToDb = useCallback(
    async (nextTitle: string, nextPlaces: PlaceItem[], nextMembers: string[]) => {
      saveStoredMembers(currentPlanIdRef.current, nextMembers);
      setSyncStatus("saving");
      try {
        const activeId = currentPlanIdRef.current;
        const cleanPlaces = nextPlaces.filter((p) => !isMembersMetaPlace(p));
        const placesWithMembersMeta = [
          ...cleanPlaces,
          {
            id: MEMBERS_META_ID,
            lat: 0,
            lng: 0,
            title: "__MEMBERS__",
            memo: "",
            members: nextMembers,
          } as PlaceItem & { members: string[] },
        ];

        const payload = {
          title: nextTitle,
          places: placesWithMembersMeta,
          members: nextMembers,
        };

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
            const oldKey = getMemberStorageKey(undefined);
            const newKey = getMemberStorageKey(data.id);
            try {
              const existingOld = window.localStorage.getItem(oldKey);
              if (existingOld && !window.localStorage.getItem(newKey)) {
                window.localStorage.setItem(newKey, existingOld);
              }
            } catch {
              // 무시
            }
            currentPlanIdRef.current = data.id;
            setCurrentPlanId(data.id);
            saveStoredMembers(data.id, nextMembers);
            router.replace(`/plan/${data.id}`);
          }
        }

        setSyncStatus("saved");
      } catch (error) {
        console.error("자동 저장 오류:", error);
        setSyncStatus("error");
      }
    },
    [router]
  );

  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }
    if (isApplyingRemoteRef.current) {
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      persistPlanToDb(planTitle, visiblePlaces, members);
    }, 350);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, planTitle, members, persistPlanToDb]);

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
            places?: Array<PlaceItem & { members?: unknown }>;
            members?: string[];
          };
          if (!updated) return;

          if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
          }

          isApplyingRemoteRef.current = true;
          if (typeof updated.title === "string") {
            setPlanTitle(updated.title);
          }

          let metaMembers: string[] = [];
          if (Array.isArray(updated.places)) {
            const realPlaces: PlaceItem[] = [];
            for (const item of updated.places) {
              if (!item) continue;
              if (isMembersMetaPlace(item)) {
                if (Array.isArray(item.members)) {
                  metaMembers = item.members.filter(
                    (m): m is string => typeof m === "string" && Boolean(m.trim())
                  );
                }
              } else {
                realPlaces.push(item);
              }
            }
            setPlaces(realPlaces);
            setMembers((prev) =>
              mergeMembers([...(updated.members || []), ...metaMembers], realPlaces, prev)
            );
          } else if (Array.isArray(updated.members)) {
            setMembers((prev) => mergeMembers(updated.members || [], [], prev));
          }

          setSyncStatus("saved");

          setTimeout(() => {
            isApplyingRemoteRef.current = false;
          }, 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentPlanId]);

  useEffect(() => {
    if (showUserGate) return;

    const initMap = () => {
      if (window.naver && window.naver.maps) {
        const firstPlace = visiblePlaces[0] || cleanInitialPlaces[0];
        const centerLat = firstPlace ? firstPlace.lat : 33.3846;
        const centerLng = firstPlace ? firstPlace.lng : 126.5535;
        const zoomLevel = firstPlace ? 12 : 10;

        const map = new window.naver.maps.Map("map", {
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
      return () => clearInterval(checkInterval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUserGate]);

  useEffect(() => {
    if (!mapInstance || !window.naver) return;
    const listener = window.naver.maps.Event.addListener(mapInstance, "click", handleMapClick);
    return () => {
      window.naver.maps.Event.removeListener(listener);
    };
  }, [mapInstance, handleMapClick]);

  useEffect(() => {
    if (!mapInstance || !window.naver) return;

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

    const updatedMembers = mergeMembers(members, visiblePlaces, [trimmed]);
    setMembers(updatedMembers);
    saveStoredMembers(currentPlanIdRef.current, updatedMembers);
    setActiveUser(trimmed);
    setNewUserName("");
    setShowUserGate(false);

    await persistPlanToDb(planTitle, visiblePlaces, updatedMembers);
  };

  const handlePickExistingUser = (name: string) => {
    setActiveUser(name);
    setShowUserGate(false);
  };

  // 사용자 삭제 (저장된 장소 및 저장했던 이름은 그대로 유지)
  const handleDeleteUser = async (targetName: string) => {
    const nextMembers = members.filter((m) => m !== targetName);
    setMembers(nextMembers);
    saveStoredMembers(currentPlanIdRef.current, nextMembers);

    if (activeUser === targetName) {
      setActiveUser(null);
    }
    if (selectedUserFilter === targetName) {
      setSelectedUserFilter(null);
    }

    await persistPlanToDb(planTitle, visiblePlaces, nextMembers);
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

  const handleConfirmDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftPlace) return;

    const finalTitle = draftTitle.trim() || draftPlace.title.trim() || "제주 장소";
    const finalMemo = draftMemo.trim();
    const creator = activeUser || "익명";

    setPlaces((prev) => [
      ...prev.filter((p) => !isMembersMetaPlace(p)),
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
    ]);

    setDraftPlace(null);
    setDraftTitle("");
    setDraftMemo("");
    setDraftMustVisit(false);
    setSearchKeyword("");
  };

  const handleUpdateMemo = (id: number, nextMemo: string) => {
    setPlaces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, memo: nextMemo } : p))
    );
  };

  const handleChangePlaceCategory = (id: number, nextCategory: PlaceCategory) => {
    setPlaces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, categoryType: nextCategory } : p))
    );
    setEditingCategoryPlaceId(null);
  };

  const handleTogglePlaceMustVisit = (id: number) => {
    setPlaces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isMustVisit: !p.isMustVisit } : p))
    );
  };

  const handleDeletePlace = (id: number) => {
    if (selectedPlaceId === id) {
      resetSelectionAndViewport();
    }
    if (editingCategoryPlaceId === id) {
      setEditingCategoryPlaceId(null);
    }
    setPlaces((prev) => prev.filter((p) => p.id !== id));
  };

  const handleCopyShareLink = async () => {
    if (!currentPlanId) {
      await persistPlanToDb(planTitle, visiblePlaces, members);
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

  if (showUserGate) {
    return (
      <div className="min-h-screen w-screen bg-gradient-to-b from-emerald-50/70 to-white flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-lg p-6 md:p-8 space-y-6">
          <div className="text-center space-y-1.5">
            <div className="text-3xl" role="img" aria-label="jeju">
              🍊
            </div>
            <h1 className="text-xl font-bold text-gray-900">{planTitle}</h1>
            <p className="text-sm text-gray-500">이용 방식을 선택해 주세요.</p>
          </div>

          {entryMode === "choose" && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setEntryMode("existing")}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                기존 사용자 선택
              </button>
              <button
                type="button"
                onClick={() => setEntryMode("new")}
                className="w-full py-3 px-4 rounded-xl bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 text-sm font-semibold transition-colors cursor-pointer"
              >
                신규 이용자 등록
              </button>
            </div>
          )}

          {entryMode === "existing" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-600">기존 사용자 선택</span>
                <button
                  type="button"
                  onClick={() => setEntryMode("choose")}
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
                    onClick={() => setEntryMode("choose")}
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

          {entryMode === "new" && (
            <form onSubmit={handleRegisterNewUser} className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-700">신규 이용자 등록</span>
                <button
                  type="button"
                  onClick={() => setEntryMode("choose")}
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
                등록하고 지도 열기
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <header className="h-[60px] shrink-0 px-4 md:px-6 border-b border-gray-200 bg-white flex items-center justify-between z-10 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl shrink-0" role="img" aria-label="jeju">
            🍊
          </span>
          <h1 className="text-lg font-bold tracking-tight text-gray-900 truncate">
            제주 여행 플래너
          </h1>
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
              setEntryMode("choose");
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
            className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            공유 링크 복사
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row h-[calc(100vh-60px)] overflow-hidden">
        <section className="w-full h-1/2 md:w-[60%] md:h-full relative border-b md:border-b-0 md:border-r border-gray-200">
          <div className="hidden sm:flex items-center gap-1 absolute top-4 right-4 z-20 bg-white/95 backdrop-blur-xs p-1 rounded-lg shadow-md border border-gray-200 text-xs">
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

          <div className="absolute top-4 left-4 right-4 sm:right-52 md:right-auto md:w-88 z-20">
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
                  onChange={(e) => setPlanTitle(e.target.value)}
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
    </div>
  );
}