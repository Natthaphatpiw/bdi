"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChatScreen } from "@/components/screens/ChatScreen";

function WebChat() {
  const params = useSearchParams();
  const q = params.get("q") ?? undefined;
  const intent = params.get("intent") ?? undefined;
  const session = params.get("session") ?? undefined;
  const doc = params.get("doc") ?? undefined;

  return (
    <ChatScreen
      surface="web"
      basePath=""
      initialText={q}
      intentHint={intent}
      sessionId={session}
      documentId={doc}
    />
  );
}

export default function WebChatPage() {
  return (
    <Suspense fallback={null}>
      <WebChat />
    </Suspense>
  );
}
