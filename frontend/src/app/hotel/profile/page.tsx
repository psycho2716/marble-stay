"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
    AlertTriangle,
    Building2,
    Camera,
    Download,
    ExternalLink,
    FileText,
    Mail,
    MapPin,
    Pencil,
    Phone,
    Save,
    Trash2,
    Plus,
    User2
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { dispatchNavAvatarRefresh } from "@/lib/navEvents";
import { clearClientAuth } from "@/lib/clear-client-auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const DAYS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday"
] as const;
const DAY_PILL_LABELS: Record<(typeof DAYS)[number], string> = {
    monday: "Mon",
    tuesday: "Tue",
    wednesday: "Wed",
    thursday: "Thu",
    friday: "Fri",
    saturday: "Sat",
    sunday: "Sun"
};
const WEEKDAY_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const WEEKEND_DAYS = ["saturday", "sunday"] as const;

type OpeningHoursPreset = "daily" | "weekdays_weekends" | "manual";
type OpeningHours = Record<string, { open: string; close: string }> & {
    _preset?: OpeningHoursPreset;
};

export type HotelPaymentMethod = {
    id: string;
    label: string;
    qr_image_url?: string;
    account_name: string | null;
    account_number: string | null;
    sort_order?: number;
};

type Hotel = {
    id: string;
    name: string;
    description: string | null;
    address: string;
    contact_email: string;
    contact_phone: string | null;
    business_permit_file?: string | null;
    verification_status: string;
    user_full_name?: string | null;
    permit_expires_at?: string | null;
    hotel_name_edit_used?: boolean | null;
    profile_image?: string | null;
    cover_image?: string | null;
    profile_image_url?: string | null;
    cover_image_url?: string | null;
    bio?: string | null;
    opening_hours?: OpeningHours | null;
    check_in_time?: string | null;
    check_out_time?: string | null;
    payment_qr_image?: string | null;
    payment_qr_image_url?: string | null;
    payment_account_name?: string | null;
    payment_account_number?: string | null;
    payment_methods?: HotelPaymentMethod[];
    currency?: string | null;
    pets_policy?: string | null;
    smoking_policy?: string | null;
    cancellation_policy?: string | null;
};

function getAuthHeaders(): HeadersInit {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const supabaseToken =
        typeof window !== "undefined" ? localStorage.getItem("supabase_access_token") : null;
    return {
        Authorization: `Bearer ${token}`,
        ...(supabaseToken ? { "x-supabase-access-token": supabaseToken } : {})
    };
}

const SHORT_DESCRIPTION_MAX_WORDS = 100;
const BIO_MAX_WORDS = 270;

function countWords(text: string): number {
    return text
        .trim()
        .split(/\s+/)
        .filter((s) => s.length > 0).length;
}

function trimToWordLimit(text: string, maxWords: number): string {
    const parts = text
        .trim()
        .split(/\s+/)
        .filter((s) => s.length > 0);
    return parts.slice(0, maxWords).join(" ");
}

function formatTime(value: string | null | undefined): string {
    if (!value) return "—";
    const [h, m] = value.split(":");
    const hour = parseInt(h ?? "0", 10);
    const min = parseInt(m ?? "0", 10);
    const am = hour < 12;
    const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${h12}:${min.toString().padStart(2, "0")} ${am ? "AM" : "PM"}`;
}

function detectHoursPreset(hours: OpeningHours): OpeningHoursPreset {
    if (hours._preset) return hours._preset;
    const keys = DAYS.filter((d) => d in hours && hours[d]?.open && hours[d]?.close);
    if (keys.length === 0) return "manual";
    const first = hours[keys[0]];
    const allSame = keys.every(
        (d) => hours[d]?.open === first?.open && hours[d]?.close === first?.close
    );
    if (allSame && keys.length === 7) return "daily";
    const weekdaysSame =
        WEEKDAY_DAYS.every(
            (d) => hours[d]?.open === hours.monday?.open && hours[d]?.close === hours.monday?.close
        ) &&
        WEEKEND_DAYS.every(
            (d) =>
                hours[d]?.open === hours.saturday?.open && hours[d]?.close === hours.saturday?.close
        );
    if (weekdaysSame) return "weekdays_weekends";
    return "manual";
}

export default function HotelProfilePage() {
    const [hotel, setHotel] = useState<Hotel | null>(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploadingProfile, setUploadingProfile] = useState(false);
    const [uploadingCover, setUploadingCover] = useState(false);
    const [uploadingPaymentQr, setUploadingPaymentQr] = useState(false);
    const [editingPaymentMethod, setEditingPaymentMethod] = useState(false);
    const [savingPaymentMethod, setSavingPaymentMethod] = useState(false);
    const [editingMethodId, setEditingMethodId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState<{
        label: string;
        account_name: string;
        account_number: string;
    }>({
        label: "",
        account_name: "",
        account_number: ""
    });
    const [newMethodQrFile, setNewMethodQrFile] = useState<File | null>(null);
    const [newMethodQrPreview, setNewMethodQrPreview] = useState<string | null>(null);
    const [editMethodQrFile, setEditMethodQrFile] = useState<File | null>(null);
    const [editMethodQrPreview, setEditMethodQrPreview] = useState<string | null>(null);
    const [hoursPreset, setHoursPreset] = useState<OpeningHoursPreset>("manual");

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [changingPassword, setChangingPassword] = useState(false);
    const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
    const [deactivatePassword, setDeactivatePassword] = useState("");
    const [deactivating, setDeactivating] = useState(false);
    const [paymentMethodDeleteId, setPaymentMethodDeleteId] = useState<string | null>(null);
    const [permitUrl, setPermitUrl] = useState<string | null>(null);
    const [permitLoading, setPermitLoading] = useState(false);
    const [downloadingPermit, setDownloadingPermit] = useState(false);

    const router = useRouter();

    const [descriptionEdit, setDescriptionEdit] = useState("");
    const [bioEdit, setBioEdit] = useState("");
    const [selectedDays, setSelectedDays] = useState<(typeof DAYS)[number][]>(WEEKDAY_DAYS.slice());
    const [checkInTime, setCheckInTime] = useState("");
    const [checkOutTime, setCheckOutTime] = useState("");
    const [hotelNameEdit, setHotelNameEdit] = useState("");
    const [accountNameEdit, setAccountNameEdit] = useState("");
    const [contactEmailEdit, setContactEmailEdit] = useState("");
    const [contactPhoneEdit, setContactPhoneEdit] = useState("");
    const [addressEdit, setAddressEdit] = useState("");

    const savedDaysFromHotel = useMemo(() => {
        const hours = (hotel?.opening_hours ?? {}) as OpeningHours;
        const days = DAYS.filter(
            (d) =>
                hours[d]?.open &&
                hours[d]?.close &&
                hours[d].open !== "—" &&
                hours[d].close !== "—"
        );
        return days.length > 0 ? days : [...WEEKDAY_DAYS];
    }, [hotel?.opening_hours]);

    const isAccountFormDirty = useMemo(() => {
        if (!hotel) return false;
        const descMatch = descriptionEdit === (hotel.description ?? "");
        const bioMatch = bioEdit === (hotel.bio ?? "");
        const daysMatch =
            JSON.stringify([...selectedDays].sort()) ===
            JSON.stringify([...savedDaysFromHotel].sort());
        const checkInMatch = checkInTime === (hotel.check_in_time ?? "14:00");
        const checkOutMatch = checkOutTime === (hotel.check_out_time ?? "11:00");
        const hotelNameMatch = hotelNameEdit === (hotel.name ?? "");
        const accountNameMatch = accountNameEdit === (hotel.user_full_name ?? "");
        const contactEmailMatch = contactEmailEdit === (hotel.contact_email ?? "");
        const contactPhoneMatch = contactPhoneEdit === (hotel.contact_phone ?? "");
        const addressMatch = addressEdit === (hotel.address ?? "");
        return !(
            descMatch &&
            bioMatch &&
            daysMatch &&
            checkInMatch &&
            checkOutMatch &&
            hotelNameMatch &&
            accountNameMatch &&
            contactEmailMatch &&
            contactPhoneMatch &&
            addressMatch
        );
    }, [
        hotel,
        descriptionEdit,
        bioEdit,
        selectedDays,
        savedDaysFromHotel,
        checkInTime,
        checkOutTime,
        hotelNameEdit,
        accountNameEdit,
        contactEmailEdit,
        contactPhoneEdit,
        addressEdit
    ]);

    const canEditHotelName = useMemo(() => {
        if (!hotel) return false;
        if (hotel.hotel_name_edit_used) return false;
        if (!hotel.permit_expires_at) return false;
        const expiry = new Date(hotel.permit_expires_at);
        if (Number.isNaN(expiry.getTime())) return false;
        return expiry.getTime() < Date.now();
    }, [hotel]);

    const loadHotel = useCallback(async () => {
        const res = await fetch(`${API_BASE}/api/me/hotel`, { headers: getAuthHeaders() });
        if (res.ok) {
            const data = await res.json();
            setHotel(data);
            const hours = (data?.opening_hours ?? {}) as OpeningHours;
            setHoursPreset(detectHoursPreset(hours));
            setDescriptionEdit(data?.description ?? "");
            setBioEdit(data?.bio ?? "");
            const daysWithHours = DAYS.filter(
                (d) =>
                    hours[d]?.open &&
                    hours[d]?.close &&
                    hours[d].open !== "—" &&
                    hours[d].close !== "—"
            );
            setSelectedDays(daysWithHours.length > 0 ? daysWithHours : WEEKDAY_DAYS.slice());
            setCheckInTime(data?.check_in_time ?? "14:00");
            setCheckOutTime(data?.check_out_time ?? "11:00");
            setHotelNameEdit(data?.name ?? "");
            setAccountNameEdit(data?.user_full_name ?? "");
            setContactEmailEdit(data?.contact_email ?? "");
            setContactPhoneEdit(data?.contact_phone ?? "");
            setAddressEdit(data?.address ?? "");
            dispatchNavAvatarRefresh();
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) return;
        loadHotel();
    }, [loadHotel]);

    useEffect(() => {
        if (!hotel?.business_permit_file) {
            setPermitUrl(null);
            return;
        }

        let active = true;
        const loadPermitUrl = async () => {
            setPermitLoading(true);
            try {
                const res = await fetch(`${API_BASE}/api/hotel/permit-url`, {
                    headers: getAuthHeaders()
                });
                if (!active) return;
                if (!res.ok) {
                    setPermitUrl(null);
                    return;
                }
                const data = (await res.json()) as { url?: string };
                setPermitUrl(data.url ?? null);
            } finally {
                if (active) setPermitLoading(false);
            }
        };

        loadPermitUrl();
        return () => {
            active = false;
        };
    }, [hotel?.business_permit_file]);

    async function handleDownloadPermit() {
        if (!permitUrl || !hotel?.business_permit_file) return;
        setDownloadingPermit(true);
        try {
            const response = await fetch(permitUrl);
            if (!response.ok) {
                throw new Error("Failed to fetch legal document");
            }

            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const permitPath = hotel.business_permit_file;
            const safeName = permitPath.split("/").pop() || "legal-document";
            const anchor = document.createElement("a");
            anchor.href = blobUrl;
            anchor.download = safeName;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(blobUrl);
        } catch (_error) {
            toast.error("Could not download legal document.");
        } finally {
            setDownloadingPermit(false);
        }
    }

    async function handleSaveProfile(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setSaving(true);
        const form = e.currentTarget;
        const formData = new FormData(form);
        const checkIn = (formData.get("check_in_time") as string)?.trim() || null;
        const checkOut = (formData.get("check_out_time") as string)?.trim() || null;
        const openStr = checkIn || "00:00";
        const closeStr = checkOut || "23:59";
        const opening_hours = { _preset: "manual" as const } as OpeningHours;
        selectedDays.forEach((day) => {
            opening_hours[day] = { open: openStr, close: closeStr };
        });

        const body = {
            account_full_name: accountNameEdit.trim(),
            name: hotelNameEdit.trim(),
            address: addressEdit.trim(),
            contact_email: contactEmailEdit.trim(),
            contact_phone: contactPhoneEdit.trim() || null,
            description: trimToWordLimit(descriptionEdit, SHORT_DESCRIPTION_MAX_WORDS) || null,
            bio: trimToWordLimit(bioEdit, BIO_MAX_WORDS) || null,
            opening_hours,
            check_in_time: (formData.get("check_in_time") as string) || null,
            check_out_time: (formData.get("check_out_time") as string) || null,
            payment_account_name:
                (formData.get("payment_account_name") as string)?.trim() ||
                hotel?.payment_account_name ||
                null,
            payment_account_number:
                (formData.get("payment_account_number") as string)?.trim() ||
                hotel?.payment_account_number ||
                null,
            pets_policy: (formData.get("pets_policy") as string)?.trim() || null,
            smoking_policy: (formData.get("smoking_policy") as string)?.trim() || null,
            cancellation_policy: (formData.get("cancellation_policy") as string)?.trim() || null
        };
        const res = await fetch(`${API_BASE}/api/hotel/profile`, {
            method: "PATCH",
            headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        setSaving(false);
        if (res.ok) {
            const updated = await res.json();
            setHotel((prev) => (prev ? { ...prev, ...updated } : prev));
            if (updated?.opening_hours) {
                setHoursPreset(detectHoursPreset(updated.opening_hours as OpeningHours));
            }
            setEditing(false);
            toast.success("Profile saved.");
        } else {
            const data = await res.json().catch(() => ({}));
            toast.error(data.error ?? "Failed to save");
        }
    }

    async function handleProfileImageChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingProfile(true);
        const fd = new FormData();
        fd.append("profile_image", file);
        const res = await fetch(`${API_BASE}/api/hotel/profile-image`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: fd
        });
        setUploadingProfile(false);
        if (res.ok) {
            loadHotel();
            toast.success("Profile photo updated.");
        } else {
            const data = await res.json().catch(() => ({}));
            toast.error(data.error ?? "Failed to upload profile image");
        }
        e.target.value = "";
    }

    async function handleCoverImageChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingCover(true);
        const fd = new FormData();
        fd.append("cover_image", file);
        const res = await fetch(`${API_BASE}/api/hotel/cover-image`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: fd
        });
        setUploadingCover(false);
        if (res.ok) {
            loadHotel();
            toast.success("Cover image updated.");
        } else {
            const data = await res.json().catch(() => ({}));
            toast.error(data.error ?? "Failed to upload cover image");
        }
        e.target.value = "";
    }

    async function handlePaymentQrChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingPaymentQr(true);
        const fd = new FormData();
        fd.append("payment_qr_image", file);
        const res = await fetch(`${API_BASE}/api/hotel/payment-qr`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: fd
        });
        setUploadingPaymentQr(false);
        if (res.ok) {
            loadHotel();
            toast.success("Payment QR updated.");
        } else {
            const data = await res.json().catch(() => ({}));
            toast.error(data.error ?? "Failed to upload payment QR");
        }
        e.target.value = "";
    }

    async function handleSavePaymentMethod(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        const accountName =
            (form.elements.namedItem("payment_account_name") as HTMLInputElement)?.value?.trim() ||
            null;
        const accountNumber =
            (
                form.elements.namedItem("payment_account_number") as HTMLInputElement
            )?.value?.trim() || null;
        setSavingPaymentMethod(true);
        try {
            const res = await fetch(`${API_BASE}/api/hotel/profile`, {
                method: "PATCH",
                headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({
                    payment_account_name: accountName,
                    payment_account_number: accountNumber
                })
            });
            if (res.ok) {
                const updated = await res.json();
                setHotel((prev) => (prev ? { ...prev, ...updated } : prev));
                setEditingPaymentMethod(false);
                toast.success("Payment details saved.");
            } else {
                const data = await res.json().catch(() => ({}));
                toast.error(data.error ?? "Failed to update payment details");
            }
        } finally {
            setSavingPaymentMethod(false);
        }
    }

    async function handleAddPaymentMethod(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        const label =
            (form.elements.namedItem("new_label") as HTMLInputElement)?.value?.trim() || "Payment";
        const account_name =
            (form.elements.namedItem("new_account_name") as HTMLInputElement)?.value?.trim() ||
            null;
        const account_number =
            (form.elements.namedItem("new_account_number") as HTMLInputElement)?.value?.trim() ||
            null;
        const file = newMethodQrFile;
        setSavingPaymentMethod(true);
        try {
            const body = new FormData();
            body.append("label", label);
            if (account_name) body.append("account_name", account_name);
            if (account_number) body.append("account_number", account_number);
            if (file) body.append("qr_image", file);
            const res = await fetch(`${API_BASE}/api/hotel/payment-methods`, {
                method: "POST",
                headers: getAuthHeaders(),
                body
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(data.error ?? "Failed to add payment method");
                return;
            }
            await loadHotel();
            toast.success("Payment method added.");
            form.reset();
            setNewMethodQrFile(null);
            if (newMethodQrPreview) {
                URL.revokeObjectURL(newMethodQrPreview);
                setNewMethodQrPreview(null);
            }
        } finally {
            setSavingPaymentMethod(false);
        }
    }

    function handleNewMethodQrChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (newMethodQrPreview) {
            URL.revokeObjectURL(newMethodQrPreview);
            setNewMethodQrPreview(null);
        }
        if (file && file.type.startsWith("image/")) {
            setNewMethodQrFile(file);
            setNewMethodQrPreview(URL.createObjectURL(file));
        } else {
            setNewMethodQrFile(null);
        }
        e.target.value = "";
    }

    async function handleUpdatePaymentMethod(
        id: string,
        payload: { label: string; account_name: string; account_number: string },
        file?: File
    ) {
        setSavingPaymentMethod(true);
        try {
            const body = new FormData();
            body.append("label", payload.label);
            body.append("account_name", payload.account_name);
            body.append("account_number", payload.account_number);
            if (file) body.append("qr_image", file);
            const res = await fetch(`${API_BASE}/api/hotel/payment-methods/${id}`, {
                method: "PATCH",
                headers: getAuthHeaders(),
                body
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(data.error ?? "Failed to update");
                return;
            }
            await loadHotel();
            toast.success("Payment method updated.");
            setEditingMethodId(null);
            setEditMethodQrFile(null);
            if (editMethodQrPreview) {
                URL.revokeObjectURL(editMethodQrPreview);
                setEditMethodQrPreview(null);
            }
        } finally {
            setSavingPaymentMethod(false);
        }
    }

    function handleEditMethodQrChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (editMethodQrPreview) {
            URL.revokeObjectURL(editMethodQrPreview);
            setEditMethodQrPreview(null);
        }
        if (file && file.type.startsWith("image/")) {
            setEditMethodQrFile(file);
            setEditMethodQrPreview(URL.createObjectURL(file));
        } else {
            setEditMethodQrFile(null);
        }
        e.target.value = "";
    }

    async function handleDeletePaymentMethod(id: string) {
        setSavingPaymentMethod(true);
        try {
            const res = await fetch(`${API_BASE}/api/hotel/payment-methods/${id}`, {
                method: "DELETE",
                headers: getAuthHeaders()
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast.error(data.error ?? "Failed to delete");
                return;
            }
            await loadHotel();
            toast.success("Payment method removed.");
            setEditingMethodId(null);
        } finally {
            setSavingPaymentMethod(false);
        }
    }

    if (loading) {
        return (
            <main className="mx-auto min-h-screen max-w-3xl px-4 py-10">
                <p className="text-slate-600">Loading…</p>
            </main>
        );
    }

    if (!hotel) {
        return (
            <main className="mx-auto min-h-screen max-w-3xl px-4 py-10">
                <Link href="/hotel/dashboard" className="text-primary-600 hover:underline">
                    ← Dashboard
                </Link>
                <p className="mt-6 text-slate-600">No hotel linked.</p>
            </main>
        );
    }

    const coverUrl = hotel.cover_image_url ?? null;
    const profileUrl = hotel.profile_image_url ?? null;
    const hours = (hotel.opening_hours ?? {}) as OpeningHours;

    return (
        <main className="mx-auto min-h-screen max-w-4xl px-4 pb-16 pt-6">
            <header className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    Hotel Profile Settings
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Manage your hotel&apos;s public presence, branding, and payment information.
                </p>
            </header>

            <Tabs defaultValue="account" className="space-y-6">
                <TabsList className="h-auto w-full justify-start gap-0 rounded-none border-b border-border bg-transparent p-0">
                    <TabsTrigger
                        value="account"
                        className="rounded-none border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                    >
                        Account
                    </TabsTrigger>
                    <TabsTrigger
                        value="security"
                        className="rounded-none border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                    >
                        Security
                    </TabsTrigger>
                    <TabsTrigger
                        value="payments"
                        className="rounded-none border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                    >
                        Payments
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="account" className="mt-0 space-y-8">
                    <form id="profile-form" onSubmit={handleSaveProfile} className="space-y-8">
                        {/* Hotel identity (read-only) */}
                        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                            <h2 className="text-sm font-semibold text-foreground">Hotel details</h2>
                            <div className="mt-2">
                                <label className="mb-1 block text-sm font-semibold text-foreground">
                                    Account name
                                </label>
                                <div className="relative">
                                    <User2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        name="account_full_name"
                                        value={accountNameEdit}
                                        onChange={(e) => setAccountNameEdit(e.target.value)}
                                        className="rounded-lg border-border pl-9 text-foreground"
                                    />
                                </div>
                            </div>
                            <div className="mt-4">
                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-foreground">
                                        Hotel name
                                    </label>
                                    <div className="relative">
                                        <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            name="name"
                                            value={hotelNameEdit}
                                            onChange={(e) => setHotelNameEdit(e.target.value)}
                                            disabled={!canEditHotelName}
                                            title={
                                                !canEditHotelName
                                                    ? "Hotel name can only be edited once when your legal document has expired."
                                                    : undefined
                                            }
                                            className="rounded-lg border-border pl-9 text-foreground"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6">
                                <label className="mb-1 block text-sm font-semibold text-foreground">
                                    Contact email
                                </label>
                                <div className="relative">
                                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        name="contact_email"
                                        value={contactEmailEdit}
                                        onChange={(e) => setContactEmailEdit(e.target.value)}
                                        className="rounded-lg border-border pl-9 text-foreground"
                                    />
                                </div>
                            </div>

                            <div className="mt-6">
                                <label className="mb-1 block text-sm font-semibold text-foreground">
                                    Contact number
                                </label>
                                <div className="relative">
                                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        name="contact_phone"
                                        value={contactPhoneEdit}
                                        onChange={(e) => setContactPhoneEdit(e.target.value)}
                                        className="rounded-lg border-border pl-9 text-foreground"
                                        placeholder="—"
                                    />
                                </div>
                            </div>

                            <div className="mt-6">
                                <label className="mb-1 block text-sm font-semibold text-foreground">
                                    Address
                                </label>
                                <div className="relative">
                                    <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        name="address"
                                        value={addressEdit}
                                        onChange={(e) => setAddressEdit(e.target.value)}
                                        className="rounded-lg border-border pl-9 text-foreground"
                                    />
                                </div>
                            </div>

                            <div className="mt-6">
                                <div className="mb-1 block text-sm font-semibold text-foreground">
                                    Submitted legal document
                                </div>
                                <div className="rounded-lg border border-border bg-muted/20 p-3">
                                    {!hotel.business_permit_file ? (
                                        <p className="text-sm text-muted-foreground">
                                            No submitted legal document on file yet.
                                        </p>
                                    ) : permitLoading ? (
                                        <p className="text-sm text-muted-foreground">Loading document link…</p>
                                    ) : permitUrl ? (
                                        <div className="flex flex-wrap items-center gap-2">
                                            <a
                                                href={permitUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-muted"
                                            >
                                                <ExternalLink className="h-4 w-4" />
                                                View document
                                            </a>
                                            <button
                                                type="button"
                                                onClick={handleDownloadPermit}
                                                disabled={downloadingPermit}
                                                className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-muted"
                                            >
                                                <Download className="h-4 w-4" />
                                                {downloadingPermit ? "Downloading…" : "Download"}
                                            </button>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            Could not load your legal document.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Row: Profile Picture */}
                        <div className="grid gap-6 md:grid-cols-[1fr_2fr]">
                            <div>
                                <h2 className="text-sm font-semibold text-foreground">
                                    Profile Picture
                                </h2>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    JPG, GIF or PNG. Max size of 2MB.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-4">
                                <div className="relative shrink-0">
                                    <div className="flex h-24 w-24 overflow-hidden rounded-full border border-border bg-muted">
                                        {profileUrl ? (
                                            <img
                                                src={profileUrl}
                                                alt={hotel.name}
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-2xl text-muted-foreground">
                                                <Building2 className="h-10 w-10" />
                                            </div>
                                        )}
                                    </div>
                                    <label
                                        className="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow hover:bg-muted"
                                        aria-label="Edit profile picture"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={handleProfileImageChange}
                                            disabled={uploadingProfile}
                                        />
                                    </label>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Row: Gallery & Media */}
                        <div className="grid gap-6 md:grid-cols-[1fr_2fr]">
                            <div>
                                <h2 className="text-sm font-semibold text-foreground">
                                    Gallery & Media
                                </h2>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Upload high-resolution images for your main hotel profile page.
                                </p>
                            </div>
                            <div>
                                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Background Images
                                </p>
                                <div className="flex flex-wrap gap-3">
                                    {coverUrl && (
                                        <div className="relative h-28 w-40 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                                            <img
                                                src={coverUrl}
                                                alt="Cover"
                                                className="h-full w-full object-cover"
                                            />
                                            <button
                                                type="button"
                                                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-background/80 text-foreground hover:bg-background"
                                                aria-label="Remove image"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    )}
                                    <label className="flex h-28 w-40 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/30 text-muted-foreground transition hover:bg-muted/50">
                                        <Camera className="h-6 w-6" />
                                        <span className="text-xs font-medium">
                                            Upload new image
                                        </span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={handleCoverImageChange}
                                            disabled={uploadingCover}
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Row: Business Hours */}
                        <div className="grid gap-6 md:grid-cols-[1fr_2fr]">
                            <div>
                                <h2 className="text-sm font-semibold text-foreground">
                                    Business Hours
                                </h2>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Set the operational hours for front desk and amenities.
                                </p>
                            </div>
                            <div className="space-y-4">
                                <div className="flex flex-wrap gap-2">
                                    {DAYS.map((day) => (
                                        <button
                                            key={day}
                                            type="button"
                                            onClick={() => {
                                                setSelectedDays((prev) =>
                                                    prev.includes(day)
                                                        ? prev.filter((d) => d !== day)
                                                        : [...prev, day]
                                                );
                                            }}
                                            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                                                selectedDays.includes(day)
                                                    ? "bg-primary text-primary-foreground"
                                                    : "border border-border bg-background text-foreground hover:bg-muted"
                                            }`}
                                        >
                                            {DAY_PILL_LABELS[day]}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex flex-wrap gap-4">
                                    <div>
                                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                            Check-in From
                                        </label>
                                        <Input
                                            type="time"
                                            name="check_in_time"
                                            form="profile-form"
                                            value={checkInTime || (hotel?.check_in_time ?? "14:00")}
                                            onChange={(e) => setCheckInTime(e.target.value)}
                                            className="h-9 w-full max-w-[140px] rounded-lg border-border"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                            Check-out By
                                        </label>
                                        <Input
                                            type="time"
                                            name="check_out_time"
                                            form="profile-form"
                                            value={checkOutTime || (hotel?.check_out_time ?? "11:00")}
                                            onChange={(e) => setCheckOutTime(e.target.value)}
                                            className="h-9 w-full max-w-[140px] rounded-lg border-border"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Hidden fields for profile form (policies) so PATCH still works */}
                        <textarea
                            name="pets_policy"
                            form="profile-form"
                            className="hidden"
                            defaultValue={hotel.pets_policy ?? ""}
                        />
                        <textarea
                            name="smoking_policy"
                            form="profile-form"
                            className="hidden"
                            defaultValue={hotel.smoking_policy ?? ""}
                        />
                        <textarea
                            name="cancellation_policy"
                            form="profile-form"
                            className="hidden"
                            defaultValue={hotel.cancellation_policy ?? ""}
                        />

                        <div className="flex justify-end gap-3 border-t border-border pt-6">
                            {isAccountFormDirty && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDescriptionEdit(hotel?.description ?? "");
                                        setBioEdit(hotel?.bio ?? "");
                                        setSelectedDays(savedDaysFromHotel);
                                        setCheckInTime(hotel?.check_in_time ?? "14:00");
                                        setCheckOutTime(hotel?.check_out_time ?? "11:00");
                                        setHotelNameEdit(hotel?.name ?? "");
                                        setAccountNameEdit(hotel?.user_full_name ?? "");
                                        setContactEmailEdit(hotel?.contact_email ?? "");
                                        setContactPhoneEdit(hotel?.contact_phone ?? "");
                                        setAddressEdit(hotel?.address ?? "");
                                    }}
                                    className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                                >
                                    Cancel
                                </button>
                            )}
                            <button
                                type="submit"
                                disabled={saving}
                                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                            >
                                <Save className="h-4 w-4" />
                                {saving ? "Saving…" : "Save Changes"}
                            </button>
                        </div>
                    </form>
                </TabsContent>

                <TabsContent value="security" className="mt-0 space-y-6">
                    <section className="rounded-xl border border-border bg-card p-6">
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
                                        const res = await fetch(
                                            `${API_BASE}/api/auth/change-password`,
                                            {
                                                method: "POST",
                                                headers: {
                                                    ...getAuthHeaders(),
                                                    "Content-Type": "application/json"
                                                },
                                                body: JSON.stringify({
                                                    current_password: currentPassword,
                                                    new_password: newPassword
                                                })
                                            }
                                        );
                                        const data = await res.json().catch(() => ({}));
                                        if (res.ok) {
                                            toast.success("Password updated successfully.");
                                            setCurrentPassword("");
                                            setNewPassword("");
                                            setConfirmPassword("");
                                        } else {
                                            toast.error(data.error ?? "Failed to change password.");
                                        }
                                    } finally {
                                        setChangingPassword(false);
                                    }
                                }}
                                className="space-y-4"
                            >
                                <div>
                                    <label
                                        htmlFor="hotel-current-password"
                                        className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                                    >
                                        Current password
                                    </label>
                                    <Input
                                        id="hotel-current-password"
                                        type="password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        required
                                        className="mt-1 max-w-sm"
                                        autoComplete="current-password"
                                    />
                                </div>
                                <div>
                                    <label
                                        htmlFor="hotel-new-password"
                                        className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                                    >
                                        New password
                                    </label>
                                    <Input
                                        id="hotel-new-password"
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        required
                                        minLength={6}
                                        className="mt-1 max-w-sm"
                                        autoComplete="new-password"
                                    />
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        At least 6 characters.
                                    </p>
                                </div>
                                <div>
                                    <label
                                        htmlFor="hotel-confirm-password"
                                        className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                                    >
                                        Confirm new password
                                    </label>
                                    <Input
                                        id="hotel-confirm-password"
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                        className="mt-1 max-w-sm"
                                        autoComplete="new-password"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={changingPassword}
                                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium uppercase text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                                >
                                    {changingPassword ? "Updating…" : "Change password"}
                                </button>
                            </form>
                        </div>
                    </section>

                    <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="flex gap-3">
                                    <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
                                    <div>
                                        <p className="font-semibold text-destructive">
                                            Deactivate Account
                                        </p>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            Once you delete your account, there is no going back. Please
                                            be certain.
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
                                        className="text-sm font-medium text-destructive hover:underline"
                                    >
                                        Deactivate
                                    </button>
                                )}
                            </div>
                            {showDeactivateConfirm && (
                                <div className="border-t border-destructive/30 pt-4 space-y-3">
                                    <p className="text-sm text-foreground">
                                        Enter your current password to confirm account deletion.
                                    </p>
                                    <div>
                                        <label className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
                                            Current password
                                        </label>
                                        <Input
                                            type="password"
                                            value={deactivatePassword}
                                            onChange={(e) => setDeactivatePassword(e.target.value)}
                                            placeholder="Your password"
                                            className="max-w-xs"
                                            autoComplete="current-password"
                                            disabled={deactivating}
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (!deactivatePassword.trim()) {
                                                    toast.error("Password is required");
                                                    return;
                                                }
                                                setDeactivating(true);
                                                try {
                                                    const res = await fetch(`${API_BASE}/api/auth/delete-account`, {
                                                        method: "POST",
                                                        headers: {
                                                            ...getAuthHeaders(),
                                                            "Content-Type": "application/json",
                                                        },
                                                        body: JSON.stringify({
                                                            current_password: deactivatePassword,
                                                        }),
                                                    });
                                                    const data = res.status !== 204 ? await res.json().catch(() => ({})) : {};
                                                    if (!res.ok) {
                                                        toast.error(
                                                            (data as { error?: string }).error ??
                                                                "Failed to delete account"
                                                        );
                                                        return;
                                                    }
                                                    toast.success("Account deleted.");
                                                    clearClientAuth();
                                                    router.push("/login");
                                                } finally {
                                                    setDeactivating(false);
                                                }
                                            }}
                                            disabled={deactivating}
                                            className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
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
                                            className="rounded-lg border border-border px-4 py-2 text-sm"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="payments" className="mt-0 space-y-6">
                    <div className="grid gap-6 md:grid-cols-[1fr_2fr]">
                        <div>
                            <h2 className="text-sm font-semibold text-foreground">
                                Payment Methods
                            </h2>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Add multiple payment QR providers. Guests will choose one when
                                paying online.
                            </p>
                        </div>
                        <div className="space-y-4">
                            <div className="flex flex-wrap gap-4">
                                {(hotel.payment_methods ?? []).map((method) => (
                                    <div
                                        key={method.id}
                                        className="relative flex flex-col lg:flex-row overflow-hidden rounded-lg border border-border bg-card p-3 shadow-sm"
                                    >
                                        {editingMethodId === method.id ? (
                                            <div className="flex flex-1 flex-col lg:flex-row gap-3 p-1">
                                                <div className="flex aspect-square w-40 h-40 shrink-0 rounded-lg border border-border bg-muted/30 relative">
                                                    {editMethodQrPreview ? (
                                                        <img
                                                            src={editMethodQrPreview}
                                                            alt="New QR"
                                                            className="aspect-square h-full w-full object-contain"
                                                        />
                                                    ) : method.qr_image_url ? (
                                                        <img
                                                            src={method.qr_image_url}
                                                            alt={method.label}
                                                            className="aspect-square h-full w-full object-contain"
                                                        />
                                                    ) : (
                                                        <span className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                                                            No QR
                                                        </span>
                                                    )}
                                                    <label className="absolute bottom-2 right-2 cursor-pointer rounded border border-border bg-muted px-2 py-1.5 text-center text-xs font-medium transition hover:bg-muted/90">
                                                        <Pencil className="h-3.5 w-3.5" />
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            className="sr-only"
                                                            onChange={handleEditMethodQrChange}
                                                            aria-label="Replace QR code image"
                                                        />
                                                    </label>
                                                </div>
                                                <div className="flex flex-col gap-2 flex-1">
                                                    <Input
                                                        placeholder="Label (e.g. GCash)"
                                                        value={editDraft.label}
                                                        onChange={(e) =>
                                                            setEditDraft((p) => ({
                                                                ...p,
                                                                label: e.target.value
                                                            }))
                                                        }
                                                        className="h-9 text-xs"
                                                    />
                                                    <Input
                                                        placeholder="Account name"
                                                        value={editDraft.account_name}
                                                        onChange={(e) =>
                                                            setEditDraft((p) => ({
                                                                ...p,
                                                                account_name: e.target.value
                                                            }))
                                                        }
                                                        className="h-9 text-xs"
                                                    />
                                                    <Input
                                                        placeholder="Account number"
                                                        value={editDraft.account_number}
                                                        onChange={(e) =>
                                                            setEditDraft((p) => ({
                                                                ...p,
                                                                account_number: e.target.value
                                                            }))
                                                        }
                                                        className="h-9 text-xs"
                                                    />
                                                    <div className="flex gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                handleUpdatePaymentMethod(
                                                                    method.id,
                                                                    editDraft,
                                                                    editMethodQrFile ?? undefined
                                                                )
                                                            }
                                                            disabled={savingPaymentMethod}
                                                            className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
                                                        >
                                                            Save
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (editMethodQrPreview) {
                                                                    URL.revokeObjectURL(
                                                                        editMethodQrPreview
                                                                    );
                                                                    setEditMethodQrPreview(null);
                                                                }
                                                                setEditMethodQrFile(null);
                                                                setEditingMethodId(null);
                                                            }}
                                                            className="rounded border border-border px-2 py-1 text-xs"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-1">
                                                <p className="truncate text-center text-lg font-medium text-muted-foreground">
                                                    {method.label}
                                                </p>

                                                <div className="flex aspect-square w-40 h-40 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                                                    {method.qr_image_url ? (
                                                        <img
                                                            src={method.qr_image_url}
                                                            alt={method.label}
                                                            className="h-full w-full object-contain"
                                                        />
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">
                                                            No QR
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="mt-auto flex justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (editMethodQrPreview) {
                                                                URL.revokeObjectURL(
                                                                    editMethodQrPreview
                                                                );
                                                                setEditMethodQrPreview(null);
                                                            }
                                                            setEditMethodQrFile(null);
                                                            setEditingMethodId(method.id);
                                                            setEditDraft({
                                                                label: method.label,
                                                                account_name:
                                                                    method.account_name ?? "",
                                                                account_number:
                                                                    method.account_number ?? ""
                                                            });
                                                        }}
                                                        className="flex h-7 w-7 items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-muted"
                                                        aria-label="Edit"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setPaymentMethodDeleteId(method.id)
                                                        }
                                                        className="flex h-7 w-7 items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                        aria-label="Delete"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                <form
                                    onSubmit={handleAddPaymentMethod}
                                    className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm"
                                >
                                    <div className="space-y-3">
                                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                            New payment method
                                        </p>
                                        <label className="block text-sm font-medium text-foreground">
                                            Provider name
                                        </label>
                                        <Input
                                            name="new_label"
                                            placeholder="e.g. GCash, PayMaya"
                                            className="rounded-lg border-border"
                                            required
                                        />
                                        <label className="block text-sm font-medium text-foreground">
                                            Account name
                                        </label>
                                        <Input
                                            name="new_account_name"
                                            placeholder="e.g. Juan Dela Cruz"
                                            className="rounded-lg border-border"
                                        />
                                        <label className="block text-sm font-medium text-foreground">
                                            Account number
                                        </label>
                                        <Input
                                            name="new_account_number"
                                            placeholder="e.g. 09123456789"
                                            className="rounded-lg border-border"
                                        />
                                        <div>
                                            <label className="mb-1.5 block text-sm font-medium text-foreground">
                                                QR code image
                                            </label>
                                            <label className="flex aspect-square max-w-[180px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/30 transition hover:border-primary/50 hover:bg-muted/50">
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="sr-only"
                                                    onChange={handleNewMethodQrChange}
                                                    aria-label="Upload QR code image"
                                                />
                                                {newMethodQrPreview ? (
                                                    <span className="relative flex aspect-square w-full items-center justify-center bg-muted/20 p-2">
                                                        <img
                                                            src={newMethodQrPreview}
                                                            alt="QR preview"
                                                            className="aspect-square h-full w-full object-contain"
                                                        />
                                                    </span>
                                                ) : (
                                                    <>
                                                        <Plus className="mb-1 h-8 w-8 text-muted-foreground" />
                                                        <span className="text-sm text-muted-foreground">
                                                            Click or drop QR image
                                                        </span>
                                                        <span className="mt-0.5 text-xs text-muted-foreground">
                                                            PNG, JPG or WebP
                                                        </span>
                                                    </>
                                                )}
                                            </label>
                                            {newMethodQrFile && (
                                                <p
                                                    className="mt-1 truncate text-xs text-muted-foreground"
                                                    title={newMethodQrFile.name}
                                                >
                                                    {newMethodQrFile.name}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={savingPaymentMethod}
                                        className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                                    >
                                        {savingPaymentMethod ? "Adding…" : "Add Method"}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>

            <ConfirmDialog
                open={paymentMethodDeleteId !== null}
                onClose={() => !savingPaymentMethod && setPaymentMethodDeleteId(null)}
                title="Remove this payment method?"
                description="Guests will no longer see this provider when booking online. You can add it again later."
                confirmLabel="Remove"
                variant="destructive"
                confirmLoading={savingPaymentMethod && paymentMethodDeleteId !== null}
                onConfirm={() => {
                    const id = paymentMethodDeleteId;
                    if (!id) return;
                    void handleDeletePaymentMethod(id).finally(() => setPaymentMethodDeleteId(null));
                }}
            />
        </main>
    );
}
