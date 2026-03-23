"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { SignupLayout } from "@/components/auth/SignupLayout";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LocationPoint } from "@/components/MapLocationPicker";
import { GUEST_COUNTRY_OPTIONS } from "@/lib/guest-countries";

const MapLocationPicker = dynamic(
    () => import("@/components/MapLocationPicker").then((m) => ({ default: m.MapLocationPicker })),
    { ssr: false }
);

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const GUEST_GENDER_OPTIONS = [
    { value: "", label: "Gender (optional)" },
    { value: "prefer_not_to_say", label: "Prefer not to say" },
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "non_binary", label: "Non-binary" },
    { value: "other", label: "Other" }
] as const;

function SignupPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const isHotel = searchParams.get("role") === "hotel";

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [fullName, setFullName] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Guest optional profile fields
    const [guestPhone, setGuestPhone] = useState("");
    const [guestCountry, setGuestCountry] = useState("");
    const [guestAddressLine, setGuestAddressLine] = useState("");
    const [guestCity, setGuestCity] = useState("");
    const [guestRegion, setGuestRegion] = useState("");
    const [guestPostalCode, setGuestPostalCode] = useState("");
    const [guestGender, setGuestGender] = useState("");
    const [guestDateOfBirth, setGuestDateOfBirth] = useState("");

    // Hotel-only fields
    const [hotelName, setHotelName] = useState("");
    const [address, setAddress] = useState("");
    const [contactEmail, setContactEmail] = useState("");
    const [contactPhone, setContactPhone] = useState("");
    const [location, setLocation] = useState<LocationPoint>(null);

    async function handleGuestSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            const payload: Record<string, string> = {
                email,
                password,
                full_name: fullName
            };
            const p = guestPhone.trim();
            if (p) payload.phone = p;
            const c = guestCountry.trim();
            if (c) payload.country = c;
            const al = guestAddressLine.trim();
            if (al) payload.address_line = al;
            const ci = guestCity.trim();
            if (ci) payload.city = ci;
            const re = guestRegion.trim();
            if (re) payload.region = re;
            const pc = guestPostalCode.trim();
            if (pc) payload.postal_code = pc;
            const g = guestGender.trim();
            if (g) payload.gender = g;
            const dob = guestDateOfBirth.trim();
            if (dob) payload.date_of_birth = dob;

            const res = await fetch(`${API_BASE}/api/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error ?? "Registration failed");
                setLoading(false);
                return;
            }
            router.push(`/signup/success?email=${encodeURIComponent(email)}`);
            router.refresh();
        } catch {
            setError("Something went wrong");
            setLoading(false);
        }
    }

    async function handleHotelSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        if (!location) {
            setError("Please set your hotel location by clicking on the map.");
            return;
        }
        setLoading(true);
        try {
            const formData = new FormData();
            formData.set("email", email);
            formData.set("password", password);
            formData.set("full_name", fullName);
            formData.set("hotel_name", hotelName);
            formData.set("address", address);
            formData.set("contact_email", contactEmail);
            formData.set("contact_phone", contactPhone.trim());
            formData.set("latitude", String(location.lat));
            formData.set("longitude", String(location.lng));

            const res = await fetch(`${API_BASE}/api/hotels/register`, {
                method: "POST",
                body: formData
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error ?? "Registration failed");
                setLoading(false);
                return;
            }
            router.push(`/signup/success?email=${encodeURIComponent(email)}`);
            router.refresh();
        } catch {
            setError("Something went wrong");
            setLoading(false);
        }
    }

    const handleSubmit = isHotel ? handleHotelSubmit : handleGuestSubmit;

    return (
        <SignupLayout>
            <div className="w-full max-w-lg">
                <h1 className="text-4xl font-bold tracking-tight text-foreground">
                    Create an account
                </h1>
                <p className="mt-1 text-md text-muted-foreground">
                    Please enter your details to get started.
                </p>

                <Tabs
                    value={isHotel ? "hotel" : "guest"}
                    onValueChange={(next) => {
                        router.push(next === "hotel" ? "/signup?role=hotel" : "/signup");
                    }}
                    className="mt-6"
                >
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="guest">Guest</TabsTrigger>
                        <TabsTrigger value="hotel">Hotel</TabsTrigger>
                    </TabsList>
                </Tabs>

                <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                    {error && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                            {error}
                        </div>
                    )}
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground">
                            Full name
                        </label>
                        <input
                            type="text"
                            required
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder="John Doe"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground">
                            Email address
                        </label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder="email@example.com"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground">
                            Password
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full rounded-lg border border-input bg-background py-2.5 pr-10 pl-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                aria-label={showPassword ? "Hide password" : "Show password"}
                            >
                                {showPassword ? (
                                    <EyeOff className="h-4 w-4" />
                                ) : (
                                    <Eye className="h-4 w-4" />
                                )}
                            </button>
                        </div>
                    </div>

                    {!isHotel && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground">
                                    Phone
                                </label>
                                <input
                                    type="tel"
                                    value={guestPhone}
                                    onChange={(e) => setGuestPhone(e.target.value)}
                                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                    placeholder="+63 …"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground">
                                    Country / region
                                </label>
                                <select
                                    value={guestCountry}
                                    onChange={(e) => setGuestCountry(e.target.value)}
                                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                >
                                    {GUEST_COUNTRY_OPTIONS.map((c) => (
                                        <option key={c.value || "empty"} value={c.value}>
                                            {c.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground">
                                    Gender
                                </label>
                                <select
                                    value={guestGender}
                                    onChange={(e) => setGuestGender(e.target.value)}
                                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                >
                                    {GUEST_GENDER_OPTIONS.map((g) => (
                                        <option key={g.value || "unset"} value={g.value}>
                                            {g.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground">
                                    Street address
                                </label>
                                <input
                                    type="text"
                                    value={guestAddressLine}
                                    onChange={(e) => setGuestAddressLine(e.target.value)}
                                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                    placeholder="House / building, street"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground">
                                    City
                                </label>
                                <input
                                    type="text"
                                    value={guestCity}
                                    onChange={(e) => setGuestCity(e.target.value)}
                                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground">
                                    Province / state
                                </label>
                                <input
                                    type="text"
                                    value={guestRegion}
                                    onChange={(e) => setGuestRegion(e.target.value)}
                                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground">
                                    Postal code
                                </label>
                                <input
                                    type="text"
                                    value={guestPostalCode}
                                    onChange={(e) => setGuestPostalCode(e.target.value)}
                                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground">
                                    Date of birth
                                </label>
                                <input
                                    type="date"
                                    value={guestDateOfBirth}
                                    onChange={(e) => setGuestDateOfBirth(e.target.value)}
                                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                        </div>
                    )}

                    {isHotel && (
                        <>
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground">
                                    Hotel name
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={hotelName}
                                    onChange={(e) => setHotelName(e.target.value)}
                                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                    placeholder="Your Hotel Name"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground">
                                    Address
                                </label>
                                <AddressAutocomplete
                                    value={address}
                                    onChange={setAddress}
                                    onPlaceSelect={(_addr, lat, lng) => setLocation({ lat, lng })}
                                    placeholder="Start typing for place suggestions…"
                                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                    required
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground">
                                    Contact email
                                </label>
                                <input
                                    type="email"
                                    required
                                    value={contactEmail}
                                    onChange={(e) => setContactEmail(e.target.value)}
                                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                    placeholder="hotel@example.com"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground">
                                    Contact number
                                </label>
                                <input
                                    type="tel"
                                    required
                                    value={contactPhone}
                                    onChange={(e) => setContactPhone(e.target.value)}
                                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                    placeholder="+63 9XX XXX XXXX"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground">
                                    Hotel location on map
                                </label>
                                <MapLocationPicker value={location} onChange={setLocation} />
                            </div>
                        </>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                    >
                        {loading ? "Creating account…" : "Sign Up"}
                    </button>
                </form>

                <p className="mt-6 text-center text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <Link href="/login" className="font-semibold text-primary hover:underline">
                        Login
                    </Link>
                </p>
                {!isHotel && (
                    <p className="mt-2 text-center text-sm text-muted-foreground">
                        Own a hotel?{" "}
                        <Link
                            href="/signup?role=hotel"
                            className="font-semibold text-primary hover:underline"
                        >
                            List your hotel
                        </Link>
                    </p>
                )}

                <div className="mt-8 flex items-center gap-4">
                    <span className="flex-1 border-t border-border" />
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        Or continue with
                    </span>
                    <span className="flex-1 border-t border-border" />
                </div>
                <div className="mt-4 flex gap-3">
                    <button
                        type="button"
                        className="flex-1 rounded-lg border border-input bg-card py-2.5 text-sm font-medium text-foreground transition hover:bg-muted"
                    >
                        Google
                    </button>
                    <button
                        type="button"
                        className="flex-1 rounded-lg border border-input bg-card py-2.5 text-sm font-medium text-foreground transition hover:bg-muted"
                    >
                        Apple
                    </button>
                </div>
            </div>
        </SignupLayout>
    );
}

export default function SignupPage() {
    return (
        <Suspense fallback={<div className="min-h-screen px-4 py-16 text-center text-muted-foreground">Loading…</div>}>
            <SignupPageInner />
        </Suspense>
    );
}
