"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Re-runs the server render. Every view is a live read; nothing is cached. */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <RefreshCw
        className={`mr-2 h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`}
      />
      {pending ? "Reading…" : "Refresh"}
    </Button>
  );
}
