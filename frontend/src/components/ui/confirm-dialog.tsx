"use client";

import { useEffect, useId } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export type ConfirmDialogProps = {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: ReactNode;
    /** Rendered between the description and the action buttons (e.g. form fields). */
    children?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "default" | "destructive";
    onConfirm: () => void;
    /** When true, confirm button is disabled (e.g. while a request is in flight). */
    confirmLoading?: boolean;
    confirmLoadingLabel?: string;
};

export function ConfirmDialog({
    open,
    onClose,
    title,
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    variant = "default",
    onConfirm,
    children,
    confirmLoading = false,
    confirmLoadingLabel = "Working…"
}: ConfirmDialogProps) {
    const titleId = useId();
    const descId = useId();

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !confirmLoading) onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose, confirmLoading]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <button
                type="button"
                aria-label="Dismiss"
                disabled={confirmLoading}
                className="absolute inset-0 bg-black/50 disabled:cursor-not-allowed"
                onClick={() => !confirmLoading && onClose()}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={description ? descId : undefined}
                className="relative z-[101] w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
            >
                <h2 id={titleId} className="text-lg font-semibold text-foreground">
                    {title}
                </h2>
                {description ? (
                    <div id={descId} className="mt-2 text-sm text-muted-foreground">
                        {description}
                    </div>
                ) : null}
                {children ? <div className="mt-4">{children}</div> : null}
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        disabled={confirmLoading}
                    >
                        {cancelLabel}
                    </Button>
                    <Button
                        type="button"
                        variant={variant === "destructive" ? "destructive" : "default"}
                        disabled={confirmLoading}
                        onClick={() => onConfirm()}
                    >
                        {confirmLoading ? confirmLoadingLabel : confirmLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
}
