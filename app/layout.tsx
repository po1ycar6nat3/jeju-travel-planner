import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "제주 여행 플래너",
  description: "네이버 지도와 노션 스타일 에디터로 만드는 나만의 제주도 여행 계획",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const naverClientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;

  return (
    <html lang="ko" suppressHydrationWarning={true}>
      <head>
        <script
          type="text/javascript"
          src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${naverClientId}&submodules=geocoder`}
        ></script>
      </head>
      <body className="antialiased text-gray-900 bg-white">
        {children}
      </body>
    </html>
  );
}