"use client";

import { CheckCircle2 } from "lucide-react";

type SuccessAlertProps = {
  title: string;
  description?: string;
  className?: string;
};

export function SuccessAlert({ title, description, className = "" }: SuccessAlertProps) {
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border border-success-100 bg-success-50 px-4 py-3 text-success-800 ${className}`}
      role="alert"
    >
      <CheckCircle2 className="h-5 w-5 shrink-0 text-success-500" aria-hidden />
      <div>
        <p className="font-semibold">{title}</p>
        {description && <p className="mt-0.5 text-sm opacity-90">{description}</p>}
      </div>
    </div>
  );
}
