/**
 * DNS Cache Implementation
 * Caches DNS resolution results to avoid repeated lookups
 */

interface CacheEntry {
  ip: string;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class DNSCache {
  private cache: Map<string, CacheEntry>;
  private defaultTTL: number;
  private maxSize: number;

  constructor(
    defaultTTL: number = 5 * 60 * 1000, // 5 minutes default
    maxSize: number = 1000
  ) {
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
    this.maxSize = maxSize;
  }

  /**
   * Get cached IP for a hostname
   */
  get(host: string): string | null {
    const entry = this.cache.get(host);
    
    if (!entry) {
      return null;
    }

    // Check if entry is still valid
    if (this.isValid(entry)) {
      return entry.ip;
    }

    // Entry expired, remove it
    this.cache.delete(host);
    return null;
  }

  /**
   * Cache a DNS resolution result
   */
  set(host: string, ip: string, ttl?: number): void {
    // Enforce max cache size (LRU eviction)
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(host, {
      ip,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });
  }

  /**
   * Check if cache entry is still valid
   */
  private isValid(entry: CacheEntry): boolean {
    const age = Date.now() - entry.timestamp;
    return age < entry.ttl;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [host, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= entry.ttl) {
        this.cache.delete(host);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      entries: Array.from(this.cache.entries()).map(([host, entry]) => ({
        host,
        ip: entry.ip,
        age: Date.now() - entry.timestamp,
        ttl: entry.ttl,
      })),
    };
  }
}

// Singleton instance
export const dnsCache = new DNSCache(
  parseInt(process.env.DNS_CACHE_TTL || "300000"), // 5 minutes
  parseInt(process.env.DNS_CACHE_MAX_SIZE || "1000")
);

// Cleanup expired entries every 10 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    dnsCache.cleanup();
    console.log("[DNS Cache] Cleanup completed");
  }, parseInt(process.env.DNS_CACHE_CLEANUP_INTERVAL || "600000"));
}
