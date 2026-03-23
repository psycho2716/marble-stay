"use client";

import { RoomEditor } from "@/components/hotel/RoomEditor";

export default function NewRoomPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8">
      <RoomEditor mode="new" />
    </main>
  );
}

