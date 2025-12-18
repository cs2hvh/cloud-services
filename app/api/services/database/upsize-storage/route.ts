import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters, Projects } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";
import { upsizeStorageSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";

export async function PUT(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();

    // ✅ VALIDATE REQUEST PAYLOAD
    const validation = validateRequest(upsizeStorageSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;

    // Get current database cluster details
    const clusterData = await Database_Clusters.read(validatedData.database_id);
    if (!clusterData.success || !clusterData.data) {
      return NextResponse.json(
        { error: "Database cluster not found" },
        { status: 404 }
      );
    }

    const currentSize = clusterData.data.size;
    const currentStorageMib = clusterData.data.storage_size_mib || 0;
    const engine = clusterData.data.engine || "pg";

    // Validate that new storage is greater than current
    if (validatedData.storage_size_mib <= currentStorageMib) {
      return NextResponse.json(
        { error: "New storage size must be greater than current storage size" },
        { status: 400 }
      );
    }

    // Storage limits based on engine and RAM
    const STORAGE_LIMITS: Record<string, Record<string, { minGiB: number; maxGiB: number }>> = {
      pg: {
        "1gb": { minGiB: 10, maxGiB: 30 },
        "2gb": { minGiB: 30, maxGiB: 60 },
        "4gb": { minGiB: 60, maxGiB: 120 },
        "8gb": { minGiB: 140, maxGiB: 280 },
        "16gb": { minGiB: 290, maxGiB: 580 },
      },
      mysql: {
        "1gb": { minGiB: 10, maxGiB: 30 },
        "2gb": { minGiB: 30, maxGiB: 60 },
        "4gb": { minGiB: 60, maxGiB: 120 },
        "8gb": { minGiB: 140, maxGiB: 280 },
        "16gb": { minGiB: 290, maxGiB: 580 },
      },
      mongodb: {
        "1gb": { minGiB: 15, maxGiB: 25 },
        "2gb": { minGiB: 34, maxGiB: 54 },
        "32gb": { minGiB: 504, maxGiB: 1014 },
      },
    };

    // Extract RAM from size string
    const ramMatch = currentSize.match(/(\d+)gb/i);
    const ram = ramMatch ? `${ramMatch[1]}gb` : "4gb";

    // Get limits for the engine and RAM combination
    const limits = STORAGE_LIMITS[engine]?.[ram];
    
    if (limits) {
      const maxAllowedMib = limits.maxGiB * 1024;
      if (validatedData.storage_size_mib > maxAllowedMib) {
        return NextResponse.json(
          { error: `Storage size cannot exceed ${limits.maxGiB} GiB for ${engine} with ${ram} RAM` },
          { status: 400 }
        );
      }
    }

    const payload = {
      size: currentSize,
      num_nodes: 1,
      storage_size_mib: validatedData.storage_size_mib,
    };

    // Resize database cluster via DigitalOcean API
    const response = await axios.put(
      `https://api.digitalocean.com/v2/databases/${validatedData.database_id}/resize`,
      payload,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(
      "[upsize-storage] Database storage upsize response:",
      response.status,
      response.statusText
    );

    if (response.status === 202 || response.status === 204) {
      // Update Supabase with new storage size
      const supabaseUpdate = await Database_Clusters.update_storage_size(
        validatedData.database_id,
        validatedData.storage_size_mib
      );

      if (!supabaseUpdate.success) {
        console.error(
          "[upsize-storage] Failed to update Supabase:",
          supabaseUpdate.error
        );
        // Still return success as DigitalOcean update was successful
      }

      // Add activity log for storage upsize
      if (clusterData.data.project_id) {
        await Projects.add_log({
          project_id: clusterData.data.project_id,
          event: "Settings",
          text: `Database storage upsized to: ${(validatedData.storage_size_mib / 1024).toFixed(0)} GiB`
        });
        console.log(`[upsize-storage] ✅ Activity log added for storage upsize`);
      }

      return NextResponse.json(
        {
          message: "Storage upsize initiated. It will reflect changes in some time",
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: "Failed to upsize database storage" },
      { status: response.status }
    );
  } catch (err: unknown) {
    console.error("[upsize-storage] Error:", err);
    
    if (axios.isAxiosError(err)) {
      return NextResponse.json(
        {
          error:
            err.response?.data?.message ||
            err.message ||
            "Failed to upsize database storage",
        },
        { status: err.response?.status || 500 }
      );
    }

    if (err instanceof Error) {
      return NextResponse.json(
        { error: err.message || "Failed to upsize database storage" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
