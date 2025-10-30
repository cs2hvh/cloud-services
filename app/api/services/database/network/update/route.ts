import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters, Projects } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";
import { updateNetworkSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";
import { Rule } from "@/lib/supabase/types";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();

    // ✅ VALIDATE REQUEST PAYLOAD
    const validation = validateRequest(updateNetworkSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;

    // ✅ STEP 1: Read existing firewall rules first
    const read_existing_firewall = await axios.get(
      `https://api.digitalocean.com/v2/databases/${validatedData.id}/firewall`,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (read_existing_firewall.status !== 200) {
      return NextResponse.json(
        { error: "Failed to fetch existing firewall rules" },
        { status: 500 }
      );
    }

    const existingRules = read_existing_firewall.data?.rules || [];
    // console.log("Existing firewall rules:", existingRules);

    // ✅ STEP 2: Check if the IP already exists (prevent duplicates)
    const ipExists = existingRules.some(
      (rule: Rule) =>
        rule.type === "ip_addr" && rule.value === validatedData.ip_address
    );

    if (ipExists) {
      return NextResponse.json(
        { error: "This IP address already exists in the firewall rules" },
        { status: 400 }
      );
    }

    // ✅ STEP 3: Append the new rule to existing rules
    const newRule = {
      type: "ip_addr",
      value: validatedData.ip_address,
    };

    const updatedRules = [...existingRules, newRule];
    // console.log("Updated rules array:", updatedRules);

    // ✅ STEP 4: Update firewall with ALL rules (existing + new)
    const payload = {
      rules: updatedRules,
    };

    const update_firewall = await axios.put(
      `https://api.digitalocean.com/v2/databases/${validatedData.id}/firewall`,
      payload,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    // console.log(
    //   update_firewall.status,
    //   "...........update firewall response status..........."
    // );

    if (update_firewall.status === 204) {
      // ✅ STEP 5: Read back the updated firewall rules to confirm
      const read_firewall = await axios.get(
      `https://api.digitalocean.com/v2/databases/${validatedData.id}/firewall`,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (read_firewall.status === 200) {
      // console.log(
      //   read_firewall.data,
      //   "...........read firewall response after update..........."
      // );

      // ✅ Update Supabase with the new rules
      const supabase_read = await Database_Clusters.update_network_rules(
        validatedData.id,
        read_firewall.data?.rules
      );

      if (supabase_read.success) {
        // Add activity log for firewall rule addition
        const clusterData = await Database_Clusters.read(validatedData.id);
        if (clusterData.success && clusterData.data.project_id) {
          await Projects.add_log({
            project_id: clusterData.data.project_id,
            event: "Shield",
            text: `Added firewall rule: ${validatedData.ip_address}`
          });
          // console.log(`[updateNetworkRules] ✅ Activity log added for firewall rule addition`);
        }
        
        return NextResponse.json(
          {
            message: "IP address added to firewall successfully",
            rules: read_firewall.data?.rules,
          },
          { status: 200 }
        );
      } else {
        return NextResponse.json(
          {
            error: "Firewall updated but failed to sync with database",
          },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Failed to verify firewall update" },
        { status: 500 }
      );
    }
  } else {
    return NextResponse.json(
      { error: "Failed to update firewall rules" },
      { status: update_firewall.status }
    );
  }
  } catch (err: unknown) {
    if (err instanceof Error) {
      return NextResponse.json(
        { error: err.message ?? "Invalid request" },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        { error: "Unknown error occurred" },
        { status: 400 }
      );
    }
  }
}
