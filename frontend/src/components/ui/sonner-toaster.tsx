"use client";

import { Toaster } from "sonner";

/** Mount once in the root layout. */
export function SonnerToaster() {
    return (
        <Toaster
            position="top-center"
            richColors
            closeButton
            toastOptions={{
                classNames: {
                    toast: "border border-border bg-card text-foreground shadow-lg",
                    title: "text-foreground",
                    description: "text-muted-foreground"
                }
            }}
        />
    );
}
