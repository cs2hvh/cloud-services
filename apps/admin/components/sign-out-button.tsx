"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();

  // Same-origin, like sign-in: the server clears the session cookies. Signing
  // out must not depend on the browser reaching a third-party domain — being
  // unable to LEAVE a session is worse than being unable to enter one.
  const handleSignOut = async () => {
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => null);
    router.replace("/signin");
    router.refresh();
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleSignOut}>
      <LogOut className="mr-2 h-4 w-4" />
      Sign out
    </Button>
  );
}
