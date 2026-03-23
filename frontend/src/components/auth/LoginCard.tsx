"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { SuccessAlert } from "./SuccessAlert";

type LoginCardProps = {
    showSuccessBanner?: boolean;
    successTitle?: string;
    successDescription?: string;
    onSubmit: (e: React.FormEvent) => void;
    email: string;
    setEmail: (v: string) => void;
    password: string;
    setPassword: (v: string) => void;
    error: string;
    loading: boolean;
};

export function LoginCard({
    showSuccessBanner,
    successTitle = "Account Created",
    successDescription = "Your account has been successfully set up. Please log in below.",
    onSubmit,
    email,
    setEmail,
    password,
    setPassword,
    error,
    loading
}: LoginCardProps) {
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
            {showSuccessBanner && (
                <SuccessAlert
                    title={successTitle}
                    description={successDescription}
                    className="mb-6"
                />
            )}
            <h1 className="text-3xl text-center font-bold tracking-tight text-foreground">
                Welcome back
            </h1>
            <p className="mt-1 text-md text-center text-muted-foreground">
                Enter your credentials to access your account
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-5">
                {error && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        {error}
                    </div>
                )}
                <div>
                    <label
                        htmlFor="login-email"
                        className="mb-1 block text-sm font-medium text-foreground"
                    >
                        Email
                    </label>
                    <input
                        id="login-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="name@company.com"
                    />
                </div>
                <div>
                    <div className="mb-1 flex items-center justify-between">
                        <label
                            htmlFor="login-password"
                            className="text-sm font-medium text-foreground"
                        >
                            Password
                        </label>
                        <Link
                            href="/forgot-password"
                            className="text-sm font-medium text-primary hover:underline"
                        >
                            Forgot password?
                        </Link>
                    </div>
                    <div className="relative">
                        <input
                            id="login-password"
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
                <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                >
                    {loading ? "Signing in…" : "Login"}
                </button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Link href="/signup" className="font-semibold text-primary hover:underline">
                    Sign up
                </Link>
            </p>
        </div>
    );
}
