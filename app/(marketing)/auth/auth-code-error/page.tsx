// app/auth/auth-code-error/page.tsx
import { Suspense } from "react";
import AuthCodeError from "@/components/auth/auth-code-error";

function AuthCodeErrorFallback() {
  //pushing new changes-changes
  return (
    <div className="max-w-md mx-auto mt-16 rounded-xl border p-6 shadow-sm bg-white">
      <h1 className="text-xl font-semibold mb-2">Loading...</h1>
      <div className="animate-pulse bg-gray-200 h-4 rounded mb-2"></div>
      <div className="animate-pulse bg-gray-200 h-4 rounded w-3/4"></div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<AuthCodeErrorFallback />}>
      <AuthCodeError />
    </Suspense>
  );
}
