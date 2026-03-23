"use client";

import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type HotelForNotice = {
    verification_status: string;
    business_permit_file?: string | null;
    permit_expires_at?: string | null;
};

/**
 * Show pending verification card when: status is pending, rejected, or verified but permit expired.
 * Show submit-legal form only when: rejected, or permit expired, or pending with no document yet.
 * Form is hidden once user has submitted (pending + has document) until admin declines or permit expires.
 */
export function HotelPendingVerificationNotice({
    hotel,
    onSubmitted
}: {
    hotel: HotelForNotice | null | undefined;
    onSubmitted?: () => void;
}) {
    const [permitFile, setPermitFile] = useState<File | null>(null);
    const [permitUploading, setPermitUploading] = useState(false);
    const [permitMessage, setPermitMessage] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);
    const [permitFormKey, setPermitFormKey] = useState(0);

    if (!hotel) return null;

    const status = hotel.verification_status;
    const hasSubmittedDocument = !!hotel.business_permit_file;
    const isPermitExpired =
        !!hotel.permit_expires_at && new Date(hotel.permit_expires_at) <= new Date();

    const showCard =
        status === "pending" || status === "rejected" || (status === "verified" && isPermitExpired);
    const showForm =
        status === "rejected" ||
        (status === "verified" && isPermitExpired) ||
        (status === "pending" && !hasSubmittedDocument);

    async function handlePermitSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!permitFile) return;
        setPermitMessage(null);
        setPermitUploading(true);
        const token = window.localStorage.getItem("token");
        const supabaseToken = window.localStorage.getItem("supabase_access_token");
        if (!token) {
            setPermitMessage({ type: "error", text: "Not signed in." });
            setPermitUploading(false);
            return;
        }
        try {
            const formData = new FormData();
            formData.set("business_permit", permitFile);
            const res = await fetch(`${API_BASE}/api/hotel/permit`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...(supabaseToken ? { "x-supabase-access-token": supabaseToken } : {})
                },
                body: formData
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setPermitMessage({ type: "error", text: data.error ?? "Upload failed." });
                setPermitUploading(false);
                return;
            }
            setPermitMessage({ type: "success", text: data.message ?? "Document submitted." });
            setPermitFile(null);
            setPermitFormKey((k) => k + 1);
            onSubmitted?.();
        } catch {
            setPermitMessage({ type: "error", text: "Something went wrong." });
        }
        setPermitUploading(false);
    }

    if (!showCard) return null;

    const isRejected = status === "rejected";
    const isExpired = status === "verified" && isPermitExpired;
    const isPendingSubmitted = status === "pending" && hasSubmittedDocument;

    return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
            <h2 className="text-base font-semibold">
                {isRejected
                    ? "Verification declined"
                    : isExpired
                      ? "Permit expired — re-submit required"
                      : "Pending verification"}
            </h2>
            <p className="mt-2 text-sm">
                {isRejected &&
                    "Your verification was declined. Please submit an updated business/barangay permit using the form below and an admin will review again."}
                {isExpired &&
                    "Your business permit has expired. Please upload a current permit to remain compliant and verified."}
                {status === "pending" &&
                    !hasSubmittedDocument &&
                    "Your hotel must be verified by an administrator before you can manage your accommodations and rooms, and before your hotel appears in room listings for guests. Please submit your business/barangay permit below."}
                {isPendingSubmitted &&
                    "Your hotel must be verified by an administrator before you can manage your accommodations and rooms. You have already submitted your business permit — an admin will review it. You can still sign in and view your profile and status here."}
            </p>
            {isPendingSubmitted && (
                <p className="mt-3 rounded-lg border border-amber-200/80 bg-white p-3 text-sm font-medium text-emerald-700">
                    Business permit submitted. An admin will review it for verification.
                </p>
            )}

            {showForm && (
                <div className="mt-4 rounded-lg border-amber-200/80 bg-gray-50 p-4">
                    <h3 className="text-sm font-semibold text-slate-900">
                        Submit legal document (business/barangay permit)
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                        Upload your business permit or barangay permit (PDF or image). This document
                        is required for verification.
                    </p>
                    <form onSubmit={handlePermitSubmit} className="mt-4 space-y-3">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">
                                File (PDF or image)
                            </label>
                            <input
                                key={permitFormKey}
                                type="file"
                                accept=".pdf,image/*"
                                onChange={(e) => {
                                    setPermitFile(e.target.files?.[0] ?? null);
                                    setPermitMessage(null);
                                }}
                                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
                            />
                        </div>
                        {permitMessage && (
                            <p
                                className={`text-sm ${permitMessage.type === "success" ? "text-emerald-600" : "text-red-600"}`}
                            >
                                {permitMessage.text}
                            </p>
                        )}
                        <button
                            type="submit"
                            disabled={!permitFile || permitUploading}
                            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 disabled:pointer-events-none"
                        >
                            {permitUploading ? "Uploading…" : "Submit document"}
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}
