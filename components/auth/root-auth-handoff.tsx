"use client";

import { useEffect, useRef } from "react";

const AUTH_PARAM_KEYS = [
  "code",
  "access_token",
  "refresh_token",
  "error",
  "error_code",
  "error_description",
  "type",
  "expires_in",
  "expires_at",
];

function hasAuthSignal(searchParams: URLSearchParams, hashParams: URLSearchParams) {
  return AUTH_PARAM_KEYS.some(
    (key) => searchParams.has(key) || hashParams.has(key),
  );
}

export function RootAuthHandoff() {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const searchParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(hash);

    if (!hasAuthSignal(searchParams, hashParams)) {
      return;
    }

    if (!searchParams.get("next")) {
      searchParams.set("next", "/app");
    }

    const nextSearch = searchParams.toString();
    const nextHash = hash ? `#${hash}` : "";
    window.location.replace(`/auth/callback?${nextSearch}${nextHash}`);
  }, []);

  return null;
}
