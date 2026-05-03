import type { ReactNode } from "react";
import { RoleGuard } from "@/components/RoleGuard";

export default function AdminLayout({ children }: { children: ReactNode }) {
    return (
        <RoleGuard allowedRoles={["admin"]}>
            <div className="flex min-h-0 flex-1 flex-col bg-background">
                <div className="flex flex-1 flex-col">{children}</div>
            </div>
        </RoleGuard>
    );
}
