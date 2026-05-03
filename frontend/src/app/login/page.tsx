"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { LoginCard } from "@/components/auth/LoginCard";
import { syncMarbleRoleCookie } from "@/lib/marble-role-cookie";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function getRedirectForRole(role: string): string {
    switch (role) {
        case "hotel":
            return "/hotel/dashboard";
        case "admin":
            return "/admin/verification";
        default:
            return "/";
    }
}

function LoginPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [canResendVerification, setCanResendVerification] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);
    const [resendMessage, setResendMessage] = useState("");

    const registered = searchParams.get("registered") === "1";
    const hotelSubmitted = searchParams.get("hotel") === "1";
    const showSuccess = registered || hotelSubmitted;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        setCanResendVerification(false);
        setResendMessage("");
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const apiError = String(data.error ?? "Invalid credentials");
                setError(apiError);
                setCanResendVerification(apiError.toLowerCase().includes("verify your email"));
                setLoading(false);
                return;
            }
            if (data.token) {
                localStorage.setItem("token", data.token);
                if (data.supabase_access_token) {
                    localStorage.setItem("supabase_access_token", data.supabase_access_token);
                }
                const userRole = data.role ?? "guest";
                localStorage.setItem("user_role", userRole);
                syncMarbleRoleCookie(
                    userRole === "hotel" || userRole === "admin" ? userRole : "guest"
                );
                // Used by navbar profile menu. Fallback decoding still exists for JWTs.
                localStorage.setItem("user_email", email);
            }
            const redirect = getRedirectForRole(data.role ?? "guest");
            router.push(redirect);
            router.refresh();
        } catch {
            setError("Something went wrong");
            setLoading(false);
        }
    }

    async function handleResendVerification() {
        if (!email.trim()) {
            setResendMessage("Enter your email first, then resend verification.");
            return;
        }
        setResendLoading(true);
        setResendMessage("");
        try {
            const res = await fetch(`${API_BASE}/api/auth/resend-verification`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim() })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setResendMessage(String(data.error ?? "Unable to resend verification email."));
                return;
            }
            setResendMessage(
                String(data.message ?? "Verification email sent. Please check your inbox.")
            );
        } catch {
            setResendMessage("Unable to resend verification email right now. Please try again.");
        } finally {
            setResendLoading(false);
        }
    }

    return (
        <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center bg-background px-4 py-12">
            <LoginCard
                showSuccessBanner={showSuccess}
                successTitle={hotelSubmitted ? "Hotel account created" : "Account Created"}
                successDescription={
                    hotelSubmitted
                        ? "Your hotel account has been successfully set up. Please log in below."
                        : "Your account has been successfully set up. Please log in below."
                }
                onSubmit={handleSubmit}
                email={email}
                setEmail={setEmail}
                password={password}
                setPassword={setPassword}
                error={error}
                loading={loading}
                canResendVerification={canResendVerification}
                resendLoading={resendLoading}
                resendMessage={resendMessage}
                onResendVerification={handleResendVerification}
            />
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-background px-4 py-12">Loading…</div>}>
            <LoginPageInner />
        </Suspense>
    );
}
