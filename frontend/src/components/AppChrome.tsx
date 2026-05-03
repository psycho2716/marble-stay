"use client";

import { MarbleRealtimeProvider } from "@/contexts/MarbleRealtimeProvider";
import { NavbarSwitcher } from "@/components/NavbarSwitcher";
import { FooterSwitcher } from "@/components/FooterSwitcher";
import { GuestOnboardingGuard } from "@/components/GuestOnboardingGuard";
import { AuthCookieSync } from "@/components/AuthCookieSync";

export function AppChrome({ children }: { children: React.ReactNode }) {
    return (
        <MarbleRealtimeProvider>
            <AuthCookieSync />
            <NavbarSwitcher />
            <GuestOnboardingGuard>
                <main className="flex-1">{children}</main>
            </GuestOnboardingGuard>
            <FooterSwitcher />
        </MarbleRealtimeProvider>
    );
}
