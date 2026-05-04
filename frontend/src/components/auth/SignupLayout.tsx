"use client";

import { ReactNode } from "react";

const authBackgroundImage = require("@/public/images/auth-bg.jpg");

export function SignupLayout({ children }: { children: ReactNode }) {
    return (
        <div className="grid min-h-[calc(100vh-3.5rem)] grid-cols-1 lg:grid-cols-3">
            {/* Left: hero image + overlay */}
            <div className="relative hidden overflow-hidden bg-primary col-span-2 lg:block">
                <div
                    className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-60"
                    style={{
                        backgroundImage: `url(${authBackgroundImage.default ? authBackgroundImage.default.src : authBackgroundImage.src || authBackgroundImage})`
                    }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                <div className="relative flex h-full flex-col justify-end p-10 text-white">
                    <h2 className="text-3xl font-bold tracking-tight">Experience Elegance.</h2>
                    <p className="mt-3 max-w-md text-white/90">
                        Join the world&apos;s most curated network of boutique stays and premium
                        hotel experiences.
                    </p>
                </div>
            </div>
            {/* Right: form */}
            <div className="flex flex-col justify-center items-center px-4 py-12 sm:px-8 lg:px-12">
                {children}
            </div>
        </div>
    );
}
