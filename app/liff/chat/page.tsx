"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChatScreen } from "@/components/screens/ChatScreen";

function LiffChat() {
  const params = useSearchParams();
  return (
    <ChatScreen
      surface="line"
      basePath="/liff"
      initialText={params.get("q") ?? undefined}
      intentHint={params.get("intent") ?? undefined}
      sessionId={params.get("session") ?? undefined}
      documentId={params.get("doc") ?? undefined}
    />
  );
}

export default function LiffChatPage() {
  return (
    <Suspense fallback={null}>
      <LiffChat />
    </Suspense>
  );
}
