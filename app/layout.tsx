import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const notoThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-thai",
  display: "swap",
});

export const metadata: Metadata = {
  title: "รู้สิทธิ์ รู้สุข — เส้นทางดูแลที่ตรวจสอบได้",
  description:
    "เล่าอาการครั้งเดียว ช่วยคัดกรอง ตรวจสิทธิ์ และจับคู่สถานที่ที่เหมาะกับเคสของคุณ",
  icons: { icon: "/icon.svg" },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // ตรงกับโทนแบรนด์หลัก (กรมท่า) ใน tailwind.config.ts
  themeColor: "#16315B",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={notoThai.variable}>
      <body>{children}</body>
    </html>
  );
}
