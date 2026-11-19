import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
    return NextResponse.json({ address: "", regionKeyword: "제주" }, { status: 400 });
  }

  const clientId =
    process.env.NCP_REVERSE_GC_CLIENT_ID ||
    process.env.NCP_SEARCH_CLIENT_ID ||
    process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const clientSecret =
    process.env.NCP_REVERSE_GC_CLIENT_SECRET ||
    process.env.NCP_SEARCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { address: "", regionKeyword: "제주", error: "NCP API 키가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  // 경도,위도 순서로 coords 전달 (orders=roadaddr,addr)
  const coords = `${Number(lng)},${Number(lat)}`;
  const url = `https://naveropenapi.apigw.ntruss.com/map-reversegeocode/v2/gc?coords=${encodeURIComponent(
    coords
  )}&orders=roadaddr,addr&output=json`;

  try {
    const res = await fetch(url, {
      headers: {
        "X-NCP-APIGW-API-KEY-ID": clientId,
        "X-NCP-APIGW-API-KEY": clientSecret,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ address: "", regionKeyword: "제주" }, { status: res.status });
    }

    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    const first = results[0];

    const area1 = first?.region?.area1?.name || "";
    const area2 = first?.region?.area2?.name || "";
    const area3 = first?.region?.area3?.name || "";
    const area4 = first?.region?.area4?.name || "";

    const roadName = first?.land?.name || "";
    const roadNumber1 = first?.land?.number1 || "";
    const roadNumber2 = first?.land?.number2 ? `-${first.land.number2}` : "";
    const buildingName = first?.land?.addition0?.value || "";

    const formattedRoad = roadName
      ? `${area1} ${area2} ${roadName} ${roadNumber1}${roadNumber2}${
          buildingName ? ` (${buildingName})` : ""
        }`.trim()
      : "";

    const formattedJibun = `${area1} ${area2} ${area3} ${area4} ${roadNumber1}${roadNumber2}`
      .replace(/\s+/g, " ")
      .trim();

    const address = formattedRoad || formattedJibun || "";

    // 동/읍/면/리 단위 지역 키워드 추출 (예: 협재리, 애월읍, 연동 등)
    const dongOrRi = area4 || area3 || area2 || "제주";
    const regionKeyword = dongOrRi.replace(/(시|군|구)$/, "").trim() || "제주";

    return NextResponse.json({
      address,
      regionKeyword,
      area1,
      area2,
      area3,
      area4,
    });
  } catch (error) {
    console.error("리버스 지오코딩 호출 실패:", error);
    return NextResponse.json({ address: "", regionKeyword: "제주" }, { status: 500 });
  }
}
