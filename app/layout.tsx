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
  title: "รู้สิทธิ์ รู้สุข — ผู้ช่วยสิทธิสุขภาพ AI",
  description:
    "เล่าเรื่องสุขภาพ แล้วได้คำตอบที่ทำต่อได้: ไปไหน อะไรฟรี มีสิทธิ์อะไร ฉุกเฉินโทรใคร — ทุกคำตอบมีที่มา",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0E9F6E",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={notoThai.variable}>
      <body>{children}</body>
    </html>
  );
}
