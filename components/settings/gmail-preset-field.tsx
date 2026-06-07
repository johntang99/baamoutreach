"use client";

import { useMemo, useState } from "react";

interface GmailPresetFieldProps {
  id: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}

function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function GmailPresetField({
  id,
  name,
  defaultValue = "",
  placeholder = "support@company.com",
  required = false,
}: GmailPresetFieldProps) {
  const [value, setValue] = useState(defaultValue);
  const [lastOpenedAs, setLastOpenedAs] = useState<string | null>(null);

  const normalized = useMemo(() => value.trim().toLowerCase(), [value]);
  const hasValue = normalized.length > 0;
  const validEmail = hasValue && isLikelyEmail(normalized);
  const showInvalid = hasValue && !validEmail;

  function openTestGmail() {
    if (!validEmail) return;

    const composeBase =
      "https://mail.google.com/mail/?view=cm&fs=1&tf=1" +
      `&to=${encodeURIComponent(normalized)}` +
      `&su=${encodeURIComponent("BAAM sender account check")}` +
      `&body=${encodeURIComponent(
        "This is a quick test to confirm this Gmail account opens for BAAM sender setup.",
      )}` +
      `&authuser=${encodeURIComponent(normalized)}`;

    const href =
      "https://accounts.google.com/AccountChooser" +
      `?Email=${encodeURIComponent(normalized)}` +
      `&continue=${encodeURIComponent(composeBase)}`;

    setLastOpenedAs(normalized);
    window.open(href, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={id}
          name={name}
          type="email"
          required={required}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setLastOpenedAs(null);
          }}
          placeholder={placeholder}
          className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={openTestGmail}
          disabled={!validEmail}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Test
        </button>
      </div>
      {showInvalid ? (
        <p className="text-xs text-rose-700">Enter a valid email to test this sender.</p>
      ) : validEmail ? (
        <div className="grid gap-1">
          <p className="text-xs text-slate-600">
            Opening Gmail as: <span className="font-semibold text-slate-800">{normalized}</span>
          </p>
          {lastOpenedAs === normalized ? (
            <p className="text-xs text-emerald-700">
              Test window opened for this sender account.
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Click Test to open Gmail compose with this account selected.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          Test opens Gmail compose with this account selected (no automatic send).
        </p>
      )}
    </div>
  );
}
