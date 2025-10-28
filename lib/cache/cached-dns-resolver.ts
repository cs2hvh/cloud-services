/**
 * Cached DNS Resolver
 * Wraps DNS resolution with caching layer for performance
 */

import { resolveHost } from "@/config/hosttoip";
import { dnsCache } from "./dns-cache";

/**
 * Resolve hostname to IP with caching
 * Checks cache first, falls back to DNS resolution if cache miss
 */
export async function resolveCached(host: string): Promise<string> {
  if (!host) {
    return host;
  }

  // Check cache first
  const cached = dnsCache.get(host);
  if (cached) {
    console.log(`✓ DNS Cache HIT for ${host} -> ${cached}`);
    return cached;
  }

  // Cache miss - perform DNS resolution
  console.log(`✗ DNS Cache MISS for ${host}, resolving...`);
  
  try {
    const result = await resolveHost(host);
    
    // Extract first IP from records
    const ip = result.records[0]?.records[0] as string;
    
    // If no IP found or resolution failed, return original host
    if (!ip || result.error) {
      console.warn(`⚠ No IP found for ${host}, using original host`);
      return host;
    }
    
    // Cache the result only if we got a valid IP
    dnsCache.set(host, ip);
    
    console.log(`✓ Resolved ${host} -> ${ip} (cached)`);
    return ip;
  } catch (error) {
    console.error(`✗ Failed to resolve ${host}:`, error);
    // Return original host on error
    return host;
  }
}

/**
 * Resolve multiple hosts in parallel with caching
 */
export async function resolveCachedParallel(
  hosts: string[]
): Promise<string[]> {
  return Promise.all(hosts.map((host) => resolveCached(host)));
}
