"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Bell,
    Calendar,
    CheckCircle2,
    CreditCard,
    FileImage,
    MessageCircle,
    XCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuTrigger,
    DropdownMenuItem
} from "@/components/ui/dropdown-menu";
import { useMarbleRealtime, type StoredNotification } from "@/contexts/MarbleRealtimeProvider";

function formatNotifTime(iso: string) {
    try {
        return new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
        }).format(new Date(iso));
    } catch {
        return "";
    }
}

function notificationHref(n: StoredNotification, role: "guest" | "hotel"): string {
    if (n.bookingId) {
        return role === "hotel" ? `/hotel/bookings` : `/bookings/${n.bookingId}`;
    }
    return role === "hotel" ? "/hotel/bookings" : "/bookings";
}

function initialsFromName(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? "?";
    const second = parts.length > 1 ? parts[1]?.[0] : (parts[0]?.[1] ?? "");
    return (first + second).toUpperCase();
}

/** Legacy stored notifications may only have "Message from Name" in title */
function displaySenderName(n: StoredNotification): string {
    if (n.senderName?.trim()) return n.senderName.trim();
    const m = /^Message from\s+(.+)$/i.exec(n.title.trim());
    return m?.[1]?.trim() || n.title;
}

function TypeIcon({ type, role }: { type: string; role: "guest" | "hotel" }) {
    const defaultClass = "h-5 w-5 text-primary";
    switch (type) {
        case "booking_new":
            return <Calendar className={defaultClass} aria-hidden />;
        case "booking_confirmed":
            return (
                <CheckCircle2
                    className={
                        role === "guest"
                            ? "h-5 w-5 text-emerald-600 dark:text-emerald-400"
                            : defaultClass
                    }
                    aria-hidden
                />
            );
        case "booking_declined":
            return (
                <XCircle
                    className={
                        role === "guest"
                            ? "h-5 w-5 text-red-600 dark:text-red-400"
                            : defaultClass
                    }
                    aria-hidden
                />
            );
        case "payment_approved":
            return <CreditCard className={defaultClass} aria-hidden />;
        case "payment_receipt_rejected":
            return <FileImage className={defaultClass} aria-hidden />;
        case "payment_receipt_uploaded":
            return <FileImage className={defaultClass} aria-hidden />;
        default:
            return <Bell className={defaultClass} aria-hidden />;
    }
}

function MessageAvatar({
    n,
    viewerRole
}: {
    n: StoredNotification;
    viewerRole: "guest" | "hotel";
}) {
    const senderLabel = displaySenderName(n);
    const url = n.senderAvatarUrl?.trim();
    /** Guest viewing a hotel message: use property name for initials when no photo */
    const initialsFrom =
        viewerRole === "guest" && n.type === "message"
            ? (n.hotelName?.trim() || senderLabel)
            : senderLabel;

    if (url) {
        return (
            // eslint-disable-next-line @next/next/no-img-element -- signed external Supabase URLs
            <img
                src={url}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-background"
            />
        );
    }

    return (
        <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary/10 text-xs font-bold tracking-tight text-primary ring-2 ring-background"
            aria-hidden
        >
            {initialsFromName(initialsFrom)}
        </div>
    );
}

function notificationIconCircleClass(type: string, role: "guest" | "hotel"): string {
    if (role === "guest") {
        if (type === "booking_confirmed") {
            return "bg-emerald-500/15 ring-2 ring-background dark:bg-emerald-500/20";
        }
        if (type === "booking_declined") {
            return "bg-red-500/15 ring-2 ring-background dark:bg-red-500/20";
        }
    }
    return "bg-primary/10 ring-2 ring-background";
}

function NotificationLeadingVisual({
    n,
    role
}: {
    n: StoredNotification;
    role: "guest" | "hotel";
}) {
    if (n.type === "message") {
        return <MessageAvatar n={n} viewerRole={role} />;
    }
    return (
        <div
            className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                notificationIconCircleClass(n.type, role)
            )}
            aria-hidden
        >
            <TypeIcon type={n.type} role={role} />
        </div>
    );
}

export function NotificationBell({ role }: { role: "guest" | "hotel" }) {
    const pathname = usePathname();
    const { notifications, unreadCount, markAllRead, clearAll, connected } = useMarbleRealtime();

    return (
        <DropdownMenu
            onOpenChange={(open) => {
                if (open) markAllRead();
            }}
        >
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        "relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition hover:bg-muted",
                        !connected && "opacity-80"
                    )}
                    aria-label="Notifications"
                    title={connected ? "Notifications" : "Reconnecting…"}
                >
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 ? (
                        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                            {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                    ) : null}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="w-[min(calc(100vw-2rem),22rem)] overflow-hidden rounded-xl border border-border bg-popover p-0 text-popover-foreground shadow-lg sm:w-[26rem]"
            >
                <DropdownMenuLabel className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3 font-semibold normal-case">
                    <span className="text-sm text-foreground">Notifications</span>
                    {notifications.length > 0 ? (
                        <button
                            type="button"
                            className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
                            onClick={(e) => {
                                e.preventDefault();
                                clearAll();
                            }}
                        >
                            Clear all
                        </button>
                    ) : null}
                </DropdownMenuLabel>

                {notifications.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                            <MessageCircle className="h-6 w-6 text-muted-foreground" aria-hidden />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            No notifications yet. Booking updates and messages will appear here.
                        </p>
                    </div>
                ) : (
                    <>
                        <div
                            className={cn(
                                "max-h-[min(22rem,70vh)] overflow-y-auto overscroll-contain",
                                "[scrollbar-width:thin]",
                                "[scrollbar-color:hsl(var(--muted-foreground)/0.35)_transparent]",
                                "[&::-webkit-scrollbar]:w-1.5",
                                "[&::-webkit-scrollbar-track]:bg-transparent",
                                "[&::-webkit-scrollbar-thumb]:rounded-full",
                                "[&::-webkit-scrollbar-thumb]:bg-muted-foreground/30"
                            )}
                        >
                            {notifications.map((n) => {
                                const href = notificationHref(n, role);
                                const isUnreadish = !n.read && pathname !== href;
                                const isMessage = n.type === "message";
                                const headline = isMessage ? displaySenderName(n) : n.title;

                                return (
                                    <DropdownMenuItem
                                        key={n.id}
                                        asChild
                                        className="cursor-pointer rounded-none border-b border-border/60 p-0 last:border-b-0 focus:bg-muted/70 data-[highlighted]:bg-muted/70"
                                    >
                                        <Link
                                            href={href}
                                            className={cn(
                                                "flex w-full items-start gap-3 px-4 py-3 text-left outline-none",
                                                isUnreadish && "bg-primary/[0.06]"
                                            )}
                                        >
                                            <NotificationLeadingVisual n={n} role={role} />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-baseline justify-between gap-2">
                                                    <span className="line-clamp-1 text-sm font-semibold text-foreground">
                                                        {headline}
                                                    </span>
                                                    <time
                                                        className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground"
                                                        dateTime={n.createdAt}
                                                    >
                                                        {formatNotifTime(n.createdAt)}
                                                    </time>
                                                </div>
                                                <p
                                                    className={cn(
                                                        "line-clamp-2 text-xs leading-snug text-muted-foreground",
                                                        isMessage ? "mt-1" : "mt-1.5"
                                                    )}
                                                >
                                                    {n.body}
                                                </p>
                                            </div>
                                        </Link>
                                    </DropdownMenuItem>
                                );
                            })}
                        </div>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
