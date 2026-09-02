/**
 * The navbar must not refresh the route on every auth event.
 *
 * THE BUG THIS LOCKS OUT
 *
 * The 404 page reloaded itself forever — a visible flicker, as fast as the
 * network allowed. The cause was in NavbarClient:
 *
 *   onAuthStateChange((event) => {
 *     if (event === "SIGNED_IN" || event === "SIGNED_OUT") router.refresh();
 *   })
 *
 * onAuthStateChange does not fire only on a genuine sign-in. It fires on
 * subscribe, on token refresh, and when the tab regains focus. Each of those
 * triggered router.refresh(), which re-rendered the tree, which unmounted and
 * remounted this component, which subscribed again, which produced another
 * event. Self-feeding.
 *
 * WHY ONLY THE 404 PAGE
 *
 * Marketing pages render <Navbar> from app/(marketing)/layout.tsx, and a
 * layout survives router.refresh() — React reconciles it in place, so the
 * subscription is never torn down and the cycle never closes.
 * app/not-found.tsx renders <Navbar> inside the PAGE, so every refresh
 * remounted it. Same component, same events, different mounting position.
 *
 * That is the part worth remembering: the defect was latent everywhere and
 * only became visible where the component happened to sit.
 *
 * The fix compares user identity across events instead of trusting the event
 * name, so a repeated event for the same user is a no-op and the cycle cannot
 * close regardless of where the component is mounted. These tests assert that
 * property directly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, waitFor } from "@testing-library/react";

const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn() }),
  usePathname: () => "/this-page-does-not-exist",
}));

// Captured so a test can drive the auth callback the way Supabase would.
let authCallback: ((event: string, session: unknown) => void) | null = null;
const unsubscribe = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe } } };
      },
    },
  }),
}));

vi.mock("motion/react", async () => {
  const React = await import("react");
  const ANIMATION_PROPS = new Set([
    "initial", "animate", "exit", "transition",
    "whileHover", "whileTap", "whileInView", "variants", "layout", "layoutId",
  ]);
  const cache = new Map<string, React.ComponentType<Record<string, unknown>>>();
  const stub = new Proxy({} as Record<string, unknown>, {
    get: (_t, tag: string) => {
      const hit = cache.get(tag);
      if (hit) return hit;
      const El = ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement(
          tag,
          Object.fromEntries(Object.entries(rest).filter(([k]) => !ANIMATION_PROPS.has(k))),
          children
        );
      El.displayName = `motion.${tag}`;
      cache.set(tag, El);
      return El;
    },
  });
  return { motion: stub, AnimatePresence: ({ children }: React.PropsWithChildren) => children };
});

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as React.ImgHTMLAttributes<HTMLImageElement>)} />;
  },
}));

import { NavbarClient } from "@/components/navbar-client";

const session = (id: string | null) =>
  id === null ? null : { user: { id, email: `${id}@example.com` } };

describe("NavbarClient auth-state refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authCallback = null;
  });

  it("does not refresh on the first event", async () => {
    render(<NavbarClient initialUser={null} />);
    await waitFor(() => expect(authCallback).not.toBeNull());

    // Supabase emits as soon as you subscribe. Refreshing here is what starts
    // the loop on any page that remounts the navbar.
    act(() => authCallback!("SIGNED_IN", session("user-1")));

    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("does not refresh when the same user is re-announced", async () => {
    render(<NavbarClient initialUser={null} />);
    await waitFor(() => expect(authCallback).not.toBeNull());

    // Token refresh, tab refocus, a remount replaying the session — all of
    // these repeat SIGNED_IN for a user who never changed.
    act(() => authCallback!("SIGNED_IN", session("user-1")));
    act(() => authCallback!("SIGNED_IN", session("user-1")));
    act(() => authCallback!("TOKEN_REFRESHED", session("user-1")));
    act(() => authCallback!("SIGNED_IN", session("user-1")));

    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("refreshes once when someone actually signs in", async () => {
    render(<NavbarClient initialUser={null} />);
    await waitFor(() => expect(authCallback).not.toBeNull());

    // first event: signed out
    act(() => authCallback!("INITIAL_SESSION", null));
    // real transition
    act(() => authCallback!("SIGNED_IN", session("user-1")));

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes once when someone signs out", async () => {
    render(<NavbarClient initialUser={null} />);
    await waitFor(() => expect(authCallback).not.toBeNull());

    act(() => authCallback!("INITIAL_SESSION", session("user-1")));
    act(() => authCallback!("SIGNED_OUT", null));

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("survives a remount without refreshing — the 404 case", async () => {
    // not-found.tsx renders the navbar inside the page, so every refresh
    // remounts it and replays the session. Ten remounts must still be silent;
    // before the fix, one was enough to start the loop.
    for (let i = 0; i < 10; i++) {
      const { unmount } = render(<NavbarClient initialUser={null} />);
      await waitFor(() => expect(authCallback).not.toBeNull());
      act(() => authCallback!("SIGNED_IN", session("user-1")));
      unmount();
    }

    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("unsubscribes on unmount", async () => {
    const { unmount } = render(<NavbarClient initialUser={null} />);
    await waitFor(() => expect(authCallback).not.toBeNull());
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
