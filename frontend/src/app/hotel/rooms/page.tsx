"use client";

import Link from "next/link";
import { Pencil, Play, Plus, Trash2, Star } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { HotelPendingVerificationNotice } from "@/components/HotelPendingVerificationNotice";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatNumberCompact } from "@/lib/format";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Hotel = {
    verification_status: string;
    business_permit_file?: string | null;
    permit_expires_at?: string | null;
};
type Room = {
    id: string;
    name: string;
    description?: string | null;
    room_type: string;
    base_price_night: string;
    hourly_rate: string | null;
    offer_hourly?: boolean;
    is_available?: boolean;
    hourly_available_hours?: number[] | null;
    capacity: number;
    amenities?: string[];
    bathroom_count?: number | null;
    bathroom_shared?: boolean | null;
    media?: { type: string; path: string }[];
    media_urls?: { type: string; url: string }[];
    featured?: boolean;
    pets_policy?: string | null;
    smoking_policy?: string | null;
    cancellation_policy?: string | null;
    custom_policies?: Array<{
        iconKey?: string | null;
        icon_key?: string | null;
        icon?: string | null;
        label?: string | null;
        value?: string | null;
    }> | null;
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

const ROOM_TYPES = ["Standard", "Deluxe", "Suite", "Family", "Other"];
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);
function formatHour12(h: number): string {
    const display = h % 12 || 12;
    const period = h < 12 ? "AM" : "PM";
    return `${display}:00 ${period}`;
}
const ACCOMMODATION_OPTIONS = [
    "Air-conditioned",
    "Fan",
    "WiFi",
    "TV",
    "Minibar",
    "Safe",
    "Balcony",
    "Sea view"
];

const MAX_MEDIA = 10;
const VIDEO_TYPES = ["video/mp4", "video/webm"];

const CUSTOM_POLICY_ICON_OPTIONS = [
    { key: "shield", label: "Shield" },
    { key: "wifi", label: "WiFi" },
    { key: "waves", label: "Waves" },
    { key: "dumbbell", label: "Dumbbell" },
    { key: "car", label: "Car" },
    { key: "utensils_crossed", label: "Utensils (crossed)" },
    { key: "snowflake", label: "Snowflake" },
    { key: "circle_dot", label: "Circle Dot" }
] as const;

function AddFormFileThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
    const [url, setUrl] = useState<string | null>(null);
    const isVideo = file.type.startsWith("video/");
    useEffect(() => {
        const u = URL.createObjectURL(file);
        setUrl(u);
        return () => URL.revokeObjectURL(u);
    }, [file]);
    return (
        <div className="relative inline-block">
            <div className="h-20 w-20 overflow-hidden rounded-lg border border-input bg-muted flex items-center justify-center">
                {url ? (
                    isVideo ? (
                        <video src={url} className="h-full w-full object-cover" muted playsInline />
                    ) : (
                        <img src={url} alt="" className="h-full w-full object-cover" />
                    )
                ) : (
                    <span className="text-[10px] text-muted-foreground">…</span>
                )}
            </div>
            <Button
                type="button"
                variant="destructive"
                size="icon-xs"
                onClick={onRemove}
                className="absolute -right-1 -top-1 h-5 w-5 rounded-full"
                aria-label="Remove"
            >
                ×
            </Button>
        </div>
    );
}

export default function HotelRoomsPage() {
    const [hotel, setHotel] = useState<Hotel | null>(null);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [addFormFiles, setAddFormFiles] = useState<File[]>([]);
    const addFormFilesRef = useRef<File[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [page, setPage] = useState(1);

    const setAddFormFilesAndRef = useCallback((arg: File[] | React.SetStateAction<File[]>) => {
        setAddFormFiles((prev) => {
            const next = typeof arg === "function" ? arg(prev) : arg;
            addFormFilesRef.current = next;
            return next;
        });
    }, []);

    useEffect(() => {
        addFormFilesRef.current = addFormFiles;
    }, [addFormFiles]);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [uploadingMedia, setUploadingMedia] = useState<string | null>(null);
    const [deleteRoomConfirmId, setDeleteRoomConfirmId] = useState<string | null>(null);
    const [removeMediaConfirm, setRemoveMediaConfirm] = useState<{
        roomId: string;
        path: string;
    } | null>(null);

    const loadRooms = useCallback(async () => {
        const res = await fetch(`${API_BASE}/api/hotel/rooms`, { headers: getAuthHeaders() });
        if (res.ok) setRooms(await res.json());
    }, []);

    useEffect(() => {
        const token = localStorage.getItem("token");
        const supabaseToken = localStorage.getItem("supabase_access_token");
        if (!token) return;

        async function load() {
            const headers: HeadersInit = {
                Authorization: `Bearer ${token}`,
                ...(supabaseToken ? { "x-supabase-access-token": supabaseToken } : {})
            };
            const hotelRes = await fetch(`${API_BASE}/api/me/hotel`, { headers });
            if (hotelRes.ok) {
                const h = await hotelRes.json();
                setHotel(h);
                if (h.verification_status === "verified") {
                    const roomsRes = await fetch(`${API_BASE}/api/hotel/rooms`, { headers });
                    if (roomsRes.ok) setRooms(await roomsRes.json());
                }
            }
            setLoading(false);
        }
        load();
    }, []);

    const isPermitExpired =
        !!hotel?.permit_expires_at && new Date(hotel.permit_expires_at) <= new Date();
    const isVerified = hotel?.verification_status === "verified" && !isPermitExpired;
    const perPage = 3;
    const totalPages = Math.max(1, Math.ceil(rooms.length / perPage));
    const safePage = Math.min(page, totalPages);
    const startIdx = (safePage - 1) * perPage;
    const endIdx = Math.min(startIdx + perPage, rooms.length);
    const pagedRooms = rooms.slice(startIdx, endIdx);

    useEffect(() => {
        if (page !== safePage) setPage(safePage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rooms.length, totalPages]);

    async function handleCreateRoom(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setSaving(true);
        const form = e.currentTarget;
        const formData = new FormData(form);
        const offerHourly = formData.get("offer_hourly") === "on";
        const amenities: string[] = [];
        ACCOMMODATION_OPTIONS.forEach((opt) => {
            if (formData.get(`amenity_${opt.replace(/\s+/g, "_")}`) === "on") amenities.push(opt);
        });
        const customJson = formData.get("custom_amenities_json");
        const customArr = (() => {
            try {
                return customJson ? (JSON.parse(customJson as string) as string[]) : [];
            } catch {
                return [];
            }
        })();
        const hourlyJson = formData.get("hourly_available_hours_json");
        const hourlyAvailableHours = (() => {
            try {
                return hourlyJson ? (JSON.parse(hourlyJson as string) as number[]) : undefined;
            } catch {
                return undefined;
            }
        })();
        const customPoliciesJson = formData.get("custom_policies_json");
        const customPoliciesArr = (() => {
            try {
                return customPoliciesJson
                    ? (JSON.parse(customPoliciesJson as string) as unknown[])
                    : [];
            } catch {
                return [];
            }
        })();
        const body = {
            name: (formData.get("name") as string).trim(),
            room_type: formData.get("room_type") as string,
            base_price_night: Number(formData.get("base_price_night")),
            capacity: Number(formData.get("capacity")),
            description: (formData.get("description") as string).trim() || null,
            offer_hourly: offerHourly,
            hourly_rate:
                offerHourly && (formData.get("hourly_rate") as string).trim()
                    ? Number(formData.get("hourly_rate"))
                    : null,
            hourly_available_hours:
                offerHourly && Array.isArray(hourlyAvailableHours) ? hourlyAvailableHours : null,
            bathroom_count: (formData.get("bathroom_count") as string).trim()
                ? Number(formData.get("bathroom_count"))
                : null,
            bathroom_shared: (() => {
                const v = formData.get("bathroom_shared");
                if (v === "private") return false;
                if (v === "shared") return true;
                return null;
            })(),
            amenities: [...amenities, ...customArr],
            media: [],
            featured: formData.get("featured") === "on",
            pets_policy: (formData.get("pets_policy") as string)?.trim() || null,
            smoking_policy: (formData.get("smoking_policy") as string)?.trim() || null,
            cancellation_policy: (formData.get("cancellation_policy") as string)?.trim() || null,
            custom_policies: customPoliciesArr
        };
        const res = await fetch(`${API_BASE}/api/hotel/rooms`, {
            method: "POST",
            headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            setSaving(false);
            const data = await res.json().catch(() => ({}));
            toast.error(data.error ?? "Failed to add room");
            return;
        }
        const created = await res.json();
        const filesFromForm = formData.getAll("media_files") as File[];
        const filesFromState = addFormFilesRef.current;
        const files = (filesFromState?.length > 0 ? filesFromState : filesFromForm) ?? [];
        const validFiles = Array.from(files).filter((f) => f && f.size > 0);
        let videoCount = 0;
        for (const file of validFiles) {
            if (videoCount >= 1 && file.type?.startsWith("video/")) continue;
            const fd = new FormData();
            fd.append("media", file);
            const up = await fetch(`${API_BASE}/api/hotel/rooms/${created.id}/media`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: fd
            });
            if (!up.ok) {
                const data = await up.json().catch(() => ({}));
                setSaving(false);
                toast.error(data.error ?? "Failed to upload image or video");
                return;
            }
            if (file.type?.startsWith("video/")) videoCount++;
        }
        setSaving(false);
        await loadRooms();
        setAddFormFiles([]);
        addFormFilesRef.current = [];
        setShowAddForm(false);
        form.reset();
        toast.success("Room created.");
    }

    async function handleUpdateRoom(e: React.FormEvent<HTMLFormElement>, roomId: string) {
        e.preventDefault();
        setSaving(true);
        const form = e.currentTarget;
        const formData = new FormData(form);
        const offerHourly = formData.get("offer_hourly") === "on";
        const amenities: string[] = [];
        ACCOMMODATION_OPTIONS.forEach((opt) => {
            if (formData.get(`amenity_${opt.replace(/\s+/g, "_")}`) === "on") amenities.push(opt);
        });
        const customJson = formData.get("custom_amenities_json");
        const customArr = (() => {
            try {
                return customJson ? (JSON.parse(customJson as string) as string[]) : [];
            } catch {
                return [];
            }
        })();
        const hourlyJson = formData.get("hourly_available_hours_json");
        const hourlyAvailableHours = (() => {
            try {
                return hourlyJson ? (JSON.parse(hourlyJson as string) as number[]) : undefined;
            } catch {
                return undefined;
            }
        })();
        const customPoliciesJson = formData.get("custom_policies_json");
        const customPoliciesArr = (() => {
            try {
                return customPoliciesJson
                    ? (JSON.parse(customPoliciesJson as string) as unknown[])
                    : [];
            } catch {
                return [];
            }
        })();
        const body = {
            name: (formData.get("name") as string).trim(),
            room_type: formData.get("room_type") as string,
            base_price_night: Number(formData.get("base_price_night")),
            capacity: Number(formData.get("capacity")),
            description: (formData.get("description") as string).trim() || null,
            offer_hourly: offerHourly,
            hourly_rate:
                offerHourly && (formData.get("hourly_rate") as string).trim()
                    ? Number(formData.get("hourly_rate"))
                    : null,
            hourly_available_hours:
                offerHourly && Array.isArray(hourlyAvailableHours) ? hourlyAvailableHours : null,
            bathroom_count: (formData.get("bathroom_count") as string).trim()
                ? Number(formData.get("bathroom_count"))
                : null,
            bathroom_shared: (() => {
                const v = formData.get("bathroom_shared");
                if (v === "private") return false;
                if (v === "shared") return true;
                return null;
            })(),
            amenities: [...amenities, ...customArr],
            featured: formData.get("featured") === "on",
            pets_policy: (formData.get("pets_policy") as string)?.trim() || null,
            smoking_policy: (formData.get("smoking_policy") as string)?.trim() || null,
            cancellation_policy: (formData.get("cancellation_policy") as string)?.trim() || null,
            custom_policies: customPoliciesArr
        };
        const res = await fetch(`${API_BASE}/api/hotel/rooms/${roomId}`, {
            method: "PATCH",
            headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        setSaving(false);
        if (res.ok) {
            await loadRooms();
            setEditingId(null);
            toast.success("Room updated.");
        } else {
            const data = await res.json().catch(() => ({}));
            toast.error(data.error ?? "Failed to update room");
        }
    }

    async function handleRoomMediaUpload(roomId: string, files: FileList | null) {
        if (!files?.length) return;
        const room = rooms.find((r) => r.id === roomId);
        const hasExistingVideo = room?.media?.some((m) => m.type === "video");
        const selectedFiles = Array.from(files);
        const hasNewVideo = selectedFiles.some((f) => f.type.startsWith("video/"));

        // If room already has a video and user is uploading a video, remove the old one first (replace)
        if (hasExistingVideo && hasNewVideo) {
            const existingVideo = room!.media!.find((m) => m.type === "video");
            if (existingVideo) {
                setUploadingMedia(roomId);
                const nextMedia = room!.media!.filter((m) => m.path !== existingVideo.path);
                const res = await fetch(`${API_BASE}/api/hotel/rooms/${roomId}`, {
                    method: "PATCH",
                    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                    body: JSON.stringify({ media: nextMedia })
                });
                if (!res.ok) {
                    setUploadingMedia(null);
                    const data = await res.json().catch(() => ({}));
                    toast.error(data.error ?? "Failed to remove existing video");
                    return;
                }
                await loadRooms();
            }
        }

        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            setUploadingMedia(roomId);
            const fd = new FormData();
            fd.append("media", file);
            const res = await fetch(`${API_BASE}/api/hotel/rooms/${roomId}/media`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: fd
            });
            setUploadingMedia(null);
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast.error(data.error ?? "Failed to upload");
                return;
            }
            await loadRooms();
        }
        toast.success("Media uploaded.");
    }

    async function handleRemoveRoomMedia(roomId: string, pathToRemove: string) {
        const room = rooms.find((r) => r.id === roomId);
        if (!room?.media) return;
        const nextMedia = room.media.filter((m) => m.path !== pathToRemove);
        const res = await fetch(`${API_BASE}/api/hotel/rooms/${roomId}`, {
            method: "PATCH",
            headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ media: nextMedia })
        });
        if (res.ok) {
            await loadRooms();
            toast.success("Media removed.");
        } else {
            const data = await res.json().catch(() => ({}));
            toast.error(data.error ?? "Failed to remove");
        }
    }

    async function handleDeleteRoom(roomId: string) {
        setDeletingId(roomId);
        const res = await fetch(`${API_BASE}/api/hotel/rooms/${roomId}`, {
            method: "DELETE",
            headers: getAuthHeaders()
        });
        setDeletingId(null);
        if (res.ok) {
            await loadRooms();
            toast.success("Room deleted.");
        } else {
            const data = await res.json().catch(() => ({}));
            toast.error(data.error ?? "Failed to delete room");
        }
    }

    async function handleToggleRoomAvailability(roomId: string, nextAvailable: boolean) {
        // optimistic update
        setRooms((prev) =>
            prev.map((r) => (r.id === roomId ? { ...r, is_available: nextAvailable } : r))
        );
        const res = await fetch(`${API_BASE}/api/hotel/rooms/${roomId}`, {
            method: "PATCH",
            headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ is_available: nextAvailable })
        });
        if (!res.ok) {
            // rollback
            setRooms((prev) =>
                prev.map((r) => (r.id === roomId ? { ...r, is_available: !nextAvailable } : r))
            );
            const data = await res.json().catch(() => ({}));
            toast.error(data.error ?? "Failed to update availability");
            return;
        }
        await loadRooms();
    }

    async function handleToggleRoomFeatured(roomId: string, nextFeatured: boolean) {
        // optimistic update
        setRooms((prev) =>
            prev.map((r) => (r.id === roomId ? { ...r, featured: nextFeatured } : r))
        );
        const res = await fetch(`${API_BASE}/api/hotel/rooms/${roomId}`, {
            method: "PATCH",
            headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ featured: nextFeatured })
        });
        if (!res.ok) {
            // rollback
            setRooms((prev) =>
                prev.map((r) => (r.id === roomId ? { ...r, featured: !nextFeatured } : r))
            );
            const data = await res.json().catch(() => ({}));
            toast.error(data.error ?? "Failed to update featured status");
            return;
        }
        await loadRooms();
    }

    function RoomForm({
        room,
        onSubmit,
        onCancel,
        submitLabel,
        addFormFiles,
        setAddFormFiles
    }: {
        room?: Room | null;
        onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
        onCancel: () => void;
        submitLabel: string;
        addFormFiles?: File[];
        setAddFormFiles?: React.Dispatch<React.SetStateAction<File[]>>;
    }) {
        const [offerHourly, setOfferHourly] = useState(!!room?.offer_hourly);
        const [hourlyAvailableHours, setHourlyAvailableHours] = useState<number[]>(
            () => room?.hourly_available_hours ?? []
        );
        const [customAmenities, setCustomAmenities] = useState<string[]>(
            () => room?.amenities?.filter((a) => !ACCOMMODATION_OPTIONS.includes(a)) ?? []
        );
        const [customInput, setCustomInput] = useState("");
        const [customPolicies, setCustomPolicies] = useState<
            Array<{ iconKey: string; label: string; value: string }>
        >(() => {
            const raw = room?.custom_policies;
            if (!raw || !Array.isArray(raw)) return [];
            return raw
                .map((p: any) => ({
                    iconKey: String(p?.iconKey ?? p?.icon_key ?? p?.icon ?? "shield") || "shield",
                    label: String(p?.label ?? ""),
                    value: String(p?.value ?? "")
                }))
                .filter((p) => p.label.trim() && p.value.trim());
        });
        const mediaCount = room?.media?.length ?? 0;

        const toggleHour = (h: number) => {
            setHourlyAvailableHours((prev) =>
                prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h].sort((a, b) => a - b)
            );
        };

        return (
            <form onSubmit={onSubmit}>
                <Card className="space-y-4 p-4">
                    <CardContent className="flex flex-col gap-4 p-0">
                        <div className="space-y-2">
                            <Label htmlFor="room-name">Room name</Label>
                            <Input
                                id="room-name"
                                type="text"
                                name="name"
                                required
                                defaultValue={room?.name}
                                placeholder="e.g. Ocean View Double"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="room-type">Room type</Label>
                            <select
                                id="room-type"
                                name="room_type"
                                required
                                defaultValue={room?.room_type ?? ""}
                                className={cn(
                                    "flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                                )}
                            >
                                <option value="">Select type</option>
                                {ROOM_TYPES.map((t) => (
                                    <option key={t} value={t}>
                                        {t}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="room-description">Description</Label>
                            <Textarea
                                id="room-description"
                                name="description"
                                rows={3}
                                defaultValue={room?.description ?? ""}
                                placeholder="Describe the room, view, and features..."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="flex cursor-pointer items-center gap-2 font-normal">
                                <input
                                    type="checkbox"
                                    name="featured"
                                    defaultChecked={room?.featured === true}
                                    className="size-4 rounded border-input"
                                />
                                Featured room
                            </Label>
                        </div>
                        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                            <p className="text-sm font-medium text-foreground">Room policies</p>
                            <p className="text-xs text-muted-foreground">
                                Optional. Shown on room view only when set.
                            </p>
                            <div className="grid gap-3 sm:grid-cols-1">
                                <div className="space-y-1">
                                    <Label htmlFor="room-pets-policy" className="text-xs">
                                        Pets
                                    </Label>
                                    <Textarea
                                        id="room-pets-policy"
                                        name="pets_policy"
                                        rows={2}
                                        defaultValue={room?.pets_policy ?? ""}
                                        placeholder="e.g. Small pets allowed"
                                        className="resize-none"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="room-smoking-policy" className="text-xs">
                                        Smoking
                                    </Label>
                                    <Textarea
                                        id="room-smoking-policy"
                                        name="smoking_policy"
                                        rows={2}
                                        defaultValue={room?.smoking_policy ?? ""}
                                        placeholder="e.g. Smoke-free"
                                        className="resize-none"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="room-cancellation-policy" className="text-xs">
                                        Cancellation
                                    </Label>
                                    <Textarea
                                        id="room-cancellation-policy"
                                        name="cancellation_policy"
                                        rows={2}
                                        defaultValue={room?.cancellation_policy ?? ""}
                                        placeholder="e.g. Free cancellation 48h before"
                                        className="resize-none"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-medium text-foreground">
                                        Custom policies
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Add extra policies beyond the defaults. Icon is
                                        system-controlled.
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() =>
                                        setCustomPolicies((prev) => [
                                            ...prev,
                                            { iconKey: "shield", label: "", value: "" }
                                        ])
                                    }
                                >
                                    + Add
                                </Button>
                            </div>

                            {customPolicies.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                    No custom policies added.
                                </p>
                            ) : (
                                <div className="space-y-4">
                                    {customPolicies.map((p, idx) => (
                                        <div
                                            key={idx}
                                            className="rounded-lg border border-border bg-background p-3"
                                        >
                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                                <div className="sm:col-span-1">
                                                    <Label
                                                        htmlFor={`custom-policy-icon-${idx}`}
                                                        className="text-xs"
                                                    >
                                                        Icon
                                                    </Label>
                                                    <select
                                                        id={`custom-policy-icon-${idx}`}
                                                        value={p.iconKey}
                                                        onChange={(e) => {
                                                            const v = e.target.value;
                                                            setCustomPolicies((prev) =>
                                                                prev.map((x, i) =>
                                                                    i === idx
                                                                        ? { ...x, iconKey: v }
                                                                        : x
                                                                )
                                                            );
                                                        }}
                                                        className="mt-1 w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm"
                                                    >
                                                        {CUSTOM_POLICY_ICON_OPTIONS.map((opt) => (
                                                            <option key={opt.key} value={opt.key}>
                                                                {opt.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="sm:col-span-1">
                                                    <Label
                                                        htmlFor={`custom-policy-label-${idx}`}
                                                        className="text-xs"
                                                    >
                                                        Label
                                                    </Label>
                                                    <Input
                                                        id={`custom-policy-label-${idx}`}
                                                        value={p.label}
                                                        onChange={(e) => {
                                                            const v = e.target.value;
                                                            setCustomPolicies((prev) =>
                                                                prev.map((x, i) =>
                                                                    i === idx
                                                                        ? { ...x, label: v }
                                                                        : x
                                                                )
                                                            );
                                                        }}
                                                        placeholder="e.g. Quiet hours"
                                                        className="mt-1"
                                                    />
                                                </div>
                                                <div className="sm:col-span-1 flex items-end">
                                                    <Button
                                                        type="button"
                                                        variant="destructive"
                                                        size="icon-xs"
                                                        className="h-8 w-8"
                                                        onClick={() =>
                                                            setCustomPolicies((prev) =>
                                                                prev.filter((_, i) => i !== idx)
                                                            )
                                                        }
                                                        aria-label="Remove custom policy"
                                                    >
                                                        ×
                                                    </Button>
                                                </div>
                                            </div>

                                            <div className="mt-3">
                                                <Label
                                                    htmlFor={`custom-policy-value-${idx}`}
                                                    className="text-xs"
                                                >
                                                    Policy text
                                                </Label>
                                                <Textarea
                                                    id={`custom-policy-value-${idx}`}
                                                    rows={2}
                                                    value={p.value}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        setCustomPolicies((prev) =>
                                                            prev.map((x, i) =>
                                                                i === idx ? { ...x, value: v } : x
                                                            )
                                                        );
                                                    }}
                                                    placeholder="Enter policy details..."
                                                    className="mt-1 resize-none"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <input
                                type="hidden"
                                name="custom_policies_json"
                                value={JSON.stringify(customPolicies)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="base-price">Price per night (₱)</Label>
                            <Input
                                id="base-price"
                                type="number"
                                name="base_price_night"
                                required
                                min={0}
                                step={0.01}
                                defaultValue={room?.base_price_night ?? ""}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="flex cursor-pointer items-center gap-2">
                                <input
                                    type="checkbox"
                                    name="offer_hourly"
                                    checked={offerHourly}
                                    onChange={(e) => {
                                        setOfferHourly(e.target.checked);
                                        if (!e.target.checked) setHourlyAvailableHours([]);
                                    }}
                                    className="size-4 rounded border-input"
                                />
                                Offer hourly / micro-stay pricing
                            </Label>
                            {offerHourly && (
                                <div className="space-y-3 pl-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="hourly-rate">Hourly rate (₱)</Label>
                                        <Input
                                            id="hourly-rate"
                                            type="number"
                                            name="hourly_rate"
                                            min={0}
                                            step={0.01}
                                            defaultValue={room?.hourly_rate ?? ""}
                                            placeholder="e.g. 100"
                                            className="max-w-[140px]"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Hours available for hourly booking</Label>
                                        <p className="text-xs text-muted-foreground">
                                            Select which hours of the day guests can book (12:00 AM
                                            – 11:00 PM).
                                        </p>
                                        <input
                                            type="hidden"
                                            name="hourly_available_hours_json"
                                            value={JSON.stringify(hourlyAvailableHours)}
                                        />
                                        <div className="flex flex-wrap gap-2">
                                            {HOUR_OPTIONS.map((h) => (
                                                <label
                                                    key={h}
                                                    className={cn(
                                                        "cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                                                        hourlyAvailableHours.includes(h)
                                                            ? "border-primary bg-primary/10 text-primary-foreground"
                                                            : "border-input bg-muted/30 text-muted-foreground hover:bg-muted/50"
                                                    )}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only"
                                                        checked={hourlyAvailableHours.includes(h)}
                                                        onChange={() => toggleHour(h)}
                                                    />
                                                    {formatHour12(h)}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="capacity">Capacity (guests)</Label>
                            <Input
                                id="capacity"
                                type="number"
                                name="capacity"
                                required
                                min={1}
                                defaultValue={room?.capacity ?? ""}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bathroom-count">Bathrooms</Label>
                            <Input
                                id="bathroom-count"
                                type="number"
                                name="bathroom_count"
                                min={0}
                                defaultValue={room?.bathroom_count ?? ""}
                                placeholder="0"
                                className="max-w-[100px]"
                            />
                            <div className="mt-2">
                                <Label className="text-muted-foreground">Bathroom type</Label>
                                <div className="mt-1 flex flex-wrap gap-4">
                                    <Label className="flex cursor-pointer items-center gap-2 font-normal">
                                        <input
                                            type="radio"
                                            name="bathroom_shared"
                                            value="private"
                                            defaultChecked={room?.bathroom_shared !== true}
                                            className="size-4"
                                        />
                                        Private
                                    </Label>
                                    <Label className="flex cursor-pointer items-center gap-2 font-normal">
                                        <input
                                            type="radio"
                                            name="bathroom_shared"
                                            value="shared"
                                            defaultChecked={room?.bathroom_shared === true}
                                            className="size-4"
                                        />
                                        Shared
                                    </Label>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Room Amenities</Label>
                            <p className="text-xs text-muted-foreground">
                                e.g. Air-conditioned, Fan, WiFi
                            </p>
                            <div className="flex flex-wrap gap-3">
                                {ACCOMMODATION_OPTIONS.map((opt) => (
                                    <Label
                                        key={opt}
                                        className="flex cursor-pointer items-center gap-1.5 font-normal"
                                    >
                                        <input
                                            type="checkbox"
                                            name={`amenity_${opt.replace(/\s+/g, "_")}`}
                                            defaultChecked={room?.amenities?.includes(opt)}
                                            className="size-4 rounded border-input"
                                        />
                                        {opt}
                                    </Label>
                                ))}
                            </div>
                            <div className="mt-3">
                                <Label htmlFor="custom-accommodation">
                                    Add your own accommodation
                                </Label>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <Input
                                        id="custom-accommodation"
                                        type="text"
                                        value={customInput}
                                        onChange={(e) => setCustomInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                const v = customInput.trim();
                                                if (
                                                    v &&
                                                    !customAmenities.includes(v) &&
                                                    !ACCOMMODATION_OPTIONS.includes(v)
                                                ) {
                                                    setCustomAmenities((prev) => [...prev, v]);
                                                    setCustomInput("");
                                                }
                                            }
                                        }}
                                        placeholder="e.g. Kitchenette, Bathtub"
                                        className="max-w-[200px]"
                                    />
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => {
                                            const v = customInput.trim();
                                            if (
                                                v &&
                                                !customAmenities.includes(v) &&
                                                !ACCOMMODATION_OPTIONS.includes(v)
                                            ) {
                                                setCustomAmenities((prev) => [...prev, v]);
                                                setCustomInput("");
                                            }
                                        }}
                                    >
                                        Add
                                    </Button>
                                </div>
                                {customAmenities.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {customAmenities.map((item) => (
                                            <span
                                                key={item}
                                                className="inline-flex h-5 items-center gap-1 overflow-hidden rounded-full border border-transparent bg-secondary px-2 py-0.5 text-xs font-medium"
                                            >
                                                {item}
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon-xs"
                                                    className="h-4 w-4 rounded-full p-0 hover:bg-muted"
                                                    onClick={() =>
                                                        setCustomAmenities((prev) =>
                                                            prev.filter((x) => x !== item)
                                                        )
                                                    }
                                                    aria-label={`Remove ${item}`}
                                                >
                                                    ×
                                                </Button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <input
                                    type="hidden"
                                    name="custom_amenities_json"
                                    value={JSON.stringify(customAmenities)}
                                />
                            </div>
                        </div>
                        {!room ? (
                            <div className="space-y-2">
                                <Label>Images / video (max 10, 1 video up to 100MB)</Label>
                                {typeof setAddFormFiles === "function" &&
                                Array.isArray(addFormFiles) ? (
                                    <>
                                        <input
                                            type="file"
                                            accept="image/*,video/mp4,video/webm"
                                            multiple
                                            className="block w-full text-sm text-foreground file:mr-2 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground file:cursor-pointer hover:file:bg-primary/90"
                                            onChange={(e) => {
                                                const chosen = e.target.files;
                                                if (!chosen?.length) return;
                                                setAddFormFiles((prev) => {
                                                    let videoCount = prev.filter((f) =>
                                                        f.type.startsWith("video/")
                                                    ).length;
                                                    const next = [...prev];
                                                    for (
                                                        let i = 0;
                                                        i < chosen.length &&
                                                        next.length < MAX_MEDIA;
                                                        i++
                                                    ) {
                                                        const f = chosen[i];
                                                        if (f.type.startsWith("video/")) {
                                                            if (videoCount >= 1) continue;
                                                            videoCount++;
                                                        }
                                                        next.push(f);
                                                    }
                                                    return next;
                                                });
                                                e.target.value = "";
                                            }}
                                        />
                                        {addFormFiles.length > 0 ? (
                                            <>
                                                <p className="text-xs font-medium text-muted-foreground">
                                                    {addFormFiles.length} file
                                                    {addFormFiles.length !== 1 ? "s" : ""} selected
                                                </p>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {addFormFiles.map((file, idx) => (
                                                        <AddFormFileThumb
                                                            key={`${file.name}-${file.size}-${idx}`}
                                                            file={file}
                                                            onRemove={() =>
                                                                setAddFormFiles((prev) =>
                                                                    prev.filter((_, i) => i !== idx)
                                                                )
                                                            }
                                                        />
                                                    ))}
                                                </div>
                                            </>
                                        ) : null}
                                    </>
                                ) : (
                                    <input
                                        type="file"
                                        name="media_files"
                                        accept="image/*,video/mp4,video/webm"
                                        multiple
                                        className="block w-full text-sm text-foreground file:mr-2 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground file:cursor-pointer"
                                    />
                                )}
                                <p className="text-xs text-muted-foreground">
                                    Videos up to 100MB. You can add more after creating the room.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Label>Room images / video</Label>
                                <p className="text-xs text-muted-foreground">
                                    Max 10 items, 1 video (up to 100MB). {mediaCount} uploaded.
                                    {room.media?.some((m) => m.type === "video") &&
                                        " To replace the video, choose a new video file."}
                                </p>
                                {room.media_urls && room.media_urls.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {room.media_urls.map((item, idx) => (
                                            <div
                                                key={`${room.media?.[idx]?.path ?? idx}-${room.media?.length ?? 0}`}
                                                className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-input bg-muted"
                                            >
                                                {item.type === "video" ? (
                                                    <>
                                                        <video
                                                            src={item.url}
                                                            className="h-full w-full object-cover"
                                                            muted
                                                            playsInline
                                                            preload="metadata"
                                                            crossOrigin="anonymous"
                                                        />
                                                        <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                                                            <Play
                                                                className="h-8 w-8 text-white drop-shadow"
                                                                fill="currentColor"
                                                            />
                                                        </span>
                                                        <span className="absolute bottom-0 left-0 right-0 bg-black/60 py-0.5 text-center text-[10px] font-medium text-white">
                                                            Video
                                                        </span>
                                                    </>
                                                ) : (
                                                    <img
                                                        src={item.url}
                                                        alt=""
                                                        className="h-full w-full object-cover"
                                                        loading="lazy"
                                                    />
                                                )}
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    size="icon-xs"
                                                    className="absolute -right-1 -top-1 h-5 w-5 rounded-full"
                                                    onClick={() => {
                                                        const path = room.media?.[idx]?.path;
                                                        if (path)
                                                            setRemoveMediaConfirm({
                                                                roomId: room.id,
                                                                path
                                                            });
                                                    }}
                                                    aria-label="Remove"
                                                >
                                                    ×
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {mediaCount < MAX_MEDIA && (
                                    <Label className="mt-2 inline-block cursor-pointer">
                                        <span
                                            className={cn(
                                                "inline-flex h-7 items-center rounded-lg border border-input bg-secondary px-2.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
                                            )}
                                        >
                                            {uploadingMedia === room.id
                                                ? "Uploading…"
                                                : "Add image or video"}
                                        </span>
                                        <Input
                                            type="file"
                                            accept="image/*,video/mp4,video/webm"
                                            multiple
                                            className="hidden"
                                            disabled={uploadingMedia !== null}
                                            onChange={(e) => {
                                                const files = e.target.files;
                                                if (files?.length) {
                                                    handleRoomMediaUpload(room.id, files);
                                                    e.target.value = "";
                                                }
                                            }}
                                        />
                                    </Label>
                                )}
                            </div>
                        )}
                        <div className="flex gap-2 pt-2">
                            <Button type="submit" disabled={saving}>
                                {saving ? "Saving…" : submitLabel}
                            </Button>
                            <Button type="button" variant="outline" onClick={onCancel}>
                                Cancel
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </form>
        );
    }

    return (
        <main className="mx-auto min-h-screen max-w-6xl px-4 py-8">
            <div className="flex items-start justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                        Manage Rooms
                    </h1>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span>Add, edit, and manage your property listings.</span>
                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                            {rooms.length} room{rooms.length === 1 ? "" : "s"}
                        </span>
                    </div>
                </div>

                {isVerified && (
                    <Link
                        href="/hotel/rooms/new"
                        className={buttonVariants({ className: "h-10 px-4" })}
                    >
                        <Plus className="h-4 w-4" />
                        Add Room
                    </Link>
                )}
            </div>

            {loading ? (
                <p className="mt-6 text-sm text-slate-600">Loading…</p>
            ) : !isVerified ? (
                <div className="mt-6">
                    {hotel && <HotelPendingVerificationNotice hotel={hotel} />}
                    <p className="mt-4 text-sm text-slate-600">
                        You can add and manage rooms once your hotel is verified and your business
                        permit has been approved.
                    </p>
                </div>
            ) : (
                <div className="mt-8 space-y-6">
                    <div className="space-y-4">
                        {pagedRooms.map((room) => {
                            const heroImage =
                                room.media_urls?.find((m) => m.type === "image")?.url ??
                                room.media_urls?.[0]?.url ??
                                null;

                            return (
                                <Card key={room.id} className="overflow-hidden">
                                    <CardContent className="p-0">
                                        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-stretch">
                                            <div className="h-40 w-full overflow-hidden rounded-lg bg-muted md:h-auto md:w-44">
                                                {heroImage ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={heroImage}
                                                        alt=""
                                                        className="h-full w-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                                                        No image
                                                    </div>
                                                )}
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-start justify-between gap-4">
                                                    <div className="min-w-0">
                                                        <p className="text-base font-semibold text-foreground flex items-center gap-2">
                                                            {room.name}
                                                            {room.featured && (
                                                                <p className="inline-flex items-center gap-1 text-xs font-semibold text-primary border border-amber-500 rounded-full px-2 py-1">
                                                                    <Star className="h-3.5 w-3.5 fill-current text-amber-500" />
                                                                    Featured
                                                                </p>
                                                            )}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {room.room_type} · Room Capacity:{" "}
                                                            {room.capacity}
                                                            {room.bathroom_count != null &&
                                                                ` · ${room.bathroom_count} bathroom${
                                                                    room.bathroom_count !== 1
                                                                        ? "s"
                                                                        : ""
                                                                }${
                                                                    room.bathroom_shared === true
                                                                        ? " (shared)"
                                                                        : room.bathroom_shared ===
                                                                            false
                                                                          ? " (private)"
                                                                          : ""
                                                                }`}
                                                        </p>
                                                    </div>

                                                    <div className="shrink-0 text-right">
                                                        <p className="text-sm font-semibold text-foreground">
                                                            ₱
                                                            {formatNumberCompact(
                                                                room.base_price_night
                                                            )}
                                                            <span className="text-muted-foreground">
                                                                /night
                                                            </span>
                                                        </p>
                                                        {room.offer_hourly && room.hourly_rate ? (
                                                            <p className="text-xs text-muted-foreground">
                                                                ₱
                                                                {formatNumberCompact(
                                                                    room.hourly_rate
                                                                )}
                                                                /hr
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                </div>

                                                {room.description ? (
                                                    <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                                                        {room.description}
                                                    </p>
                                                ) : null}

                                                {room.amenities && room.amenities.length > 0 ? (
                                                    <p className="mt-3 text-[11px] uppercase tracking-wide text-muted-foreground">
                                                        {room.amenities.slice(0, 8).join(" · ")}
                                                    </p>
                                                ) : null}

                                                <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            handleToggleRoomAvailability(
                                                                room.id,
                                                                !(room.is_available ?? true)
                                                            )
                                                        }
                                                        className={cn(
                                                            "relative inline-flex h-5 w-10 items-center rounded-full border transition",
                                                            (room.is_available ?? true)
                                                                ? "border-foreground bg-foreground"
                                                                : "border-border bg-muted"
                                                        )}
                                                        aria-label={
                                                            (room.is_available ?? true)
                                                                ? "Disable room"
                                                                : "Enable room"
                                                        }
                                                    >
                                                        <span
                                                            className={cn(
                                                                "inline-block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform",
                                                                (room.is_available ?? true)
                                                                    ? "translate-x-[1.25rem]"
                                                                    : "translate-x-0.5"
                                                            )}
                                                        />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            handleToggleRoomFeatured(
                                                                room.id,
                                                                !(room.featured ?? false)
                                                            )
                                                        }
                                                        className={cn(
                                                            "relative inline-flex h-5 w-10 items-center rounded-full border transition",
                                                            (room.featured ?? false)
                                                                ? "border-amber-500 bg-amber-500"
                                                                : "border-border bg-muted"
                                                        )}
                                                        aria-label={
                                                            (room.featured ?? false)
                                                                ? "Unfeature room"
                                                                : "Feature room"
                                                        }
                                                    >
                                                        <span
                                                            className={cn(
                                                                "inline-flex h-4 w-4 translate-x-0.5 items-center justify-center rounded-full transition-transform",
                                                                (room.featured ?? false)
                                                                    ? "translate-x-[1.25rem] bg-white"
                                                                    : "translate-x-0.5 bg-white/70"
                                                            )}
                                                        >
                                                            <Star
                                                                className={cn(
                                                                    "h-2.5 w-2.5",
                                                                    (room.featured ?? false)
                                                                        ? "text-amber-700"
                                                                        : "text-muted-foreground"
                                                                )}
                                                            />
                                                        </span>
                                                    </button>
                                                    <Link
                                                        href={`/hotel/rooms/${room.id}/edit`}
                                                        className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:underline"
                                                    >
                                                        <Pencil className="h-4 w-4 text-muted-foreground" />
                                                        Edit
                                                    </Link>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDeleteRoomConfirmId(room.id)}
                                                        disabled={deletingId !== null}
                                                        className="inline-flex items-center gap-2 text-sm font-medium text-destructive disabled:opacity-60"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                        {deletingId === room.id
                                                            ? "Deleting…"
                                                            : "Delete"}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>

                    <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-muted-foreground">
                            Showing {rooms.length === 0 ? 0 : startIdx + 1} to {endIdx} of{" "}
                            {rooms.length} rooms
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={safePage === 1}
                            >
                                ‹
                            </Button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                                <Button
                                    key={p}
                                    type="button"
                                    size="sm"
                                    variant={p === safePage ? "default" : "outline"}
                                    onClick={() => setPage(p)}
                                    className="w-9"
                                >
                                    {p}
                                </Button>
                            ))}
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={safePage === totalPages}
                            >
                                ›
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={deleteRoomConfirmId !== null}
                onClose={() => deletingId === null && setDeleteRoomConfirmId(null)}
                title="Delete this room?"
                description="This permanently removes the room listing and cannot be undone."
                confirmLabel="Delete room"
                variant="destructive"
                confirmLoading={deletingId !== null && deleteRoomConfirmId !== null}
                onConfirm={() => {
                    const id = deleteRoomConfirmId;
                    if (!id) return;
                    void handleDeleteRoom(id).finally(() => setDeleteRoomConfirmId(null));
                }}
            />

            <ConfirmDialog
                open={removeMediaConfirm !== null}
                onClose={() => setRemoveMediaConfirm(null)}
                title="Remove this media?"
                description="The image or video will be removed from this room’s gallery."
                confirmLabel="Remove"
                variant="destructive"
                onConfirm={() => {
                    const target = removeMediaConfirm;
                    setRemoveMediaConfirm(null);
                    if (target) void handleRemoveRoomMedia(target.roomId, target.path);
                }}
            />
        </main>
    );
}
