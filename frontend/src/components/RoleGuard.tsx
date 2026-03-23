"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AuthRole } from "@/hooks/useAuthRole";
import { useAuthRole } from "@/hooks/useAuthRole";

const DEFAULT_REDIRECT: Record<AuthRole, string> = {
  guest: "/",
  hotel: "/hotel/dashboard",
  admin: "/admin/verification",
};

type RoleGuardProps = {
  allowedRoles: AuthRole[];
  children: React.ReactNode;
  /** Where to send unauthenticated users. Default: /login */
  loginPath?: string;
  /** Where to send authenticated users with wrong role. Default: by role (guest->/, hotel->/hotel/dashboard, admin->/admin/verification) */
  wrongRoleRedirect?: string;
};

/**
 * Protects content by role. Redirects if not authenticated or if role is not in allowedRoles.
 */
export function RoleGuard({
  allowedRoles,
  children,
  loginPath = "/login",
  wrongRoleRedirect,
}: RoleGuardProps) {
  const router = useRouter();
  const { role, loading, isAuthenticated } = useAuthRole();

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated || role === null) {
      router.replace(loginPath);
      return;
    }

    if (!allowedRoles.includes(role)) {
      const target = wrongRoleRedirect ?? DEFAULT_REDIRECT[role];
      router.replace(target);
    }
  }, [loading, isAuthenticated, role, allowedRoles, loginPath, wrongRoleRedirect, router]);

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-sm text-slate-500">Checking access…</p>
      </div>
    );
  }

  if (!isAuthenticated || role === null || !allowedRoles.includes(role)) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-sm text-slate-500">Redirecting…</p>
      </div>
    );
  }

  return <>{children}</>;
}
