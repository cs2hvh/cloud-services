/**
 * Port Allocator Service - Manages NodePort allocation
 */
import { Platform_Apps } from "@/lib/supabase/queries";

export class PortAllocator {
  private static readonly PORT_RANGE_START = 31000;
  private static readonly PORT_RANGE_END = 32000;

  /**
   * Allocate an available port from the NodePort range
   */
  static async allocate(): Promise<number | null> {
    console.log(`[PortAllocator] Finding available port in range ${this.PORT_RANGE_START}-${this.PORT_RANGE_END}`);

    try {
      // Get all apps to find used ports
      const apps = await Platform_Apps.list_by_owner(""); // Gets all apps via service role
      
      const usedPorts = apps
        .map((app: any) => app.port)
        .filter((port: any) => port !== null && port !== undefined);

      console.log(`[PortAllocator] Found ${usedPorts.length} ports in use`);

      // Find first available port
      for (let port = this.PORT_RANGE_START; port <= this.PORT_RANGE_END; port++) {
        if (!usedPorts.includes(port)) {
          console.log(`[PortAllocator] ✅ Allocated port: ${port}`);
          return port;
        }
      }

      console.error(`[PortAllocator] ❌ No available ports in range`);
      return null;
    } catch (error: any) {
      console.error(`[PortAllocator] ❌ Error:`, error?.message);
      return null;
    }
  }

  /**
   * Check if a port is available
   */
  static async isAvailable(port: number): Promise<boolean> {
    try {
      const apps = await Platform_Apps.list_by_owner("");
      const usedPorts = apps
        .map((app: any) => app.port)
        .filter((p: any) => p !== null && p !== undefined);

      return !usedPorts.includes(port);
    } catch (error) {
      return false;
    }
  }
}
