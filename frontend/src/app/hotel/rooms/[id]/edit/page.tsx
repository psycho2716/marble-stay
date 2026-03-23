"use client";

import { useParams } from "next/navigation";
import { RoomEditor } from "@/components/hotel/RoomEditor";

export default function EditRoomPage() {
  const params = useParams<{ id: string }>();
  const roomId = params?.id;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8">
      <RoomEditor mode="edit" roomId={roomId} />
    </main>
  );
}

