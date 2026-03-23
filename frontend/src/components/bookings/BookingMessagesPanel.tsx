"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { useMarbleRealtimeOptional } from "@/contexts/MarbleRealtimeProvider";

export type BookingMessageRow = {
    id: string;
    booking_id?: string;
    sender_id: string;
    body: string;
    created_at: string;
    sender_role: "guest" | "hotel";
    sender_name: string;
};

type BookingMessagesPanelProps = {
    bookingId: string;
    apiBase: string;
    getAuthHeaders: () => HeadersInit;
    selfRole: "guest" | "hotel";
};

/** Avoid duplicates when the same message is added from POST and from Socket.IO (any order). */
function upsertMessageById(prev: BookingMessageRow[], msg: BookingMessageRow): BookingMessageRow[] {
    if (!msg.id || prev.some((m) => m.id === msg.id)) return prev;
    return [...prev, msg];
}

function formatMessageTime(iso: string) {
    try {
        const d = new Date(iso);
        return new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
        }).format(d);
    } catch {
        return iso;
    }
}

export function BookingMessagesPanel({
    bookingId,
    apiBase,
    getAuthHeaders,
    selfRole
}: BookingMessagesPanelProps) {
    const [messages, setMessages] = useState<BookingMessageRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [text, setText] = useState("");
    const bottomRef = useRef<HTMLDivElement>(null);
    const marbleRt = useMarbleRealtimeOptional();

    const load = useCallback(async () => {
        const res = await fetch(`${apiBase}/api/bookings/${bookingId}/messages`, {
            headers: getAuthHeaders()
        });
        if (!res.ok) return;
        const data = (await res.json()) as BookingMessageRow[];
        setMessages(Array.isArray(data) ? data : []);
    }, [apiBase, bookingId, getAuthHeaders]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        load().finally(() => {
            if (!cancelled) setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [load]);

    const socket = marbleRt?.socket ?? null;
    const socketConnected = marbleRt?.connected ?? false;
    const joinBookingRoom = marbleRt?.joinBookingRoom;
    const leaveBookingRoom = marbleRt?.leaveBookingRoom;

    /** Realtime thread + slow fallback when socket is offline */
    useEffect(() => {
        if (!joinBookingRoom || !leaveBookingRoom) {
            const interval = setInterval(() => void load(), 25000);
            return () => clearInterval(interval);
        }
        if (!socket) {
            const interval = setInterval(() => void load(), 25000);
            return () => clearInterval(interval);
        }

        joinBookingRoom(bookingId);
        const onMsg = (msg: BookingMessageRow) => {
            setMessages((prev) => upsertMessageById(prev, msg));
        };
        socket.on("booking:message", onMsg);

        const interval = !socketConnected
            ? setInterval(() => void load(), 25000)
            : null;

        return () => {
            socket.off("booking:message", onMsg);
            leaveBookingRoom(bookingId);
            if (interval) clearInterval(interval);
        };
    }, [socket, socketConnected, bookingId, load, joinBookingRoom, leaveBookingRoom]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length]);

    async function handleSend() {
        const trimmed = text.trim();
        if (!trimmed || sending) return;
        setSending(true);
        try {
            const res = await fetch(`${apiBase}/api/bookings/${bookingId}/messages`, {
                method: "POST",
                headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({ body: trimmed })
            });
            const data = (await res.json().catch(() => ({}))) as { error?: string } & BookingMessageRow;
            if (!res.ok) {
                toast.error(data.error ?? "Failed to send");
                return;
            }
            setText("");
            setMessages((prev) => upsertMessageById(prev, data as BookingMessageRow));
        } finally {
            setSending(false);
        }
    }

    return (
        <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="max-h-[min(440px,55vh)] space-y-3 overflow-y-auto p-4">
                {loading && messages.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">Loading messages…</p>
                ) : messages.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                        No messages yet. Start the conversation about this booking.
                    </p>
                ) : (
                    messages.map((m) => {
                        const isSelf = m.sender_role === selfRole;
                        return (
                            <div
                                key={m.id}
                                className={`flex ${isSelf ? "justify-end" : "justify-start"}`}
                            >
                                <div
                                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                                        isSelf
                                            ? "bg-primary text-primary-foreground"
                                            : "border border-border bg-muted/50 text-foreground"
                                    }`}
                                >
                                    <p className="text-[11px] font-semibold opacity-80">
                                        {m.sender_name}
                                        <span className="ml-1 font-normal opacity-70">
                                            · {formatMessageTime(m.created_at)}
                                        </span>
                                    </p>
                                    <p className="mt-1 whitespace-pre-wrap break-words">{m.body}</p>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef} />
            </div>
            <div className="border-t border-border p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Type your message…"
                        rows={3}
                        maxLength={5000}
                        className="min-h-[80px] flex-1 resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        disabled={sending}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                e.preventDefault();
                                void handleSend();
                            }
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => void handleSend()}
                        disabled={sending || !text.trim()}
                        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50 sm:h-[80px] sm:w-24 sm:flex-col"
                    >
                        <Send className="h-4 w-4" />
                        Send
                    </button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                    Ctrl+Enter to send. Messages are stored in Marble Stay only (not sent by email).
                </p>
            </div>
        </div>
    );
}
