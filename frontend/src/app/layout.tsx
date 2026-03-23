import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { AppChrome } from "@/components/AppChrome";
import { SonnerToaster } from "@/components/ui/sonner-toaster";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
    title: "Marble Stay — Romblon Hotels",
    description: "Centralized Romblon hotel booking with micro-stays and recommendations."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={cn(inter.variable)} suppressHydrationWarning>
            <body className="flex min-h-screen flex-col bg-background text-foreground">
                <AppChrome>{children}</AppChrome>
                <SonnerToaster />
            </body>
        </html>
    );
}
