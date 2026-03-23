"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Filter, Search, Trash2 } from "lucide-react";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { AdminUserRow } from "@/types/admin";
import { formatJoinedDate, genderLabel, userRoleBadgeStyles } from "@/lib/admin-ui";
import { cn } from "@/lib/utils";
import userPlaceholder from "@/public/images/user.png";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const PAGE_SIZE = 8;

function capitalizeWordsForDisplay(raw: string): string {
    const trimmed = raw.trim();
    const letters = trimmed.match(/[a-zA-Z]/g) ?? [];
    if (letters.length > 1 && letters.every((ch) => ch === ch.toUpperCase())) {
        // Preserve all-caps acronyms like "USA", "EC", etc.
        return trimmed;
    }
    return trimmed
        .toLocaleLowerCase()
        .replace(/\b([a-zA-Z])/g, (m) => m.toUpperCase());
}

function formatAddress(u: AdminUserRow): string {
    const parts = [u.address_line, u.city, u.region, u.postal_code].filter(Boolean).map((p) =>
        capitalizeWordsForDisplay(String(p))
    );
    return parts.length ? parts.join(", ") : "—";
}

function exportUsersCsv(rows: AdminUserRow[]) {
    const headers = [
        "id",
        "full_name",
        "email",
        "role",
        "hotel_name",
        "gender",
        "address",
        "joined"
    ];
    const lines = [
        headers.join(","),
        ...rows.map((u) =>
            [
                u.id,
                `"${(u.full_name ?? "").replace(/"/g, '""')}"`,
                `"${u.email.replace(/"/g, '""')}"`,
                u.role,
                `"${(u.hotel_name ?? "").replace(/"/g, '""')}"`,
                u.gender ?? "",
                `"${formatAddress(u).replace(/"/g, '""')}"`,
                u.created_at
            ].join(",")
        )
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `marble-stay-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export default function AdminUsersPage() {
    const [users, setUsers] = useState<AdminUserRow[]>([]);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [confirmDeleteUser, setConfirmDeleteUser] = useState<AdminUserRow | null>(null);
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState<"all" | "guest" | "hotel">("all");
    const [page, setPage] = useState(1);

    const loadUsers = useCallback(async () => {
        const token = window.localStorage.getItem("token");
        if (!token) return;
        const res = await fetch(`${API_BASE}/api/admin/users`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
            const data = (await res.json()) as AdminUserRow[];
            setUsers(Array.isArray(data) ? data : []);
        }
    }, []);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return users.filter((u) => {
            if (roleFilter !== "all" && u.role !== roleFilter) return false;
            if (!q) return true;
            const name = (u.full_name ?? "").toLowerCase();
            const email = u.email.toLowerCase();
            const id = u.id.toLowerCase();
            return name.includes(q) || email.includes(q) || id.includes(q);
        });
    }, [users, search, roleFilter]);

    useEffect(() => {
        setPage(1);
    }, [search, roleFilter, users.length]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    async function handleDelete(user: AdminUserRow): Promise<boolean> {
        if (user.role === "admin") return false;
        const token = window.localStorage.getItem("token");
        if (!token) return false;
        setError(null);
        setDeletingId(user.id);
        const res = await fetch(`${API_BASE}/api/admin/users/${user.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
        });
        setDeletingId(null);
        if (res.ok) {
            setUsers((prev) => prev.filter((u) => u.id !== user.id));
            return true;
        } else {
            const body = await res.json().catch(() => ({}));
            setError((body as { error?: string }).error ?? "Failed to delete user");
            return false;
        }
    }

    function requestDelete(user: AdminUserRow) {
        if (user.role === "admin") return;
        setConfirmDeleteUser(user);
        setConfirmDeleteOpen(true);
    }

    return (
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-16">
            <ConfirmDialog
                open={confirmDeleteOpen}
                onClose={() => {
                    setConfirmDeleteOpen(false);
                    setConfirmDeleteUser(null);
                }}
                title="Delete user?"
                description={
                    confirmDeleteUser
                        ? `This will permanently delete ${confirmDeleteUser.email} and all related data. This action cannot be undone.`
                        : "This action cannot be undone."
                }
                confirmLabel="Delete"
                cancelLabel="Cancel"
                variant="destructive"
                confirmLoading={deletingId !== null && confirmDeleteUser?.id === deletingId}
                confirmLoadingLabel="Deleting…"
                onConfirm={() => {
                    if (!confirmDeleteUser) return;
                    void handleDelete(confirmDeleteUser).then((ok) => {
                        if (ok) {
                            setConfirmDeleteOpen(false);
                            setConfirmDeleteUser(null);
                        }
                    });
                }}
            />
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                    User management
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    Manage and monitor system users and their account permissions.
                </p>
            </header>

            {error && (
                <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            <div className="rounded-xl border border-border bg-card shadow-sm">
                <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative max-w-md flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="search"
                            placeholder="Search by name, email or ID"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className={cn(
                                "h-10 w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none",
                                "placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
                            )}
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-muted-foreground" aria-hidden />
                            <label htmlFor="user-role-filter" className="sr-only">
                                Filter by role
                            </label>
                            <select
                                id="user-role-filter"
                                value={roleFilter}
                                onChange={(e) =>
                                    setRoleFilter(e.target.value as "all" | "guest" | "hotel")
                                }
                                className="h-10 rounded-lg border border-border bg-card px-3 text-sm font-medium"
                            >
                                <option value="all">All roles</option>
                                <option value="guest">Guest</option>
                                <option value="hotel">Hotel</option>
                            </select>
                        </div>
                        
                    </div>
                </div>

                {slice.length === 0 ? (
                    <div className="px-5 py-16 text-center text-sm text-muted-foreground">
                        No users match your filters.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1050px] text-left text-sm">
                            <thead>
                                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    <th className="px-5 py-3">User</th>
                                    <th className="px-5 py-3">Email address</th>
                                    <th className="px-5 py-3">Role</th>
                                    <th className="px-5 py-3">Hotel</th>
                                    <th className="px-5 py-3">Gender</th>
                                    <th className="px-5 py-3">Address</th>
                                    <th className="px-5 py-3">Joined</th>
                                    <th className="px-5 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {slice.map((u) => (
                                    <tr
                                        key={u.id}
                                        className="border-b border-border/80 last:border-0 hover:bg-muted/30"
                                    >
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
                                                    {u.avatar_url ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={u.avatar_url}
                                                            alt=""
                                                            className="h-full w-full object-cover"
                                                        />
                                                    ) : (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={userPlaceholder.src}
                                                            alt=""
                                                            className="h-full w-full object-cover"
                                                        />
                                                    )}
                                                </div>
                                                <span className="font-semibold text-foreground">
                                                    {u.full_name?.trim() || "—"}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-muted-foreground">
                                            {u.email}
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className={userRoleBadgeStyles(u.role)}>
                                                {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-muted-foreground capitalize">
                                            {u.hotel_name?.trim() ? u.hotel_name : "—"}
                                        </td>
                                        <td className="max-w-[120px] truncate px-5 py-4 text-muted-foreground">
                                            {genderLabel(u.gender)}
                                        </td>
                                        <td className="max-w-[200px] truncate px-5 py-4 text-muted-foreground">
                                            {formatAddress(u)}
                                        </td>
                                        <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">
                                            {formatJoinedDate(u.created_at)}
                                        </td>
                                        <td className="px-5 py-4 text-right">
                                            <button
                                                type="button"
                                                onClick={() => requestDelete(u)}
                                                disabled={deletingId !== null}
                                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-destructive transition hover:bg-destructive/10 disabled:opacity-40"
                                                aria-label={`Delete ${u.email}`}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {filtered.length > 0 && (
                    <div className="px-5 pb-5">
                        <AdminPagination
                            page={safePage}
                            pageSize={PAGE_SIZE}
                            total={filtered.length}
                            onPageChange={setPage}
                            singularLabel="user"
                            pluralLabel="users"
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
