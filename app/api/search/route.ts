import { NextResponse } from "next/server";

function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchLocalItems(query: string, clientId: string, clientSecret: string) {
  const url = `https://naverapihub.apigw.ntruss.com/search/v1/local?query=${encodeURIComponent(
    query
  )}&display=10&start=1&sort=random&format=json`;

  const res = await fetch(url, {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": clientId,
      "X-NCP-APIGW-API-KEY": clientSecret,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return [];
  }

  const data = await res.json();
  const rawItems = Array.isArray(data?.items) ? data.items : [];

  return rawItems
    .map((item: any) => {
      const cleanTitle = String(item.title ?? "").replace(/<[^>]+>/g, "").trim();
      const rawX = Number(item.mapx);
      const rawY = Number(item.mapy);

      const lng = Math.abs(rawX) > 1000 ? rawX / 1e7 : rawX;
      const lat = Math.abs(rawY) > 1000 ? rawY / 1e7 : rawY;

      return {
        title: cleanTitle,
        category: item.category || "",
        address: item.roadAddress || item.address || "",
        lat,
        lng,
      };
    })
    .filter(
      (item: any) =>
        item.title && !Number.isNaN(item.lat) && !Number.isNaN(item.lng)
    );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim();
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");

  if (!query) {
    return NextResponse.json({ items: [] });
  }

  const clientId = process.env.NCP_SEARCH_CLIENT_ID;
  const clientSecret = process.env.NCP_SEARCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error:
          "NCP_SEARCH_CLIENT_ID 또는 NCP_SEARCH_CLIENT_SECRET이 설정되지 않았습니다.",
      },
      { status: 500 }
    );
  }

  const hasCoords =
    latParam !== null &&
    lngParam !== null &&
    !Number.isNaN(Number(latParam)) &&
    !Number.isNaN(Number(lngParam));

  try {
    const searchQuery = query.includes("제주") ? query : `제주 ${query}`;
    const items = await fetchLocalItems(searchQuery, clientId, clientSecret);

    if (hasCoords) {
      const targetLat = Number(latParam);
      const targetLng = Number(lngParam);

      const withDist = items
        .map((item: any) => ({
          ...item,
          distanceMeters: Math.round(
            getDistanceMeters(targetLat, targetLng, item.lat, item.lng)
          ),
        }))
        .sort((a: any, b: any) => a.distanceMeters - b.distanceMeters);

      return NextResponse.json({ items: withDist });
    }

    return NextResponse.json({ items });
  } catch (error) {
    console.error("NCP 지역 검색 호출 실패:", error);
    return NextResponse.json({ items: [] }, { status: 500 });
  }
}