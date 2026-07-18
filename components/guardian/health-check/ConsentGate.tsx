"use client";
// Consent Gate (spec §6.1, copy §11.8) — บังคับก่อนครั้งแรกและเมื่อ
// consent_version เปลี่ยน. ไม่มี dark pattern: ปุ่มปฏิเสธกดง่ายเท่าปุ่มยอมรับ
// และก่อนกดยอมรับ ระบบไม่แตะ sensor แม้แต่ sample เดียว
import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface Props {
  onAccept: () => Promise<void>;
  onLater: () => void;
}

export function ConsentGate({ onAccept, onLater }: Props) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="card-enter flex min-h-[70vh] flex-col">
      <div className="flex-1">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-soft">
          <ShieldCheck className="h-7 w-7 text-brand" aria-hidden />
        </div>
        <h1 className="mt-4 text-center text-xl font-bold leading-snug text-ink">
          ให้เราเฝ้าดูแลสุขภาพคุณผ่านการใช้งานมือถือ
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          เพื่อสร้างเส้นฐานสุขภาพส่วนตัวของคุณ ระบบจะเก็บข้อมูลต่อไปนี้{" "}
          <strong className="font-semibold text-ink">
            เฉพาะระหว่างที่คุณทำแบบเช็คสุขภาพ
          </strong>
          : การเคลื่อนไหวของเครื่องจากเซนเซอร์ (ความเร่งและการหมุน),
          จังหวะการแตะหน้าจอและการพิมพ์ (เก็บเป็นเวลาและตำแหน่ง
          ไม่เก็บเนื้อหาที่พิมพ์นอกเหนือจากประโยคทดสอบ) และรุ่นอุปกรณ์ —
          ข้อมูลนี้ใช้เพื่อเปรียบเทียบการเปลี่ยนแปลงของคุณกับตัวคุณเองเท่านั้น
          ไม่ใช้วินิจฉัยโรค ไม่ขายหรือส่งต่อให้บุคคลที่สาม
          และคุณถอนความยินยอมพร้อมลบข้อมูลทั้งหมดได้ทุกเมื่อที่ ตั้งค่า &gt;
          ความเป็นส่วนตัว
        </p>
      </div>
      <div className="mt-6 flex flex-col gap-2.5">
        <Button
          size="lg"
          fullWidth
          disabled={busy}
          leftIcon={busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : undefined}
          onClick={() => {
            setBusy(true);
            void onAccept().finally(() => setBusy(false));
          }}
        >
          ยอมรับและเริ่มเช็ค
        </Button>
        <Button size="lg" variant="outline" fullWidth disabled={busy} onClick={onLater}>
          ไว้ภายหลัง
        </Button>
      </div>
    </div>
  );
}
