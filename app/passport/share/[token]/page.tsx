import type { Metadata } from "next";
import { SharedPassportView } from "@/components/mvp/PassportExperience";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Case Passport — รู้สิทธิ์ รู้สุข",
  description: "ข้อมูลสรุปก่อนเข้ารับบริการที่ผู้ใช้อนุญาตให้แชร์ชั่วคราว",
  robots: { index: false, follow: false, nocache: true },
};

export default async function SharedPassportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedPassportView token={token} />;
}
