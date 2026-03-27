/**
 * Domain intent persistence for unauthenticated users.
 * Stores the domain the user wants to purchase before login/signup,
 * so it can be restored after authentication.
 */

const STORAGE_KEY = "ahura:pending-domain";
const SEARCH_KEY = "ahura:domain-search-query";

export interface PendingDomainIntent {
  domain: string;
  price: number | null;
  renewalPrice: number | null;
  currency: string;
  timestamp: number;
}

/** Save a domain the user intends to purchase (pre-login). */
export function savePendingDomain(intent: Omit<PendingDomainIntent, "timestamp">) {
  try {
    const data: PendingDomainIntent = { ...intent, timestamp: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage unavailable (SSR / private browsing)
  }
}

/** Retrieve and clear the pending domain intent. Returns null if expired (>30 min) or absent. */
export function consumePendingDomain(): PendingDomainIntent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw) as PendingDomainIntent;
    localStorage.removeItem(STORAGE_KEY);

    // Expire after 30 minutes
    if (Date.now() - data.timestamp > 30 * 60 * 1000) return null;

    return data;
  } catch {
    // Clear corrupted data so it doesn't block future intents
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
    return null;
  }
}

/** Peek at the pending domain without consuming it. */
export function peekPendingDomain(): PendingDomainIntent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw) as PendingDomainIntent;
    if (Date.now() - data.timestamp > 30 * 60 * 1000) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return data;
  } catch {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
    return null;
  }
}

/** Clear the pending domain without consuming. */
export function clearPendingDomain() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
}

/** Save the last search query so it can be restored on the marketing page. */
export function saveSearchQuery(query: string) {
  try {
    localStorage.setItem(SEARCH_KEY, query);
  } catch {
    // noop
  }
}

/** Get and optionally clear the last search query. */
export function getSearchQuery(clear = false): string | null {
  try {
    const q = localStorage.getItem(SEARCH_KEY);
    if (clear && q) localStorage.removeItem(SEARCH_KEY);
    return q;
  } catch {
    return null;
  }
}
