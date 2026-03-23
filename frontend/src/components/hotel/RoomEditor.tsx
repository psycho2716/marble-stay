"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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
        <div className="relative h-[84px] w-[140px] overflow-hidden rounded-lg border border-input bg-muted">
            <div className="absolute inset-0">
                {url ? (
                    isVideo ? (
                        <>
                            <video
                                src={url}
                                className="h-full w-full object-cover"
                                muted
                                playsInline
                            />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                                <Play
                                    className="h-7 w-7 text-white drop-shadow"
                                    fill="currentColor"
                                />
                            </span>
                            <span className="absolute bottom-1 left-1 rounded bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                Video
                            </span>
                        </>
                    ) : (
                        // eslint-disable-next-line @next/next/no-img-element
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
                className="absolute right-1 top-1 h-5 w-5 rounded-full"
                aria-label="Remove"
            >
                ×
            </Button>
        </div>
    );
}

export function RoomEditor({ mode, roomId }: { mode: "new" | "edit"; roomId?: string }) {
    const isEdit = mode === "edit";
    const [loading, setLoading] = useState(isEdit);
    const [room, setRoom] = useState<Room | null>(null);
    const [saving, setSaving] = useState(false);
    const [uploadingMedia, setUploadingMedia] = useState(false);
    const [existingMediaDraft, setExistingMediaDraft] = useState<
        Array<{ type: string; path: string; url: string }>
    >([]);
    const [pendingMediaFiles, setPendingMediaFiles] = useState<File[]>([]);

    const [addFormFiles, setAddFormFiles] = useState<File[]>([]);
    const addFormFilesRef = useRef<File[]>([]);
    useEffect(() => {
        addFormFilesRef.current = addFormFiles;
    }, [addFormFiles]);

    useEffect(() => {
        if (!isEdit || !roomId) return;
        setLoading(true);
        fetch(`${API_BASE}/api/hotel/rooms/${roomId}`, { headers: getAuthHeaders() })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (!data) {
                    toast.error("Room not found.");
                    setLoading(false);
                    return;
                }
                setRoom(data);
                const media = (data.media as { type?: string; path: string }[] | undefined) ?? [];
                const urls =
                    (data.media_urls as { type?: string; url: string }[] | undefined) ?? [];
                const merged = media
                    .map((m, idx) => ({
                        type: m.type || "image",
                        path: m.path,
                        url: urls[idx]?.url ?? ""
                    }))
                    .filter((m) => !!m.path);
                setExistingMediaDraft(merged);
                setPendingMediaFiles([]);
                setLoading(false);
            })
            .catch(() => {
                toast.error("Failed to load room.");
                setLoading(false);
            });
    }, [isEdit, roomId]);

    async function reloadRoom() {
        if (!isEdit || !roomId) return;
        const res = await fetch(`${API_BASE}/api/hotel/rooms/${roomId}`, {
            headers: getAuthHeaders()
        });
        if (res.ok) {
            const data = await res.json();
            setRoom(data);
            const media = (data.media as { type?: string; path: string }[] | undefined) ?? [];
            const urls = (data.media_urls as { type?: string; url: string }[] | undefined) ?? [];
            const merged = media
                .map((m, idx) => ({
                    type: m.type || "image",
                    path: m.path,
                    url: urls[idx]?.url ?? ""
                }))
                .filter((m) => !!m.path);
            setExistingMediaDraft(merged);
            setPendingMediaFiles([]);
        }
    }

    const title = isEdit ? "Edit Room Details" : "New Room Details";
    const subtitle = isEdit
        ? "Manage your hotel rooms and pricing details."
        : "Create your new room.";

    if (loading) {
        return <p className="text-sm text-muted-foreground">Loading…</p>;
    }

    if (isEdit && !room) {
        return (
            <div className="space-y-4">
                <Link
                    href="/hotel/rooms"
                    className="text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                    ← Back to rooms
                </Link>
                <p className="text-sm text-muted-foreground">
                    We couldn&apos;t load this room. Check the notification or try again later.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Link
                href="/hotel/rooms"
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
                ← Back to rooms
            </Link>
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Edit room</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                    <RoomDetailsForm
                        initialRoom={room}
                        addFormFiles={addFormFiles}
                        setAddFormFiles={setAddFormFiles}
                        isEdit={isEdit}
                        existingMediaDraft={existingMediaDraft}
                        setExistingMediaDraft={setExistingMediaDraft}
                        pendingMediaFiles={pendingMediaFiles}
                        setPendingMediaFiles={setPendingMediaFiles}
                        uploadingMedia={uploadingMedia}
                        saving={saving}
                        submitLabel={isEdit ? "Save changes" : "Save changes"}
                        onCancelHref="/hotel/rooms"
                        onSubmit={async (payload, files, selectedRoomId) => {
                            setSaving(true);
                            try {
                                if (isEdit) {
                                    if (!roomId) throw new Error("Missing room id");
                                    // Apply pending media changes only on save.
                                    const hasPendingVideo = pendingMediaFiles.some((f) =>
                                        f.type.startsWith("video/")
                                    );
                                    const keptExisting = existingMediaDraft.filter((m) =>
                                        hasPendingVideo ? m.type !== "video" : true
                                    );
                                    const keptMediaPayload = keptExisting.map((m) => ({
                                        type: m.type || "image",
                                        path: m.path
                                    }));

                                    // First PATCH updates room fields + deletes (and removes existing video if needed).
                                    const res = await fetch(
                                        `${API_BASE}/api/hotel/rooms/${roomId}`,
                                        {
                                            method: "PATCH",
                                            headers: {
                                                ...getAuthHeaders(),
                                                "Content-Type": "application/json"
                                            },
                                            body: JSON.stringify({
                                                ...payload,
                                                media: keptMediaPayload
                                            })
                                        }
                                    );
                                    if (!res.ok) {
                                        const data = await res.json().catch(() => ({}));
                                        throw new Error(data.error ?? "Failed to update room");
                                    }

                                    // Then upload any pending files (these append to room.media).
                                    if (pendingMediaFiles.length > 0) {
                                        setUploadingMedia(true);
                                        const existingCount = keptMediaPayload.length;
                                        let videoCount = keptMediaPayload.filter(
                                            (m) => m.type === "video"
                                        ).length;
                                        let uploadedCount = 0;
                                        for (const file of pendingMediaFiles) {
                                            if (existingCount + uploadedCount >= MAX_MEDIA) break;
                                            const isVideo = file.type.startsWith("video/");
                                            if (isVideo && videoCount >= 1) continue;
                                            if (isVideo && !VIDEO_TYPES.includes(file.type))
                                                continue;
                                            const fd = new FormData();
                                            fd.append("media", file);
                                            const up = await fetch(
                                                `${API_BASE}/api/hotel/rooms/${roomId}/media`,
                                                {
                                                    method: "POST",
                                                    headers: getAuthHeaders(),
                                                    body: fd
                                                }
                                            );
                                            if (!up.ok) {
                                                const data = await up.json().catch(() => ({}));
                                                throw new Error(
                                                    data.error ?? "Failed to upload image or video"
                                                );
                                            }
                                            uploadedCount++;
                                            if (isVideo) videoCount++;
                                        }
                                        setUploadingMedia(false);
                                    }

                                    setSaving(false);
                                    window.location.href = "/hotel/rooms";
                                    return;
                                }

                                const createRes = await fetch(`${API_BASE}/api/hotel/rooms`, {
                                    method: "POST",
                                    headers: {
                                        ...getAuthHeaders(),
                                        "Content-Type": "application/json"
                                    },
                                    body: JSON.stringify(payload)
                                });
                                if (!createRes.ok) {
                                    const data = await createRes.json().catch(() => ({}));
                                    throw new Error(data.error ?? "Failed to add room");
                                }
                                const created = (await createRes.json()) as { id: string };

                                const validFiles = Array.from(files ?? []).filter(
                                    (f) => f && f.size > 0
                                );
                                let videoCount = 0;
                                for (const file of validFiles) {
                                    if (videoCount >= 1 && file.type?.startsWith("video/"))
                                        continue;
                                    const fd = new FormData();
                                    fd.append("media", file);
                                    const up = await fetch(
                                        `${API_BASE}/api/hotel/rooms/${created.id}/media`,
                                        {
                                            method: "POST",
                                            headers: getAuthHeaders(),
                                            body: fd
                                        }
                                    );
                                    if (!up.ok) {
                                        const data = await up.json().catch(() => ({}));
                                        throw new Error(
                                            data.error ?? "Failed to upload image or video"
                                        );
                                    }
                                    if (file.type?.startsWith("video/")) videoCount++;
                                }

                                setSaving(false);
                                window.location.href = "/hotel/rooms";
                            } catch (e) {
                                setSaving(false);
                                setUploadingMedia(false);
                                toast.error(
                                    e instanceof Error ? e.message : "Something went wrong"
                                );
                            }
                        }}
                    />
                </CardContent>
            </Card>
        </div>
    );
}

function RoomDetailsForm({
    initialRoom,
    onSubmit,
    onCancelHref,
    submitLabel,
    isEdit,
    existingMediaDraft,
    setExistingMediaDraft,
    pendingMediaFiles,
    setPendingMediaFiles,
    uploadingMedia,
    saving,
    addFormFiles,
    setAddFormFiles
}: {
    initialRoom: Room | null;
    onSubmit: (
        payload: Record<string, unknown>,
        files: File[],
        roomId: string | null
    ) => Promise<void>;
    onCancelHref: string;
    submitLabel: string;
    isEdit: boolean;
    existingMediaDraft: Array<{ type: string; path: string; url: string }>;
    setExistingMediaDraft: React.Dispatch<
        React.SetStateAction<Array<{ type: string; path: string; url: string }>>
    >;
    pendingMediaFiles: File[];
    setPendingMediaFiles: React.Dispatch<React.SetStateAction<File[]>>;
    uploadingMedia: boolean;
    saving: boolean;
    addFormFiles: File[];
    setAddFormFiles: React.Dispatch<React.SetStateAction<File[]>>;
}) {
    const room = initialRoom;
    const mediaInputRef = useRef<HTMLInputElement | null>(null);
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
        if (!room?.custom_policies || !Array.isArray(room.custom_policies)) return [];
        return room.custom_policies
            .map((p) => ({
                iconKey: String((p as any)?.iconKey ?? (p as any)?.icon_key ?? (p as any)?.icon ?? "") || "shield",
                label: String((p as any)?.label ?? ""),
                value: String((p as any)?.value ?? "")
            }))
            .filter((p) => p.label.trim() && p.value.trim());
    });

    const [deleteConfirm, setDeleteConfirm] = useState<
        | null
        | { kind: "media"; index: number }
        | { kind: "policy"; index: number }
        | { kind: "amenity"; item: string }
    >(null);

    const toggleHour = (h: number) => {
        setHourlyAvailableHours((prev) =>
            prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h].sort((a, b) => a - b)
        );
    };

    const amenitiesDefaults = useMemo(
        () => new Set(room?.amenities ?? []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [room?.id]
    );

    return (
        <>
        <form
            onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const formData = new FormData(form);
                const offerHourlyNext = formData.get("offer_hourly") === "on";
                const amenities: string[] = [];
                ACCOMMODATION_OPTIONS.forEach((opt) => {
                    if (formData.get(`amenity_${opt.replace(/\\s+/g, "_")}`) === "on")
                        amenities.push(opt);
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
                const hourlyAvailable = (() => {
                    try {
                        return hourlyJson
                            ? (JSON.parse(hourlyJson as string) as number[])
                            : undefined;
                    } catch {
                        return undefined;
                    }
                })();

                const payload: Record<string, unknown> = {
                    name: (formData.get("name") as string).trim(),
                    room_type: formData.get("room_type") as string,
                    base_price_night: Number(formData.get("base_price_night")),
                    capacity: Number(formData.get("capacity")),
                    description: (formData.get("description") as string).trim() || null,
                    offer_hourly: offerHourlyNext,
                    hourly_rate:
                        offerHourlyNext && (formData.get("hourly_rate") as string).trim()
                            ? Number(formData.get("hourly_rate"))
                            : null,
                    hourly_available_hours:
                        offerHourlyNext && Array.isArray(hourlyAvailable) ? hourlyAvailable : null,
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
                    cancellation_policy:
                        (formData.get("cancellation_policy") as string)?.trim() || null,
                    custom_policies: customPolicies
                        .filter((p) => p.label.trim() && p.value.trim())
                        .map((p) => ({
                            iconKey: p.iconKey,
                            label: p.label.trim(),
                            value: p.value.trim()
                        }))
                };

                await onSubmit(payload, addFormFiles, room?.id ?? null);
            }}
            className="space-y-4"
        >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="room-name">Room name *</Label>
                    <Input
                        id="room-name"
                        type="text"
                        name="name"
                        required
                        defaultValue={room?.name ?? ""}
                        placeholder="e.g. Penthouse Suite"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="room-type">Room type *</Label>
                    <select
                        id="room-type"
                        name="room_type"
                        required
                        defaultValue={room?.room_type ?? "Standard"}
                        className={cn(
                            "flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring/30"
                        )}
                    >
                        {ROOM_TYPES.map((t) => (
                            <option key={t} value={t}>
                                {t}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="room-description">Description</Label>
                <Textarea
                    id="room-description"
                    name="description"
                    rows={3}
                    defaultValue={room?.description ?? ""}
                    placeholder="Enter room description here"
                />
            </div>

            <div className="space-y-2">
                <Label className="flex cursor-pointer items-center gap-2 font-normal normal-case tracking-normal">
                    <input
                        type="checkbox"
                        name="featured"
                        defaultChecked={room?.featured === true}
                        className="size-4 rounded border-input"
                    />
                    Featured room (show as featured on listings and room page)
                </Label>
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <p className="text-sm font-medium text-foreground">Room policies</p>
                <p className="text-xs text-muted-foreground">
                    Optional. Shown on room view only when set. Overrides hotel default for this room.
                </p>
                <div className="space-y-2">
                    <Label htmlFor="room-pets-policy" className="text-xs">Pets</Label>
                    <Textarea
                        id="room-pets-policy"
                        name="pets_policy"
                        rows={2}
                        defaultValue={room?.pets_policy ?? ""}
                        placeholder="e.g. Small pets allowed"
                        className="resize-none"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="room-smoking-policy" className="text-xs">Smoking</Label>
                    <Textarea
                        id="room-smoking-policy"
                        name="smoking_policy"
                        rows={2}
                        defaultValue={room?.smoking_policy ?? ""}
                        placeholder="e.g. Smoke-free"
                        className="resize-none"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="room-cancellation-policy" className="text-xs">Cancellation</Label>
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

            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-sm font-medium text-foreground">Custom policies</p>
                        <p className="text-xs text-muted-foreground">
                            Add extra policies beyond the defaults. Icon is system-controlled.
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
                    <p className="text-xs text-muted-foreground">No custom policies added.</p>
                ) : (
                    <div className="space-y-4">
                        {customPolicies.map((p, idx) => (
                            <div
                                key={`${idx}`}
                                className="rounded-lg border border-border bg-background p-3"
                            >
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                    <div className="sm:col-span-1">
                                        <Label htmlFor={`custom-policy-icon-${idx}`} className="text-xs">
                                            Icon
                                        </Label>
                                        <select
                                            id={`custom-policy-icon-${idx}`}
                                            value={p.iconKey}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setCustomPolicies((prev) =>
                                                    prev.map((x, i) =>
                                                        i === idx ? { ...x, iconKey: v } : x
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
                                        <Label htmlFor={`custom-policy-label-${idx}`} className="text-xs">
                                            Label
                                        </Label>
                                        <Input
                                            id={`custom-policy-label-${idx}`}
                                            value={p.label}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setCustomPolicies((prev) =>
                                                    prev.map((x, i) =>
                                                        i === idx ? { ...x, label: v } : x
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
                                            onClick={() => setDeleteConfirm({ kind: "policy", index: idx })}
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
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="base-price">Price per night (₱) *</Label>
                    <Input
                        id="base-price"
                        type="number"
                        name="base_price_night"
                        required
                        min={0}
                        step={1}
                        defaultValue={room?.base_price_night ?? ""}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="capacity">Capacity (guests) *</Label>
                    <Input
                        id="capacity"
                        type="number"
                        name="capacity"
                        required
                        min={1}
                        defaultValue={room?.capacity ?? ""}
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label className="flex cursor-pointer items-center gap-2 font-normal normal-case tracking-normal">
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
                                step={1}
                                defaultValue={room?.hourly_rate ?? ""}
                                className="max-w-[160px]"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Hours available for hourly booking</Label>
                            <p className="text-xs text-muted-foreground">
                                Select which hours of the day guests can book (12:00 AM – 11:00 PM).
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
                                                ? "border-foreground bg-foreground text-white"
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
                <Label htmlFor="bathroom-count">Bathrooms</Label>
                <Input
                    id="bathroom-count"
                    type="number"
                    name="bathroom_count"
                    min={0}
                    defaultValue={room?.bathroom_count ?? ""}
                    className="max-w-[120px]"
                />
                <div className="mt-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Bathroom type
                    </p>
                    <div className="mt-2 flex flex-wrap gap-6 text-sm">
                        <label className="flex cursor-pointer items-center gap-2">
                            <input
                                type="radio"
                                name="bathroom_shared"
                                value="private"
                                defaultChecked={room?.bathroom_shared !== true}
                                className="size-4"
                            />
                            Private
                        </label>
                        <label className="flex cursor-pointer items-center gap-2">
                            <input
                                type="radio"
                                name="bathroom_shared"
                                value="shared"
                                defaultChecked={room?.bathroom_shared === true}
                                className="size-4"
                            />
                            Shared
                        </label>
                    </div>
                </div>
            </div>

            <div className="space-y-2">
                <Label>Room amenities</Label>
                <p className="text-xs text-muted-foreground">
                    Select amenities included in this room.
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {ACCOMMODATION_OPTIONS.map((opt) => (
                        <label key={opt} className="flex cursor-pointer items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                name={`amenity_${opt.replace(/\\s+/g, "_")}`}
                                defaultChecked={amenitiesDefaults.has(opt)}
                                className="size-4 rounded border-input"
                            />
                            {opt}
                        </label>
                    ))}
                </div>
                <div className="mt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Add your own accommodation
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Input
                            type="text"
                            value={customInput}
                            onChange={(e) => setCustomInput(e.target.value)}
                            placeholder="e.g. Kitchenette, Bathtub"
                            className="max-w-[260px]"
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
                                    className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2 text-xs font-medium text-foreground"
                                >
                                    {item}
                                    <button
                                        type="button"
                                        className="ml-1 rounded-full px-1 text-muted-foreground hover:text-foreground"
                                        onClick={() =>
                                            setDeleteConfirm({ kind: "amenity", item })
                                        }
                                        aria-label={`Remove ${item}`}
                                    >
                                        ×
                                    </button>
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

            {/* Room images / video — matches design reference */}
            <div className="space-y-2">
                <Label>Room images / video</Label>
                <p className="text-xs text-muted-foreground">
                    Upload high-quality images of the room. Max {MAX_MEDIA} items and 1 video.
                </p>

                <div className="mt-3 flex flex-wrap gap-3">
                    {/* Existing media (edit mode) */}
                    {isEdit &&
                        existingMediaDraft.map((item, idx) => (
                            <div
                                key={`${item.path}-${idx}`}
                                className="relative h-[84px] w-[140px] overflow-hidden rounded-lg border border-input bg-muted"
                            >
                                {item.type === "video" ? (
                                    <>
                                        <video
                                            src={item.url}
                                            className="h-full w-full object-cover"
                                            muted
                                            playsInline
                                        />
                                        <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                                            <Play
                                                className="h-7 w-7 text-white drop-shadow"
                                                fill="currentColor"
                                            />
                                        </span>
                                        <span className="absolute bottom-1 left-1 rounded bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                            Video
                                        </span>
                                    </>
                                ) : (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={item.url}
                                        alt=""
                                        className="h-full w-full object-cover"
                                    />
                                )}
                                <Button
                                    type="button"
                                    variant="destructive"
                                    size="icon-xs"
                                    className="absolute right-1 top-1 h-5 w-5 rounded-full"
                                    disabled={saving || uploadingMedia}
                                    onClick={() => setDeleteConfirm({ kind: "media", index: idx })}
                                    aria-label="Remove media"
                                >
                                    ×
                                </Button>
                            </div>
                        ))}

                    {/* Pending uploads (edit mode) */}
                    {isEdit &&
                        pendingMediaFiles.map((file, idx) => (
                            <AddFormFileThumb
                                key={`${file.name}-${file.size}-${idx}`}
                                file={file}
                                onRemove={() =>
                                    setPendingMediaFiles((prev) => prev.filter((_, i) => i !== idx))
                                }
                            />
                        ))}

                    {/* New room uploads */}
                    {!isEdit &&
                        addFormFiles.map((file, idx) => (
                            <AddFormFileThumb
                                key={`${file.name}-${file.size}-${idx}`}
                                file={file}
                                onRemove={() =>
                                    setAddFormFiles((prev) => prev.filter((_, i) => i !== idx))
                                }
                            />
                        ))}

                    {/* Add media tile */}
                    {(() => {
                        const usedCount = isEdit
                            ? existingMediaDraft.length + pendingMediaFiles.length
                            : addFormFiles.length;
                        if (usedCount >= MAX_MEDIA) return null;
                        return (
                            <button
                                type="button"
                                onClick={() => mediaInputRef.current?.click()}
                                disabled={saving || uploadingMedia}
                                className="flex h-[84px] w-[140px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-transparent text-xs font-semibold text-muted-foreground transition hover:bg-muted disabled:opacity-60"
                            >
                                <ImagePlus className="h-5 w-5" />
                                <span className="mt-1 text-[10px] uppercase tracking-wide">
                                    Add media
                                </span>
                            </button>
                        );
                    })()}

                    <input
                        ref={mediaInputRef}
                        type="file"
                        accept="image/*,video/mp4,video/webm"
                        multiple
                        className="hidden"
                        disabled={saving || uploadingMedia}
                        onChange={(e) => {
                            const chosen = e.target.files;
                            if (!chosen?.length) return;

                            if (isEdit) {
                                // In edit mode: stage uploads. Allow a video even if an existing video exists (replacement).
                                setPendingMediaFiles((prev) => {
                                    const next = [...prev];
                                    let videoCount = next.filter((f) =>
                                        f.type.startsWith("video/")
                                    ).length;
                                    for (const f of Array.from(chosen)) {
                                        if (existingMediaDraft.length + next.length >= MAX_MEDIA)
                                            break;
                                        if (f.type.startsWith("video/")) {
                                            if (videoCount >= 1) continue;
                                            videoCount++;
                                        }
                                        next.push(f);
                                    }
                                    return next;
                                });
                            } else {
                                // New room: stage uploads. Enforce single video overall.
                                setAddFormFiles((prev) => {
                                    const next = [...prev];
                                    let videoCount = next.filter((f) =>
                                        f.type.startsWith("video/")
                                    ).length;
                                    for (const f of Array.from(chosen)) {
                                        if (next.length >= MAX_MEDIA) break;
                                        if (f.type.startsWith("video/")) {
                                            if (videoCount >= 1) continue;
                                            videoCount++;
                                        }
                                        next.push(f);
                                    }
                                    return next;
                                });
                            }

                            e.target.value = "";
                        }}
                    />
                </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
                <Link
                    href={onCancelHref}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                    Cancel
                </Link>
                <Button type="submit" disabled={saving}>
                    {saving ? "Saving…" : submitLabel}
                </Button>
            </div>
        </form>

        <ConfirmDialog
            open={deleteConfirm !== null}
            onClose={() => setDeleteConfirm(null)}
            title={
                deleteConfirm?.kind === "media"
                    ? "Remove this image or video?"
                    : deleteConfirm?.kind === "policy"
                      ? "Remove this custom policy?"
                      : "Remove this amenity?"
            }
            description={
                deleteConfirm?.kind === "media"
                    ? "It will be removed from this room when you save changes."
                    : deleteConfirm?.kind === "policy"
                      ? "This policy block will be removed when you save changes."
                      : "This custom amenity tag will be removed when you save changes."
            }
            confirmLabel="Remove"
            variant="destructive"
            onConfirm={() => {
                const d = deleteConfirm;
                if (!d) return;
                setDeleteConfirm(null);
                if (d.kind === "media") {
                    setExistingMediaDraft((prev) => prev.filter((_, i) => i !== d.index));
                } else if (d.kind === "policy") {
                    setCustomPolicies((prev) => prev.filter((_, i) => i !== d.index));
                } else {
                    setCustomAmenities((prev) => prev.filter((x) => x !== d.item));
                }
            }}
        />
        </>
    );
}
