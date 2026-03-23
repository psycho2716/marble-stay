"use client";

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState
} from "react";
import { usePathname } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";

const LS_KEY = "marblestay_notifications_v1";
const MAX_STORED = 40;

export type ServerNotification = {
    id: string;
    type: string;
    title: string;
    body: string;
    bookingId?: string;
    createdAt: string;
    /** Hotel profile image URL when sender is hotel (from server) */
    senderAvatarUrl?: string | null;
    senderName?: string;
    /** Property name for initials when guest views a message from the hotel */
    hotelName?: string;
};

export type StoredNotification = ServerNotification & { read?: boolean };

type MarbleRealtimeContextValue = {
    socket: Socket | null;
    connected: boolean;
    notifications: StoredNotification[];
    unreadCount: number;
    markAllRead: () => void;
    clearAll: () => void;
    joinBookingRoom: (bookingId: string) => void;
    leaveBookingRoom: (bookingId: string) => void;
};

const MarbleRealtimeContext = createContext<MarbleRealtimeContextValue | null>(null);

function loadStored(): StoredNotification[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? (parsed as StoredNotification[]) : [];
    } catch {
        return [];
    }
}

function saveStored(items: StoredNotification[]) {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(items.slice(0, MAX_STORED)));
    } catch {
        /* ignore quota */
    }
}

function socketBaseUrl(): string {
    const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    return raw.replace(/\/$/, "");
}

export function MarbleRealtimeProvider({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [token, setToken] = useState<string | null>(null);
    const [socket, setSocket] = useState<Socket | null>(null);
    const [connected, setConnected] = useState(false);
    const [notifications, setNotifications] = useState<StoredNotification[]>([]);

    useEffect(() => {
        setNotifications(loadStored());
    }, []);

    useEffect(() => {
        const t = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        setToken(t);
    }, [pathname]);

    useEffect(() => {
        if (!token) {
            setSocket((prev) => {
                prev?.disconnect();
                return null;
            });
            setConnected(false);
            return;
        }

        const s = io(socketBaseUrl(), {
            auth: { token },
            transports: ["websocket", "polling"],
            reconnectionAttempts: 12,
            reconnectionDelay: 1500
        });

        const onConnect = () => {
            setSocket(s);
            setConnected(true);
        };
        const onDisconnect = () => {
            setConnected(false);
        };

        s.on("connect", onConnect);
        s.on("disconnect", onDisconnect);
        s.on("connect_error", onDisconnect);

        s.on("notification", (n: ServerNotification) => {
            if (!n?.id || !n.title) return;
            setNotifications((prev) => {
                if (prev.some((x) => x.id === n.id)) return prev;
                const next = [{ ...n, read: false }, ...prev].slice(0, MAX_STORED);
                saveStored(next);
                return next;
            });
            if (typeof document !== "undefined" && document.visibilityState === "hidden") {
                toast.info(n.title, { description: n.body });
            }
        });

        if (s.connected) onConnect();

        return () => {
            s.off("connect", onConnect);
            s.off("disconnect", onDisconnect);
            s.off("connect_error", onDisconnect);
            s.disconnect();
            setSocket(null);
            setConnected(false);
        };
    }, [token]);

    const markAllRead = useCallback(() => {
        setNotifications((prev) => {
            const next = prev.map((x) => ({ ...x, read: true }));
            saveStored(next);
            return next;
        });
    }, []);

    const clearAll = useCallback(() => {
        setNotifications([]);
        saveStored([]);
    }, []);

    const joinBookingRoom = useCallback((bookingId: string) => {
        if (!socket?.connected) return;
        socket.emit("join_booking", bookingId, (r: { ok?: boolean; error?: string }) => {
            if (!r?.ok) console.warn("[socket] join_booking failed", r);
        });
    }, [socket]);

    const leaveBookingRoom = useCallback(
        (bookingId: string) => {
            socket?.emit("leave_booking", bookingId);
        },
        [socket]
    );

    const unreadCount = useMemo(
        () => notifications.filter((n) => !n.read).length,
        [notifications]
    );

    const value = useMemo(
        () => ({
            socket,
            connected,
            notifications,
            unreadCount,
            markAllRead,
            clearAll,
            joinBookingRoom,
            leaveBookingRoom
        }),
        [
            socket,
            connected,
            notifications,
            unreadCount,
            markAllRead,
            clearAll,
            joinBookingRoom,
            leaveBookingRoom
        ]
    );

    return (
        <MarbleRealtimeContext.Provider value={value}>{children}</MarbleRealtimeContext.Provider>
    );
}

export function useMarbleRealtime(): MarbleRealtimeContextValue {
    const ctx = useContext(MarbleRealtimeContext);
    if (!ctx) {
        throw new Error("useMarbleRealtime must be used within MarbleRealtimeProvider");
    }
    return ctx;
}

/** Safe for optional UI (e.g. outside provider during SSR edge cases). */
export function useMarbleRealtimeOptional(): MarbleRealtimeContextValue | null {
    return useContext(MarbleRealtimeContext);
}
