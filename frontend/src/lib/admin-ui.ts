import type { AdminHotelOwner, AdminHotelRow } from "@/types/admin";

export function hotelProfilesList(hotel: AdminHotelRow): AdminHotelOwner[] {
    const raw = hotel.profiles;
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [raw];
}

/** Prefer linked hotel account; fallback to first profile row. */
export function primaryHotelOwner(hotel: AdminHotelRow): AdminHotelOwner | null {
    const list = hotelProfilesList(hotel);
    const hotelAcc = list.find((p) => p.role === "hotel");
    return hotelAcc ?? list[0] ?? null;
}

export function verificationStatusStyles(status: string): { label: string; className: string } {
    const s = status.toLowerCase();
    if (s === "verified") {
        return {
            label: "Verified",
            className:
                "rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80"
        };
    }
    if (s === "rejected") {
        return {
            label: "Declined",
            className:
                "rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-red-50 text-red-800 ring-1 ring-red-200/80"
        };
    }
    return {
        label: "Pending",
        className:
            "rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-amber-50 text-amber-900 ring-1 ring-amber-200/90"
    };
}

export function userRoleBadgeStyles(role: string): string {
    const r = role.toLowerCase();
    if (r === "guest") {
        return "rounded-full px-2.5 py-0.5 text-xs font-semibold bg-sky-50 text-sky-900 ring-1 ring-sky-200/80";
    }
    if (r === "hotel") {
        return "rounded-full px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-800 ring-1 ring-slate-200/90";
    }
    if (r === "admin") {
        return "rounded-full px-2.5 py-0.5 text-xs font-semibold bg-primary/10 text-primary ring-1 ring-primary/20";
    }
    return "rounded-full px-2.5 py-0.5 text-xs font-semibold bg-muted text-muted-foreground ring-1 ring-border";
}

export function formatJoinedDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

export function genderLabel(raw: string | null | undefined): string {
    if (!raw) return "—";
    const map: Record<string, string> = {
        prefer_not_to_say: "Prefer not to say",
        male: "Male",
        female: "Female",
        non_binary: "Non-binary",
        other: "Other"
    };
    return map[raw] ?? raw;
}
