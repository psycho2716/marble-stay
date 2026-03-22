"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIo = getIo;
exports.emitBookingMessage = emitBookingMessage;
exports.emitHotelNotification = emitHotelNotification;
exports.emitUserNotification = emitUserNotification;
exports.notifyHotelNewBooking = notifyHotelNewBooking;
exports.notifyGuestBookingConfirmed = notifyGuestBookingConfirmed;
exports.notifyGuestBookingDeclined = notifyGuestBookingDeclined;
exports.notifyGuestPaymentApproved = notifyGuestPaymentApproved;
exports.notifyGuestReceiptRejected = notifyGuestReceiptRejected;
exports.notifyHotelReceiptUploaded = notifyHotelReceiptUploaded;
exports.notifyNewChatMessage = notifyNewChatMessage;
exports.attachSocketIO = attachSocketIO;
const crypto_1 = require("crypto");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const socket_io_1 = require("socket.io");
const supabaseClient_1 = require("./config/supabaseClient");
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
let io = null;
function getIo() {
    return io;
}
function newNotification(partial) {
    return {
        ...partial,
        id: (0, crypto_1.randomUUID)(),
        createdAt: new Date().toISOString()
    };
}
/** Signed avatar for chat notifications to guests: hotel profile image, else first hotel gallery image. */
async function resolveHotelBrandingForNotification(hotelId) {
    const { data: hotel, error } = await supabaseClient_1.supabaseAdmin
        .from("hotels")
        .select("name, profile_image, images")
        .eq("id", hotelId)
        .single();
    if (error || !hotel) {
        return { avatarUrl: null, hotelName: null };
    }
    const h = hotel;
    const trySigned = async (path) => {
        const p = path?.trim();
        if (!p)
            return null;
        if (/^https?:\/\//i.test(p))
            return p;
        const { data: signed } = await supabaseClient_1.supabaseAdmin.storage
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
function emitBookingMessage(bookingId, payload) {
    getIo()?.to(`booking:${bookingId}`).emit("booking:message", payload);
}
function emitHotelNotification(hotelId, n) {
    getIo()?.to(`hotel:${hotelId}`).emit("notification", n);
}
function emitUserNotification(userId, n) {
    getIo()?.to(`user:${userId}`).emit("notification", n);
}
function notifyHotelNewBooking(hotelId, bookingId, guestLabel) {
    emitHotelNotification(hotelId, newNotification({
        type: "booking_new",
        title: "New booking request",
        body: `${guestLabel} submitted a reservation. Review it in Bookings.`,
        bookingId
    }));
}
function notifyGuestBookingConfirmed(userId, bookingId) {
    emitUserNotification(userId, newNotification({
        type: "booking_confirmed",
        title: "Booking confirmed",
        body: "The hotel approved your reservation.",
        bookingId
    }));
}
function notifyGuestBookingDeclined(userId, bookingId) {
    emitUserNotification(userId, newNotification({
        type: "booking_declined",
        title: "Booking declined",
        body: "The hotel declined this request. Check your booking for details.",
        bookingId
    }));
}
function notifyGuestPaymentApproved(userId, bookingId) {
    emitUserNotification(userId, newNotification({
        type: "payment_approved",
        title: "Payment verified",
        body: "Your payment was marked as received by the hotel.",
        bookingId
    }));
}
function notifyGuestReceiptRejected(userId, bookingId) {
    emitUserNotification(userId, newNotification({
        type: "payment_receipt_rejected",
        title: "Payment proof needs update",
        body: "The hotel rejected your receipt. Please upload a new proof of payment.",
        bookingId
    }));
}
function notifyHotelReceiptUploaded(hotelId, bookingId) {
    emitHotelNotification(hotelId, newNotification({
        type: "payment_receipt_uploaded",
        title: "New payment receipt",
        body: "A guest uploaded payment proof. Verify it in Bookings.",
        bookingId
    }));
}
async function notifyNewChatMessage(args) {
    const preview = args.preview.length > 120 ? `${args.preview.slice(0, 117)}…` : args.preview;
    let senderAvatarUrl = null;
    let hotelName;
    if (args.senderRole === "hotel") {
        try {
            const branding = await resolveHotelBrandingForNotification(args.hotelId);
            senderAvatarUrl = branding.avatarUrl;
            if (branding.hotelName)
                hotelName = branding.hotelName;
        }
        catch (e) {
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
    }
    else {
        emitUserNotification(args.guestUserId, payload);
    }
}
async function assertSocketBookingAccess(userId, role, bookingId) {
    const { data: booking, error } = await supabaseClient_1.supabaseAdmin
        .from("bookings")
        .select("user_id, rooms!inner(hotel_id)")
        .eq("id", bookingId)
        .single();
    if (error || !booking)
        return false;
    const b = booking;
    const room = Array.isArray(b.rooms) ? b.rooms[0] : b.rooms;
    const hotelId = room?.hotel_id;
    if (role === "guest") {
        return b.user_id === userId;
    }
    if (role === "hotel") {
        const { data: profile } = await supabaseClient_1.supabaseAdmin
            .from("profiles")
            .select("hotel_id")
            .eq("id", userId)
            .single();
        const ph = profile;
        return Boolean(ph?.hotel_id && hotelId && ph.hotel_id === hotelId);
    }
    return false;
}
function attachSocketIO(httpServer, corsOrigin) {
    const nextIo = new socket_io_1.Server(httpServer, {
        cors: {
            origin: corsOrigin,
            methods: ["GET", "POST", "PATCH", "DELETE"]
        }
    });
    nextIo.use((socket, next) => {
        const authToken = socket.handshake.auth?.token ??
            (typeof socket.handshake.headers.authorization === "string"
                ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, "").trim()
                : null);
        if (!authToken) {
            next(new Error("Unauthorized"));
            return;
        }
        try {
            const payload = jsonwebtoken_1.default.verify(authToken, JWT_SECRET);
            socket.data.user = payload;
            next();
        }
        catch {
            next(new Error("Unauthorized"));
        }
    });
    nextIo.on("connection", async (socket) => {
        const user = socket.data.user;
        if (!user) {
            socket.disconnect(true);
            return;
        }
        await socket.join(`user:${user.sub}`);
        if (user.role === "hotel") {
            const { data: profile } = await supabaseClient_1.supabaseAdmin
                .from("profiles")
                .select("hotel_id")
                .eq("id", user.sub)
                .single();
            const hid = profile?.hotel_id;
            if (hid)
                await socket.join(`hotel:${hid}`);
        }
        socket.on("join_booking", async (bookingId, cb) => {
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
        socket.on("leave_booking", async (bookingId) => {
            if (typeof bookingId !== "string" || !bookingId)
                return;
            await socket.leave(`booking:${bookingId}`);
        });
    });
    io = nextIo;
    return nextIo;
}
