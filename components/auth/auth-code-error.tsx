"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  identity_already_exists:
    "This account is already linked to another user. Please sign in with that provider on the correct account, or disconnect it there first.",
  access_denied:
    "Access was denied by the provider. Please try again or choose a different provider.",
  invalid_grant:
    "Your session has expired or is invalid. Please try signing in again.",
  server_error: "We hit a server issue. Please try again in a moment.",
};

function getFriendlyMessage(code?: string, fallback?: string) {
  if (!code) return fallback || "Something went wrong. Please try again.";
  return (
    ERROR_MESSAGES[code] ||
    fallback ||
    "Something went wrong. Please try again."
  );
}

function parseHashParams(hash: string) {
  // hash like: #error=server_error&error_code=identity_already_exists&error_description=...
  const out: Record<string, string> = {};
  const clean = hash.replace(/^#/, "");
  const params = new URLSearchParams(clean);
  params.forEach((v, k) => (out[k] = v));
  return out;
}

export default function AuthCodeError() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [hashParams, setHashParams] = useState<Record<string, string>>({});

  useEffect(() => {
    // Supabase often puts errors in the hash fragment
    if (typeof window !== "undefined" && window.location.hash) {
      setHashParams(parseHashParams(window.location.hash));
    }
  }, []);

  const { code, description } = useMemo(() => {
    // Prefer explicit query params first
    const qp = {
      error: searchParams.get("error") || undefined,
      error_code: searchParams.get("error_code") || undefined,
      error_description: searchParams.get("error_description") || undefined,
    };

    // Fallback to hash params if query is empty
    const hp = {
      error: hashParams["error"],
      error_code: hashParams["error_code"],
      error_description: hashParams["error_description"],
    };

    const effectiveCode =
      qp.error_code || hp.error_code || qp.error || hp.error;
    const effectiveDesc = qp.error_description || hp.error_description;

    return { code: effectiveCode, description: effectiveDesc };
  }, [searchParams, hashParams]);

  const message = getFriendlyMessage(code, description);

  return (
    <div className="max-w-md mx-auto mt-16 rounded-xl border p-6 shadow-sm bg-white">
      <h1 className="text-xl font-semibold mb-2">Sign-in Error</h1>
      <p className="text-red-700 bg-red-50 border border-red-200 rounded-md p-3 mb-4">
        {message}
      </p>

      {/* Helpful tips for common case */}
      {code === "identity_already_exists" && (
        <div className="text-sm text-gray-700 space-y-2 mb-4">
          <p>What you can do:</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>
              Sign in with the provider that’s already linked to your original
              account.
            </li>
            <li>
              Or sign into that original account and disconnect the provider
              there, then try linking again here.
            </li>
            <li>
              If you used a different email on the provider, check which account
              has it linked.
            </li>
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/signin")}
          className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90"
        >
          Try again
        </button>
        <Link href="/" className="px-4 py-2 rounded-lg border hover:bg-gray-50">
          Go home
        </Link>
      </div>

      {/* Debug details (collapsed/optional) */}
      {process.env.NODE_ENV !== "production" && (code || description) && (
        <details className="mt-6 text-xs text-gray-500">
          <summary>Debug details</summary>
          <div className="mt-2 space-y-1">
            <div>
              <span className="font-mono">error_code</span>: {code || "-"}
            </div>
            <div>
              <span className="font-mono">error_description</span>:{" "}
              {description || "-"}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
