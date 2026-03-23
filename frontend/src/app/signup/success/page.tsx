"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function RegistrationSuccessInner() {
    const searchParams = useSearchParams();
    const email = searchParams.get("email") ?? "";

    return (
        <main className="min-h-screen bg-slate-50">
            <div className="mx-auto flex max-w-md flex-col justify-center px-4 py-16">
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                        <svg
                            className="h-7 w-7"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                            />
                        </svg>
                    </div>
                    <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                        Registration successful
                    </h1>
                    <p className="mt-3 text-sm text-slate-600">
                        Your account has been created. To sign in and use your account, you need to
                        verify your email address.
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                        We&apos;ve sent a verification email to{" "}
                        {email ? (
                            <span className="font-medium text-slate-800">{email}</span>
                        ) : (
                            "the email address you provided"
                        )}
                        . Please check your inbox and click the confirmation link in that email.
                    </p>
                    <p className="mt-4 text-sm text-slate-600">
                        You must confirm your email before you can log in and use your account. If
                        you don&apos;t see the email, check your spam or junk folder.
                    </p>
                    <Link
                        href="/login"
                        className="mt-6 inline-block w-full rounded-lg bg-primary-600 py-2.5 text-center text-sm font-medium text-white transition hover:bg-primary-700"
                    >
                        Go to login
                    </Link>
                    <p className="mt-4 text-xs text-slate-500">
                        After verifying your email, return here to log in.
                    </p>
                </div>
            </div>
        </main>
    );
}

export default function RegistrationSuccessPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-slate-50 px-4 py-16">Loading…</div>}>
            <RegistrationSuccessInner />
        </Suspense>
    );
}
