"use client";

import { useState } from "react";

interface PasswordFieldProps {
  name: string;
  label: string;
  minLength?: number;
  required?: boolean;
}

export function PasswordField({
  name,
  label,
  minLength = 8,
  required = false,
}: PasswordFieldProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <label className="grid gap-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="relative">
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-16 text-sm"
          type={showPassword ? "text" : "password"}
          name={name}
          minLength={minLength}
          autoComplete="new-password"
          required={required}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-2 my-auto text-xs font-medium text-slate-500 hover:text-slate-700"
          onClick={() => setShowPassword((prev) => !prev)}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
      <span className="text-[11px] text-slate-500">Use at least 8 characters.</span>
    </label>
  );
}
