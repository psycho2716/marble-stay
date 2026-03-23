"use client";

import { MarbleRealtimeProvider } from "@/contexts/MarbleRealtimeProvider";
import { NavbarSwitcher } from "@/components/NavbarSwitcher";
import { FooterSwitcher } from "@/components/FooterSwitcher";
import { GuestOnboardingGuard } from "@/components/GuestOnboardingGuard";

export function AppChrome({ children }: { children: React.ReactNode }) {
    return (
        <MarbleRealtimeProvider>
            <NavbarSwitcher />
            <GuestOnboardingGuard>
                <main className="flex-1">{children}</main>
            </GuestOnboardingGuard>
            <FooterSwitcher />
        </MarbleRealtimeProvider>
    );
}
