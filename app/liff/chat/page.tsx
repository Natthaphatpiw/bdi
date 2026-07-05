"use client";
import { HomeScreen } from "@/components/screens/HomeScreen";

// Backward-compatible route for the old LIFF_CHAT endpoint.
// The product is no longer chat-first; opening /liff/chat should start the
// one-shot Case Passport intake just like /liff.
export default function LiffChatPage() {
  return <HomeScreen surface="line" basePath="/liff" />;
}
