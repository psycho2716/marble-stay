"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Booking = {
  id: string;
  check_in: string;
  check_out: string;
  status: string;
  payment_status: string;
  total_amount: string;
};

export default function PaymentPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const supabaseToken = localStorage.getItem("supabase_access_token");
    if (!token) return;

    async function load() {
      const res = await fetch(`${API_BASE}/api/bookings`, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(supabaseToken ? { "x-supabase-access-token": supabaseToken } : {})
        }
      });
      if (res.ok) {
        const data = await res.json();
        setBookings(Array.isArray(data) ? data : []);
      }
      setLoading(false);
    }
    load();
  }, []);

  const unpaid = bookings.filter((b) => b.payment_status !== "paid" && b.status !== "cancelled");

  async function markPaid(bookingId: string) {
    const token = localStorage.getItem("token");
    const supabaseToken = localStorage.getItem("supabase_access_token");
    if (!token) return;

    const res = await fetch(`${API_BASE}/api/payments/mark-paid`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(supabaseToken ? { "x-supabase-access-token": supabaseToken } : {})
      },
      body: JSON.stringify({ booking_id: bookingId })
    });
    if (res.ok) {
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, payment_status: "paid" } : b))
      );
    }
  }

  return (
    <RoleGuard allowedRoles={["guest"]}>
      <main className="mx-auto min-h-screen max-w-2xl px-4 py-10">
        <Link href="/" className="text-primary-600 hover:underline">
          ← Back
        </Link>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Payment</h1>
      <p className="mt-1 text-sm text-slate-600">
        Mark bookings as paid or view payment status.
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-slate-600">Loading…</p>
      ) : unpaid.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-center">
          <p className="text-slate-600">No unpaid bookings.</p>
          <Link href="/bookings" className="mt-3 inline-block text-sm font-medium text-primary-600 hover:underline">
            View my bookings
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {unpaid.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4"
            >
              <div>
                <p className="font-medium">
                  {new Date(b.check_in).toLocaleDateString()} → {new Date(b.check_out).toLocaleDateString()}
                </p>
                <p className="text-xs text-slate-600">
                  Status: {b.status} · Payment: {b.payment_status}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-primary-600">₱{b.total_amount}</span>
                <button
                  onClick={() => markPaid(b.id)}
                  className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
                >
                  Mark paid
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      </main>
    </RoleGuard>
  );
}
