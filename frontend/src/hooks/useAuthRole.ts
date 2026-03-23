"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type AuthRole = "guest" | "hotel" | "admin";

export type AuthState = {
  role: AuthRole | null;
  loading: boolean;
  isAuthenticated: boolean;
};

export function useAuthRole(): AuthState {
  const [role, setRole] = useState<AuthRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const token =
      typeof window !== "undefined" ? window.localStorage.getItem("token") : null;

    if (!token) {
      setRole(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const r = data?.role;
        if (r === "guest" || r === "hotel" || r === "admin") {
          setRole(r);
        } else {
          setRole(null);
        }
      })
      .catch(() => {
        if (!cancelled) setRole(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    role,
    loading,
    isAuthenticated: role !== null,
  };
}
