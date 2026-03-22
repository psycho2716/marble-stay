import type { Server as HttpServer } from "http";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { supabaseAdmin } from "./config/supabaseClient";
import type { AuthPayload } from "./middleware/auth";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export type AppNotificationPayload = {
    id: string;
    type: string;
    title: string;
    body: string;
    bookingId?: string;
    createdAt: string;
    /** Signed URL (e.g. hotel profile image) when the sender is hotel staff with a photo */
    senderAvatarUrl?: string | null;
    /** Display name for avatar fallback / subtitle */
    senderName?: string;
    /** Property name — used for initials in guest UI when the hotel has no profile image */
    hotelName?: string;
};

let io: SocketIOServer | null = null;

export function getIo(): SocketIOServer | null {
    return io;
}

function newNotification(
    partial: Omit<AppNotificationPayload, "id" | "createdAt"> & { bookingId?: string }
): AppNotificationPayload {
    return {
        ...partial,
        id: randomUUID(),
        createdAt: new Date().toISOString()
    };
}

/** Signed avatar for chat notifications to guests: hotel profile image, else first hotel gallery image. */
async function resolveHotelBrandingForNotification(hotelId: string): Promise<{
    avatarUrl: string | null;
    hotelName: string | null;
}> {
    const { data: hotel, error } = await supabaseAdmin
        .from("hotels")
        .select("name, profile_image, images")
        .eq("id", hotelId)
        .single();

    if (error || !hotel) {
        return { avatarUrl: null, hotelName: null };
    }

    const h = hotel as {
        name?: string | null;
        profile_image?: string | null;
        images?: string[] | null;
    };

    const trySigned = async (path: string | null | undefined): Promise<string | null> => {
        const p = path?.trim();
        if (!p) return null;
        if (/^https?:\/\//i.test(p)) return p;
        const { data: signed } = await supabaseAdmin.storage
            .from("hotel-assets")
            .createSignedUrl(p, 3600);
        return signed?.signedUrl ?? null;
    };

    let avatarUrl = await trySigned(h.profile_image ?? null);
    if (!avatarUrl) {
        const first = h.images?.find((x) => typeof x === "string" && x.trim());
        avatarUrl = await trySigned(first ?? null);
    }

    return {
        avatarUrl,
        hotelName: h.name?.trim() || null
    };
}

export function emitBookingMessage(bookingId: string, payload: Record<string, unknown>): void {
    getIo()?.to(`booking:${bookingId}`).emit("booking:message", payload);
}

export function emitHotelNotification(hotelId: string, n: AppNotificationPayload): void {
    getIo()?.to(`hotel:${hotelId}`).emit("notification", n);
}

export function emitUserNotification(userId: string, n: AppNotificationPayload): void {
    getIo()?.to(`user:${userId}`).emit("notification", n);
}

export function notifyHotelNewBooking(hotelId: string, bookingId: string, guestLabel: string): void {
    emitHotelNotification(
        hotelId,
        newNotification({
            type: "booking_new",
            title: "New booking request",
            body: `${guestLabel} submitted a reservation. Review it in Bookings.`,
            bookingId
        })
    );
}

export function notifyGuestBookingConfirmed(userId: string, bookingId: string): void {
    emitUserNotification(
        userId,
        newNotification({
            type: "booking_confirmed",
            title: "Booking confirmed",
            body: "The hotel approved your reservation.",
            bookingId
        })
    );
}

export function notifyGuestBookingDeclined(userId: string, bookingId: string): void {
    emitUserNotification(
        userId,
        newNotification({
            type: "booking_declined",
            title: "Booking declined",
            body: "The hotel declined this request. Check your booking for details.",
            bookingId
        })
    );
}

export function notifyGuestPaymentApproved(userId: string, bookingId: string): void {
    emitUserNotification(
        userId,
        newNotification({
            type: "payment_approved",
            title: "Payment verified",
            body: "Your payment was marked as received by the hotel.",
            bookingId
        })
    );
}

export function notifyGuestReceiptRejected(userId: string, bookingId: string): void {
    emitUserNotification(
        userId,
        newNotification({
            type: "payment_receipt_rejected",
            title: "Payment proof needs update",
            body: "The hotel rejected your receipt. Please upload a new proof of payment.",
            bookingId
        })
    );
}

export function notifyHotelReceiptUploaded(hotelId: string, bookingId: string): void {
    emitHotelNotification(
        hotelId,
        newNotification({
            type: "payment_receipt_uploaded",
            title: "New payment receipt",
            body: "A guest uploaded payment proof. Verify it in Bookings.",
            bookingId
        })
    );
}

export async function notifyNewChatMessage(args: {
    bookingId: string;
    senderRole: "guest" | "hotel";
    guestUserId: string;
    hotelId: string;
    preview: string;
    senderName: string;
    senderId: string;
}): Promise<void> {
    const preview =
        args.preview.length > 120 ? `${args.preview.slice(0, 117)}…` : args.preview;
    let senderAvatarUrl: string | null = null;
    let hotelName: string | undefined;
    if (args.senderRole === "hotel") {
        try {
            const branding = await resolveHotelBrandingForNotification(args.hotelId);
            senderAvatarUrl = branding.avatarUrl;
            if (branding.hotelName) hotelName = branding.hotelName;
        } catch (e) {
            console.warn("[realtime] resolveHotelBrandingForNotification failed", e);
        }
    }

    const payload = newNotification({
        type: "message",
        title: `Message from ${args.senderName}`,
        body: preview,
        bookingId: args.bookingId,
        senderName: args.senderName,
        senderAvatarUrl: senderAvatarUrl ?? undefined,
        ...(hotelName ? { hotelName } : {})
    });
    if (args.senderRole === "guest") {
        emitHotelNotification(args.hotelId, payload);
    } else {
        emitUserNotification(args.guestUserId, payload);
    }
}

async function assertSocketBookingAccess(
    userId: string,
    role: AuthPayload["role"],
    bookingId: string
): Promise<boolean> {
    const { data: booking, error } = await supabaseAdmin
        .from("bookings")
        .select("user_id, rooms!inner(hotel_id)")
        .eq("id", bookingId)
        .single();

    if (error || !booking) return false;

    const b = booking as { user_id: string; rooms?: { hotel_id: string } | { hotel_id: string }[] };
    const room = Array.isArray(b.rooms) ? b.rooms[0] : b.rooms;
    const hotelId = room?.hotel_id;

    if (role === "guest") {
        return b.user_id === userId;
    }

    if (role === "hotel") {
        const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("hotel_id")
            .eq("id", userId)
            .single();
        const ph = profile as { hotel_id?: string | null } | null;
        return Boolean(ph?.hotel_id && hotelId && ph.hotel_id === hotelId);
    }

    return false;
}

export function attachSocketIO(httpServer: HttpServer, corsOrigin: string): SocketIOServer {
    const nextIo = new SocketIOServer(httpServer, {
        cors: {
            origin: corsOrigin,
            methods: ["GET", "POST", "PATCH", "DELETE"]
        }
    });

    nextIo.use((socket, next) => {
        const authToken =
            (socket.handshake.auth as { token?: string } | undefined)?.token ??
            (typeof socket.handshake.headers.authorization === "string"
                ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, "").trim()
                : null);

        if (!authToken) {
            next(new Error("Unauthorized"));
            return;
        }

        try {
            const payload = jwt.verify(authToken, JWT_SECRET) as AuthPayload;
            (socket.data as { user?: AuthPayload }).user = payload;
            next();
        } catch {
            next(new Error("Unauthorized"));
        }
    });

    nextIo.on("connection", async (socket: Socket) => {
        const user = (socket.data as { user: AuthPayload }).user;
        if (!user) {
            socket.disconnect(true);
            return;
        }

        await socket.join(`user:${user.sub}`);

        if (user.role === "hotel") {
            const { data: profile } = await supabaseAdmin
                .from("profiles")
                .select("hotel_id")
                .eq("id", user.sub)
                .single();
            const hid = (profile as { hotel_id?: string | null } | null)?.hotel_id;
            if (hid) await socket.join(`hotel:${hid}`);
        }

        socket.on("join_booking", async (bookingId: unknown, cb?: (r: { ok: boolean; error?: string }) => void) => {
            if (typeof bookingId !== "string" || !bookingId) {
                cb?.({ ok: false, error: "Invalid booking id" });
                return;
            }
            const ok = await assertSocketBookingAccess(user.sub, user.role, bookingId);
            if (!ok) {
                cb?.({ ok: false, error: "Forbidden" });
                return;
            }
            await socket.join(`booking:${bookingId}`);
            cb?.({ ok: true });
        });

        socket.on("leave_booking", async (bookingId: unknown) => {
            if (typeof bookingId !== "string" || !bookingId) return;
            await socket.leave(`booking:${bookingId}`);
        });
    });

    io = nextIo;
    return nextIo;
}
