import type { Metadata } from "next";
import { DemoApp } from "@/components/mvp/DemoApp";

export const metadata: Metadata = {
  title: "ทดลองรู้สิทธิ์ รู้สุข",
  description: "เล่าอาการครั้งเดียว ได้เส้นทางดูแลที่ทำตามได้",
};

export default function DemoPage() {
  return <DemoApp surface="web" />;
}
