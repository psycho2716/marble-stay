"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
    AlertTriangle,
    Eye,
    FileDown,
    Info,
    Loader2,
    Mail,
    Pencil,
    Phone,
    Save,
    UserRound
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { dispatchNavAvatarRefresh } from "@/lib/navEvents";
import { GUEST_COUNTRY_OPTIONS } from "@/lib/guest-countries";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const TAB_IDS = ["account", "preferences", "payments", "security"] as const;
type TabId = (typeof TAB_IDS)[number];

function getAuthHeaders(): HeadersInit {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const supabaseToken =
        typeof window !== "undefined" ? localStorage.getItem("supabase_access_token") : null;
    return {
        Authorization: `Bearer ${token ?? ""}`,
        ...(supabaseToken ? { "x-supabase-access-token": supabaseToken } : {})
    };
}

const GENDER_OPTIONS = [
    { value: "", label: "Select gender" },
    { value: "prefer_not_to_say", label: "Prefer not to say" },
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "non_binary", label: "Non-binary" },
    { value: "other", label: "Other" }
] as const;

type MeResponse = {
    id: string;
    email: string | null;
    full_name: string | null;
    phone?: string | null;
    country?: string | null;
    address_line?: string | null;
    city?: string | null;
    region?: string | null;
    postal_code?: string | null;
    gender?: string | null;
    date_of_birth?: string | null;
    avatar_url?: string | null;
    role: string;
    guest_onboarding_completed?: boolean;
    needs_onboarding?: boolean;
};

type PrefsResponse = {
    budget_min?: number | string | null;
    budget_max?: number | string | null;
    travel_needs?: string | null;
    hotel_preferences?: string | null;
};

function tabFromParam(raw: string | null): TabId {
    if (raw && (TAB_IDS as readonly string[]).includes(raw)) return raw as TabId;
    return "account";
}

type GuestPaymentBookingRow = {
    id: string;
    check_in: string;
    check_out: string;
    status: string;
    payment_status?: string;
    payment_method?: string | null;
    total_amount: string;
    rooms?:
        | {
              name?: string | null;
              hotels?:
                  | { name?: string | null; currency?: string | null }
                  | { name?: string | null; currency?: string | null }[]
                  | null;
          }
        | {
              name?: string | null;
              hotels?:
                  | { name?: string | null; currency?: string | null }
                  | { name?: string | null; currency?: string | null }[]
                  | null;
          }[]
        | null;
};

function paymentBookingRef(id: string): string {
    const compact = id.replace(/-/g, "").slice(0, 8).toUpperCase();
    return `MST-${compact}`;
}

function paymentRoomHotel(b: GuestPaymentBookingRow): {
    roomName: string | null;
    hotelName: string | null;
    currency: string | null;
} {
    const r = Array.isArray(b.rooms) ? b.rooms[0] : b.rooms;
    const h = r?.hotels;
    const hotel = (Array.isArray(h) ? h[0] : h) ?? null;
    return {
        roomName: r?.name ?? null,
        hotelName: hotel?.name ?? null,
        currency: hotel?.currency ?? null
    };
}

function paymentStatusPill(b: GuestPaymentBookingRow): { label: string; className: string } {
    const st = (b.status ?? "").toLowerCase();
    const ps = (b.payment_status ?? "").toLowerCase();
    if (st === "cancelled" || ps === "cancelled") {
        return {
            label: "CANCELLED",
            className:
                "rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-slate-100 text-slate-700 ring-1 ring-slate-200/90"
        };
    }
    if (ps === "paid") {
        return {
            label: "PAID",
            className:
                "rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
        };
    }
    if (ps === "refunded") {
        return {
            label: "REFUNDED",
            className:
                "rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-violet-50 text-violet-800 ring-1 ring-violet-200"
        };
    }
    return {
        label: "UNPAID",
        className:
            "rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-orange-50 text-orange-900 ring-1 ring-orange-200/90"
    };
}

function checkInLabel(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

function GuestProfilePageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const tab = tabFromParam(searchParams.get("tab"));

    const setTab = useCallback(
        (next: TabId) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("tab", next);
            router.replace(`/profile?${params.toString()}`, { scroll: false });
        },
        [router, searchParams]
    );

    const [loading, setLoading] = useState(true);
    const [me, setMe] = useState<MeResponse | null>(null);

    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [country, setCountry] = useState("");
    const [addressLine, setAddressLine] = useState("");
    const [city, setCity] = useState("");
    const [region, setRegion] = useState("");
    const [postalCode, setPostalCode] = useState("");
    const [gender, setGender] = useState("");
    const [dateOfBirth, setDateOfBirth] = useState("");
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

    const [snapAccount, setSnapAccount] = useState({
        fullName: "",
        phone: "",
        country: "",
        addressLine: "",
        city: "",
        region: "",
        postalCode: "",
        gender: "",
        dateOfBirth: "",
        avatarUrl: null as string | null
    });

    const [budgetMin, setBudgetMin] = useState("");
    const [budgetMax, setBudgetMax] = useState("");
    const [travelNeeds, setTravelNeeds] = useState("");
    const [hotelPreferences, setHotelPreferences] = useState("");
    const [snapPrefs, setSnapPrefs] = useState({
        budgetMin: "",
        budgetMax: "",
        travelNeeds: "",
        hotelPreferences: ""
    });

    const [savingAccount, setSavingAccount] = useState(false);
    const [savingPrefs, setSavingPrefs] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [removingAvatar, setRemovingAvatar] = useState(false);

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [changingPassword, setChangingPassword] = useState(false);
    const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
    const [deactivatePassword, setDeactivatePassword] = useState("");
    const [deactivating, setDeactivating] = useState(false);

    const [paymentBookings, setPaymentBookings] = useState<GuestPaymentBookingRow[]>([]);
    const [paymentsLoading, setPaymentsLoading] = useState(false);
    const [receiptDownloadingId, setReceiptDownloadingId] = useState<string | null>(null);

    const textareaClass = useMemo(
        () =>
            "flex min-h-[120px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
        []
    );

    const countrySelectOptions = useMemo(() => {
        const fixed = GUEST_COUNTRY_OPTIONS.filter((c) => c.value !== "");
        const extra =
            country && !fixed.some((c) => c.value === country)
                ? ([{ value: country, label: country }] as { value: string; label: string }[])
                : [];
        return [{ value: "", label: "Select country / region" }, ...fixed, ...extra];
    }, [country]);

    const loadAll = useCallback(async () => {
        const token = localStorage.getItem("token");
        if (!token) {
            router.replace("/login");
            return;
        }

        const [meRes, prefsRes] = await Promise.all([
            fetch(`${API_BASE}/api/auth/me`, { headers: getAuthHeaders() }),
            fetch(`${API_BASE}/api/preferences`, { headers: getAuthHeaders() })
        ]);

        if (!meRes.ok) {
            if (meRes.status === 401) {
                router.replace("/login");
                return;
            }
            toast.error("Could not load your profile.");
            setLoading(false);
            return;
        }

        const meData = (await meRes.json()) as MeResponse;
        if (meData.role !== "guest") {
            router.replace(meData.role === "hotel" ? "/hotel/profile" : "/");
            return;
        }

        setMe(meData);
        setEmail(meData.email ?? "");
        setFullName(meData.full_name ?? "");
        setPhone(meData.phone ?? "");
        setCountry(meData.country ?? "");
        setAddressLine(meData.address_line ?? "");
        setCity(meData.city ?? "");
        setRegion(meData.region ?? "");
        setPostalCode(meData.postal_code ?? "");
        setGender(meData.gender ?? "");
        setDateOfBirth(meData.date_of_birth ? String(meData.date_of_birth).slice(0, 10) : "");
        setAvatarUrl(meData.avatar_url ?? null);
        setSnapAccount({
            fullName: meData.full_name ?? "",
            phone: meData.phone ?? "",
            country: meData.country ?? "",
            addressLine: meData.address_line ?? "",
            city: meData.city ?? "",
            region: meData.region ?? "",
            postalCode: meData.postal_code ?? "",
            gender: meData.gender ?? "",
            dateOfBirth: meData.date_of_birth ? String(meData.date_of_birth).slice(0, 10) : "",
            avatarUrl: meData.avatar_url ?? null
        });
        dispatchNavAvatarRefresh();

        if (prefsRes.ok) {
            const p = (await prefsRes.json()) as PrefsResponse;
            const min =
                p.budget_min != null && p.budget_min !== ""
                    ? String(p.budget_min)
                    : "";
            const max =
                p.budget_max != null && p.budget_max !== ""
                    ? String(p.budget_max)
                    : "";
            setBudgetMin(min);
            setBudgetMax(max);
            setTravelNeeds(p.travel_needs ?? "");
            setHotelPreferences(p.hotel_preferences ?? "");
            setSnapPrefs({
                budgetMin: min,
                budgetMax: max,
                travelNeeds: p.travel_needs ?? "",
                hotelPreferences: p.hotel_preferences ?? ""
            });
        }

        setLoading(false);
    }, [router]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    const loadPaymentBookings = useCallback(async () => {
        const token = localStorage.getItem("token");
        if (!token) return;
        setPaymentsLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/bookings`, { headers: getAuthHeaders() });
            if (!res.ok) {
                setPaymentBookings([]);
                return;
            }
            const data = (await res.json()) as unknown;
            const rows = Array.isArray(data)
                ? (data as GuestPaymentBookingRow[])
                : data &&
                    typeof data === "object" &&
                    "bookings" in data &&
                    Array.isArray((data as { bookings: unknown }).bookings)
                  ? (data as { bookings: GuestPaymentBookingRow[] }).bookings
                  : [];
            setPaymentBookings(rows);
        } finally {
            setPaymentsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (tab === "payments" && me) {
            loadPaymentBookings();
        }
    }, [tab, me, loadPaymentBookings]);

    async function downloadEReceipt(bookingId: string) {
        setReceiptDownloadingId(bookingId);
        try {
            const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/e-receipt`, {
                headers: getAuthHeaders()
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast.error(
                    (data as { error?: string }).error ?? "Could not download e-receipt."
                );
                return;
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `MarbleStay-e-receipt-${paymentBookingRef(bookingId)}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            toast.success("E-receipt downloaded.");
        } finally {
            setReceiptDownloadingId(null);
        }
    }

    const isAccountDirty = useMemo(() => {
        return (
            fullName !== snapAccount.fullName ||
            phone !== snapAccount.phone ||
            country !== snapAccount.country ||
            addressLine !== snapAccount.addressLine ||
            city !== snapAccount.city ||
            region !== snapAccount.region ||
            postalCode !== snapAccount.postalCode ||
            gender !== snapAccount.gender ||
            dateOfBirth !== snapAccount.dateOfBirth ||
            avatarUrl !== snapAccount.avatarUrl
        );
    }, [
        fullName,
        phone,
        country,
        addressLine,
        city,
        region,
        postalCode,
        gender,
        dateOfBirth,
        avatarUrl,
        snapAccount
    ]);

    const isPrefsDirty = useMemo(() => {
        return (
            budgetMin !== snapPrefs.budgetMin ||
            budgetMax !== snapPrefs.budgetMax ||
            travelNeeds !== snapPrefs.travelNeeds ||
            hotelPreferences !== snapPrefs.hotelPreferences
        );
    }, [budgetMin, budgetMax, travelNeeds, hotelPreferences, snapPrefs]);

    async function handleSaveAccount(e: React.FormEvent) {
        e.preventDefault();
        setSavingAccount(true);
        try {
            const res = await fetch(`${API_BASE}/api/auth/profile`, {
                method: "PATCH",
                headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({
                    full_name: fullName.trim() || null,
                    phone: phone.trim() || null,
                    country: country.trim() || null,
                    address_line: addressLine.trim() || null,
                    city: city.trim() || null,
                    region: region.trim() || null,
                    postal_code: postalCode.trim() || null,
                    gender: gender.trim() || null,
                    date_of_birth: dateOfBirth.trim() || null
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error((data as { error?: string }).error ?? "Failed to save.");
                return;
            }
            const d = data as {
                full_name?: string | null;
                phone?: string | null;
                country?: string | null;
                address_line?: string | null;
                city?: string | null;
                region?: string | null;
                postal_code?: string | null;
                gender?: string | null;
                date_of_birth?: string | null;
                avatar_url?: string | null;
            };
            setFullName(d.full_name ?? "");
            setPhone(d.phone ?? "");
            setCountry(d.country ?? "");
            setAddressLine(d.address_line ?? "");
            setCity(d.city ?? "");
            setRegion(d.region ?? "");
            setPostalCode(d.postal_code ?? "");
            setGender(d.gender ?? "");
            setDateOfBirth(d.date_of_birth ? String(d.date_of_birth).slice(0, 10) : "");
            if (d.avatar_url !== undefined) setAvatarUrl(d.avatar_url ?? null);
            setSnapAccount({
                fullName: d.full_name ?? "",
                phone: d.phone ?? "",
                country: d.country ?? "",
                addressLine: d.address_line ?? "",
                city: d.city ?? "",
                region: d.region ?? "",
                postalCode: d.postal_code ?? "",
                gender: d.gender ?? "",
                dateOfBirth: d.date_of_birth ? String(d.date_of_birth).slice(0, 10) : "",
                avatarUrl: d.avatar_url ?? avatarUrl
            });
            toast.success("Profile updated.");
        } finally {
            setSavingAccount(false);
        }
    }

    async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            toast.error("Please choose an image (JPG, PNG, GIF, or WebP).");
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            toast.error("Image must be 2MB or smaller.");
            return;
        }
        setUploadingAvatar(true);
        try {
            const body = new FormData();
            body.append("profile_image", file);
            const res = await fetch(`${API_BASE}/api/auth/guest/profile-image`, {
                method: "POST",
                headers: getAuthHeaders(),
                body
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error((data as { error?: string }).error ?? "Upload failed.");
                return;
            }
            const url = (data as { avatar_url?: string | null }).avatar_url ?? null;
            setAvatarUrl(url);
            setSnapAccount((s) => ({ ...s, avatarUrl: url }));
            toast.success("Profile photo updated.");
            dispatchNavAvatarRefresh();
        } finally {
            setUploadingAvatar(false);
        }
    }

    async function handleRemoveAvatar() {
        setRemovingAvatar(true);
        try {
            const res = await fetch(`${API_BASE}/api/auth/profile`, {
                method: "PATCH",
                headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({ clear_avatar: true })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error((data as { error?: string }).error ?? "Could not remove photo.");
                return;
            }
            setAvatarUrl(null);
            setSnapAccount((s) => ({ ...s, avatarUrl: null }));
            toast.success("Profile photo removed.");
            dispatchNavAvatarRefresh();
        } finally {
            setRemovingAvatar(false);
        }
    }

    async function handleSavePreferences(e: React.FormEvent) {
        e.preventDefault();
        const minVal = budgetMin.trim() === "" ? null : Number(budgetMin);
        const maxVal = budgetMax.trim() === "" ? null : Number(budgetMax);
        if (minVal !== null && Number.isNaN(minVal)) {
            toast.error("Min budget must be a number.");
            return;
        }
        if (maxVal !== null && Number.isNaN(maxVal)) {
            toast.error("Max budget must be a number.");
            return;
        }
        if (minVal != null && maxVal != null && minVal > maxVal) {
            toast.error("Min budget cannot be greater than max budget.");
            return;
        }

        setSavingPrefs(true);
        try {
            const res = await fetch(`${API_BASE}/api/preferences`, {
                method: "PATCH",
                headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({
                    budget_min: minVal,
                    budget_max: maxVal,
                    travel_needs: travelNeeds.trim() || null,
                    hotel_preferences: hotelPreferences.trim() || null
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error((data as { error?: string }).error ?? "Failed to save preferences.");
                return;
            }
            const p = data as PrefsResponse;
            const min =
                p.budget_min != null && p.budget_min !== ""
                    ? String(p.budget_min)
                    : "";
            const max =
                p.budget_max != null && p.budget_max !== ""
                    ? String(p.budget_max)
                    : "";
            setBudgetMin(min);
            setBudgetMax(max);
            setTravelNeeds(p.travel_needs ?? "");
            setHotelPreferences(p.hotel_preferences ?? "");
            setSnapPrefs({
                budgetMin: min,
                budgetMax: max,
                travelNeeds: p.travel_needs ?? "",
                hotelPreferences: p.hotel_preferences ?? ""
            });
            toast.success("Preferences saved.");
        } finally {
            setSavingPrefs(false);
        }
    }

    if (loading) {
        return (
            <div className="mx-auto min-h-[50vh] max-w-4xl px-4 py-12">
                <div className="h-10 w-56 animate-pulse rounded-lg bg-muted" />
                <div className="mt-6 h-64 animate-pulse rounded-xl bg-muted" />
            </div>
        );
    }

    if (!me) {
        return (
            <div className="mx-auto max-w-4xl px-4 py-12">
                <p className="text-muted-foreground">Unable to load profile.</p>
                <Link href="/" className="mt-4 inline-block text-primary underline">
                    Back to home
                </Link>
            </div>
        );
    }

    const tabTriggerClass =
        "rounded-none border-b-[3px] border-transparent px-4 py-3 text-sm font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none";

    return (
        <main className="mx-auto min-h-screen max-w-4xl px-4 pb-16 pt-6">
            <header className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    Profile Settings
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Manage your personal information and account preferences.
                </p>
            </header>

            <Tabs
                value={tab}
                onValueChange={(v) => setTab(v as TabId)}
                className="space-y-6"
            >
                <TabsList className="h-auto w-full justify-start gap-0 rounded-none border-b border-border bg-transparent p-0">
                    <TabsTrigger value="account" className={tabTriggerClass}>
                        Account
                    </TabsTrigger>
                    <TabsTrigger value="preferences" className={tabTriggerClass}>
                        Preferences
                    </TabsTrigger>
                    <TabsTrigger value="payments" className={tabTriggerClass}>
                        Payments
                    </TabsTrigger>
                    <TabsTrigger value="security" className={tabTriggerClass}>
                        Security
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="account" className="mt-0 space-y-0">
                    <form
                        onSubmit={handleSaveAccount}
                        className="rounded-xl border border-border bg-card p-6 shadow-sm"
                    >
                        <div className="grid gap-8 md:grid-cols-[minmax(0,220px)_1fr]">
                            <div>
                                <h2 className="text-sm font-semibold text-foreground">
                                    Profile Picture
                                </h2>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    JPG, GIF or PNG. Max size of 2MB.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-start gap-4">
                                <div className="relative shrink-0">
                                    <div className="flex h-28 w-28 overflow-hidden rounded-lg border border-border bg-muted">
                                        {avatarUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={avatarUrl}
                                                alt=""
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                                <UserRound className="h-12 w-12" />
                                            </div>
                                        )}
                                    </div>
                                    <label className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border bg-card shadow-sm transition hover:bg-muted">
                                        <Pencil className="h-3.5 w-3.5 text-foreground" />
                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/gif,image/webp"
                                            className="sr-only"
                                            onChange={handleAvatarFile}
                                            disabled={uploadingAvatar}
                                        />
                                    </label>
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <label className="inline-flex cursor-pointer">
                                        <span className="rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition hover:bg-muted">
                                            {uploadingAvatar ? "Uploading…" : "Upload New"}
                                        </span>
                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/gif,image/webp"
                                            className="sr-only"
                                            onChange={handleAvatarFile}
                                            disabled={uploadingAvatar}
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleRemoveAvatar}
                                        disabled={!avatarUrl || removingAvatar}
                                        className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-40"
                                    >
                                        {removingAvatar ? "Removing…" : "Remove"}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="mt-10 grid gap-6 sm:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-sm font-semibold text-foreground">
                                    Full Name
                                </label>
                                <Input
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="Your name"
                                    className="rounded-lg border-border"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-semibold text-foreground">
                                    Email Address
                                </label>
                                <div className="relative">
                                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        readOnly
                                        value={email}
                                        className="rounded-lg border-border pl-9 text-muted-foreground"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-semibold text-foreground">
                                    Phone Number
                                </label>
                                <div className="relative">
                                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="+63 …"
                                        className="rounded-lg border-border pl-9"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-semibold text-foreground">
                                    Country / Region
                                </label>
                                <select
                                    value={country}
                                    onChange={(e) => setCountry(e.target.value)}
                                    className={cn(
                                        "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring/30"
                                    )}
                                >
                                    {countrySelectOptions.map((c) => (
                                        <option key={`${c.value}-${c.label}`} value={c.value}>
                                            {c.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-semibold text-foreground">
                                    Street address
                                </label>
                                <Input
                                    value={addressLine}
                                    onChange={(e) => setAddressLine(e.target.value)}
                                    placeholder="House / building, street"
                                    className="rounded-lg border-border"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-semibold text-foreground">
                                    City
                                </label>
                                <Input
                                    value={city}
                                    onChange={(e) => setCity(e.target.value)}
                                    placeholder="City"
                                    className="rounded-lg border-border"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-semibold text-foreground">
                                    Province / state / region
                                </label>
                                <Input
                                    value={region}
                                    onChange={(e) => setRegion(e.target.value)}
                                    placeholder="e.g. Romblon, Metro Manila"
                                    className="rounded-lg border-border"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-semibold text-foreground">
                                    Postal code
                                </label>
                                <Input
                                    value={postalCode}
                                    onChange={(e) => setPostalCode(e.target.value)}
                                    placeholder="ZIP / postal code"
                                    className="rounded-lg border-border"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-semibold text-foreground">
                                    Gender
                                </label>
                                <select
                                    value={gender}
                                    onChange={(e) => setGender(e.target.value)}
                                    className={cn(
                                        "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring/30"
                                    )}
                                >
                                    {GENDER_OPTIONS.map((g) => (
                                        <option key={g.value || "unset"} value={g.value}>
                                            {g.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-semibold text-foreground">
                                    Date of birth
                                </label>
                                <Input
                                    type="date"
                                    value={dateOfBirth}
                                    onChange={(e) => setDateOfBirth(e.target.value)}
                                    className="rounded-lg border-border"
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Optional. Helps hotels verify identity when needed.
                                </p>
                            </div>
                        </div>

                        <div className="mt-8 flex flex-wrap justify-end gap-3 border-t border-border pt-6">
                            {isAccountDirty && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFullName(snapAccount.fullName);
                                        setPhone(snapAccount.phone);
                                        setCountry(snapAccount.country);
                                        setAddressLine(snapAccount.addressLine);
                                        setCity(snapAccount.city);
                                        setRegion(snapAccount.region);
                                        setPostalCode(snapAccount.postalCode);
                                        setGender(snapAccount.gender);
                                        setDateOfBirth(snapAccount.dateOfBirth);
                                        setAvatarUrl(snapAccount.avatarUrl);
                                    }}
                                    className="rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition hover:bg-muted"
                                >
                                    Cancel Changes
                                </button>
                            )}
                            <button
                                type="submit"
                                disabled={savingAccount || !isAccountDirty}
                                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold uppercase tracking-wide text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                            >
                                <Save className="h-4 w-4" />
                                {savingAccount ? "Saving…" : "Save Changes"}
                            </button>
                        </div>
                    </form>
                </TabsContent>

                <TabsContent value="preferences" className="mt-0 space-y-6">
                    <div>
                        <h2 className="text-xl font-bold text-foreground">Preferences</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Set your budget, travel needs, and what you prefer in a hotel for better
                            recommendations.
                        </p>
                    </div>

                    <form
                        onSubmit={handleSavePreferences}
                        className="rounded-xl border border-border bg-card p-6 shadow-sm"
                    >
                        <div className="grid gap-6 sm:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-sm font-semibold text-foreground">
                                    Min budget (₱)
                                </label>
                                <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    placeholder="Optional"
                                    value={budgetMin}
                                    onChange={(e) => setBudgetMin(e.target.value)}
                                    className="rounded-lg border-border"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-semibold text-foreground">
                                    Max budget (₱)
                                </label>
                                <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    placeholder="Optional"
                                    value={budgetMax}
                                    onChange={(e) => setBudgetMax(e.target.value)}
                                    className="rounded-lg border-border"
                                />
                            </div>
                        </div>

                        <div className="mt-6">
                            <label className="mb-1 block text-sm font-semibold text-foreground">
                                Travel needs
                            </label>
                            <p className="mb-2 text-xs text-muted-foreground">
                                e.g. business trips, family travel, accessibility needs…
                            </p>
                            <textarea
                                className={textareaClass}
                                placeholder="Describe how you usually travel…"
                                value={travelNeeds}
                                onChange={(e) => setTravelNeeds(e.target.value)}
                                rows={4}
                            />
                        </div>

                        <div className="mt-6">
                            <label className="mb-1 block text-sm font-semibold text-foreground">
                                Hotel preferences
                            </label>
                            <p className="mb-2 text-xs text-muted-foreground">
                                e.g. quiet rooms, breakfast included, pool, location…
                            </p>
                            <textarea
                                className={textareaClass}
                                placeholder="What matters most to you in a hotel?"
                                value={hotelPreferences}
                                onChange={(e) => setHotelPreferences(e.target.value)}
                                rows={4}
                            />
                        </div>

                        <div className="mt-8 flex justify-end border-t border-border pt-6">
                            <button
                                type="submit"
                                disabled={savingPrefs || !isPrefsDirty}
                                className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold uppercase tracking-wide text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                            >
                                {savingPrefs ? "Saving…" : "Save preferences"}
                            </button>
                        </div>
                    </form>

                    <div className="flex gap-3 rounded-xl border border-border bg-muted/60 p-4">
                        <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                        <div>
                            <p className="font-semibold text-foreground">
                                Personalized recommendations
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Your budget and preferences help us rank hotels on Recommendations and
                                search. Leave fields blank anytime to see the full catalog.
                            </p>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="payments" className="mt-0 space-y-4">
                    <div className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
                        <h2 className="text-xl font-bold text-foreground">Your payments</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Review amounts and payment status for your bookings. Download a PDF
                            e-receipt for each stay once payment is marked{" "}
                            <span className="font-medium text-foreground">paid</span>.
                        </p>

                        <div className="mt-6 overflow-x-auto rounded-lg border border-border">
                            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                                <thead>
                                    <tr className="border-b border-border bg-muted/70">
                                        <th
                                            scope="col"
                                            className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                        >
                                            Booking ID
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                        >
                                            Room
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                        >
                                            Amount
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                        >
                                            Status
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                        >
                                            Action
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paymentsLoading ? (
                                        <tr>
                                            <td colSpan={5} className="px-4 py-12 text-center">
                                                <Loader2
                                                    className="mx-auto h-8 w-8 animate-spin text-muted-foreground"
                                                    aria-hidden
                                                />
                                                <p className="mt-2 text-sm text-muted-foreground">
                                                    Loading payments…
                                                </p>
                                            </td>
                                        </tr>
                                    ) : paymentBookings.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={5}
                                                className="px-4 py-10 text-center text-sm text-muted-foreground"
                                            >
                                                No bookings yet. When you reserve a room, it will
                                                appear here.{" "}
                                                <Link
                                                    href="/"
                                                    className="font-medium text-primary underline"
                                                >
                                                    Browse stays
                                                </Link>
                                            </td>
                                        </tr>
                                    ) : (
                                        paymentBookings.map((row) => {
                                            const { roomName, currency } = paymentRoomHotel(row);
                                            const pill = paymentStatusPill(row);
                                            const isPaid =
                                                String(row.payment_status ?? "").toLowerCase() ===
                                                "paid";
                                            const roomTitle =
                                                roomName?.trim() || "Room";
                                            return (
                                                <tr
                                                    key={row.id}
                                                    className="border-b border-border last:border-b-0"
                                                >
                                                    <td className="px-4 py-4 align-top">
                                                        <span className="font-bold text-foreground">
                                                            #{paymentBookingRef(row.id)}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-4 align-top">
                                                        <p className="font-semibold text-foreground">
                                                            {roomTitle}
                                                        </p>
                                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                                            Check-in: {checkInLabel(row.check_in)}
                                                        </p>
                                                    </td>
                                                    <td className="px-4 py-4 align-top">
                                                        <span className="font-bold text-foreground">
                                                            {formatCurrency(
                                                                row.total_amount,
                                                                currency
                                                            )}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-4 align-top">
                                                        <span
                                                            className={cn(
                                                                "inline-flex",
                                                                pill.className
                                                            )}
                                                        >
                                                            {pill.label}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-4 align-top">
                                                        {isPaid ? (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    downloadEReceipt(row.id)
                                                                }
                                                                disabled={
                                                                    receiptDownloadingId === row.id
                                                                }
                                                                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                                                            >
                                                                {receiptDownloadingId === row.id ? (
                                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                ) : (
                                                                    <FileDown className="h-3.5 w-3.5" />
                                                                )}
                                                                Download e-receipt
                                                            </button>
                                                        ) : (
                                                            <Link
                                                                href={`/bookings/${row.id}`}
                                                                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition hover:opacity-90"
                                                            >
                                                                <Eye className="h-3.5 w-3.5" />
                                                                View details
                                                            </Link>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <p className="mt-4 text-xs text-muted-foreground">
                            Need the full booking timeline? Open{" "}
                            <Link href="/bookings" className="font-medium text-primary underline">
                                My Bookings
                            </Link>
                            .
                        </p>
                    </div>
                </TabsContent>

                <TabsContent value="security" className="mt-0 space-y-6">
                    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
                        <h2 className="text-sm font-semibold text-foreground">Change password</h2>
                        <div className="mt-4 border-t border-border pt-4">
                            <form
                                onSubmit={async (e) => {
                                    e.preventDefault();
                                    if (newPassword !== confirmPassword) {
                                        toast.error("New password and confirmation do not match.");
                                        return;
                                    }
                                    if (newPassword.length < 6) {
                                        toast.error("New password must be at least 6 characters.");
                                        return;
                                    }
                                    setChangingPassword(true);
                                    try {
                                        const res = await fetch(`${API_BASE}/api/auth/change-password`, {
                                            method: "POST",
                                            headers: {
                                                ...getAuthHeaders(),
                                                "Content-Type": "application/json"
                                            },
                                            body: JSON.stringify({
                                                current_password: currentPassword,
                                                new_password: newPassword
                                            })
                                        });
                                        const data = await res.json().catch(() => ({}));
                                        if (res.ok) {
                                            toast.success("Password updated successfully.");
                                            setCurrentPassword("");
                                            setNewPassword("");
                                            setConfirmPassword("");
                                        } else {
                                            toast.error(
                                                (data as { error?: string }).error ??
                                                    "Failed to change password."
                                            );
                                        }
                                    } finally {
                                        setChangingPassword(false);
                                    }
                                }}
                                className="space-y-4"
                            >
                                <div>
                                    <label
                                        htmlFor="guest-current-password"
                                        className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                                    >
                                        Current password
                                    </label>
                                    <Input
                                        id="guest-current-password"
                                        type="password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        required
                                        className="mt-1 max-w-md rounded-lg border-border"
                                        autoComplete="current-password"
                                    />
                                </div>
                                <div>
                                    <label
                                        htmlFor="guest-new-password"
                                        className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                                    >
                                        New password
                                    </label>
                                    <Input
                                        id="guest-new-password"
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        required
                                        minLength={6}
                                        className="mt-1 max-w-md rounded-lg border-border"
                                        autoComplete="new-password"
                                    />
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        At least 6 characters.
                                    </p>
                                </div>
                                <div>
                                    <label
                                        htmlFor="guest-confirm-password"
                                        className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                                    >
                                        Confirm new password
                                    </label>
                                    <Input
                                        id="guest-confirm-password"
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                        className="mt-1 max-w-md rounded-lg border-border"
                                        autoComplete="new-password"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={changingPassword}
                                    className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold uppercase tracking-wide text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                                >
                                    {changingPassword ? "Updating…" : "Change password"}
                                </button>
                            </form>
                        </div>
                    </section>

                    <div className="rounded-lg border border-red-200 bg-red-50/90 p-4 dark:border-red-900/50 dark:bg-red-950/30">
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="flex gap-3">
                                    <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                                    <div>
                                        <p className="font-semibold text-red-800 dark:text-red-200">
                                            Deactivate Account
                                        </p>
                                        <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/90">
                                            Once you delete your account, there is no going back.
                                            Please be certain.
                                        </p>
                                    </div>
                                </div>
                                {!showDeactivateConfirm && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowDeactivateConfirm(true);
                                            setDeactivatePassword("");
                                        }}
                                        className="text-sm font-semibold text-red-700 hover:underline dark:text-red-300"
                                    >
                                        Deactivate
                                    </button>
                                )}
                            </div>
                            {showDeactivateConfirm && (
                                <div className="space-y-3 border-t border-red-200/80 pt-4 dark:border-red-900/50">
                                    <p className="text-sm text-foreground">
                                        Enter your current password to confirm account deletion.
                                    </p>
                                    <div>
                                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                            Current password
                                        </label>
                                        <Input
                                            type="password"
                                            value={deactivatePassword}
                                            onChange={(e) => setDeactivatePassword(e.target.value)}
                                            placeholder="Your password"
                                            className="max-w-xs rounded-lg border-border"
                                            autoComplete="current-password"
                                            disabled={deactivating}
                                        />
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (!deactivatePassword.trim()) {
                                                    toast.error("Password is required");
                                                    return;
                                                }
                                                setDeactivating(true);
                                                try {
                                                    const res = await fetch(
                                                        `${API_BASE}/api/auth/delete-account`,
                                                        {
                                                            method: "POST",
                                                            headers: {
                                                                ...getAuthHeaders(),
                                                                "Content-Type": "application/json"
                                                            },
                                                            body: JSON.stringify({
                                                                current_password: deactivatePassword
                                                            })
                                                        }
                                                    );
                                                    const data =
                                                        res.status !== 204
                                                            ? await res.json().catch(() => ({}))
                                                            : {};
                                                    if (!res.ok) {
                                                        toast.error(
                                                            (data as { error?: string }).error ??
                                                                "Failed to delete account"
                                                        );
                                                        return;
                                                    }
                                                    toast.success("Account deleted.");
                                                    localStorage.removeItem("token");
                                                    localStorage.removeItem("supabase_access_token");
                                                    router.push("/login");
                                                } finally {
                                                    setDeactivating(false);
                                                }
                                            }}
                                            disabled={deactivating}
                                            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                                        >
                                            {deactivating ? "Deleting…" : "Delete my account"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowDeactivateConfirm(false);
                                                setDeactivatePassword("");
                                            }}
                                            disabled={deactivating}
                                            className="rounded-lg border border-border bg-card px-4 py-2 text-sm"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </main>
    );
}

export default function GuestProfilePage() {
    return (
        <Suspense
            fallback={
                <div className="mx-auto min-h-[50vh] max-w-4xl px-4 py-12">
                    <div className="h-10 w-56 animate-pulse rounded-lg bg-muted" />
                </div>
            }
        >
            <GuestProfilePageInner />
        </Suspense>
    );
}
