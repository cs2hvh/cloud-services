import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { Projects } from "@/lib/supabase/queries/projects";
import { authenticateUser } from "@/lib/auth/server-auth";
import { deleteNetworkSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";
import { Rule } from "@/lib/supabase/types";
import { NotificationService, createServiceNotification } from "@/lib/notifications";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();

    // ✅ VALIDATE REQUEST PAYLOAD
    const validation = validateRequest(deleteNetworkSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;

    // Step 1: Fetch current firewall rules from DigitalOcean
    const read_firewall = await axios.get(
      `https://api.digitalocean.com/v2/databases/${validatedData.id}/firewall`,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (read_firewall.status !== 200) {
      return NextResponse.json(
        { error: "Failed to fetch current firewall rules" },
        { status: read_firewall.status }
      );
    }

    const currentRules = read_firewall.data?.rules || [];
    // console.log("Current firewall rules:", currentRules);

    // Step 2: Filter out the rule to delete
    const remainingRules = currentRules.filter(
      (rule: Rule) => rule.uuid !== validatedData.rule_uuid
    );

    // console.log("Remaining rules after deletion:", remainingRules);

    // Find the deleted rule for logging
    const deletedRule = currentRules.find(
      (rule: Rule) => rule.uuid === validatedData.rule_uuid
    );
    const deletedRuleValue = deletedRule?.value || 'unknown IP';

    // Step 3: Update DigitalOcean firewall with remaining rules
    const payload = {
      rules: remainingRules,
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
    //   "Update firewall response:",
    //   update_firewall.status,
    //   update_firewall.statusText
    // );

    if (update_firewall.status === 204) {
      // Step 4: Fetch updated firewall rules to confirm
      const read_updated_firewall = await axios.get(
        `https://api.digitalocean.com/v2/databases/${validatedData.id}/firewall`,
        {
          headers: {
            Authorization: process.env.DIGITAL_OCEAN_TOKEN,
            "Content-Type": "application/json",
          },
        }
      );

      if (read_updated_firewall.status === 200) {
        // console.log(
        //   "Updated firewall rules:",
        //   read_updated_firewall.data?.rules
        // );

        // Step 5: Update Supabase with new rules
        const supabase_update = await Database_Clusters.update_network_rules(
          validatedData.id,
          read_updated_firewall.data?.rules
        );

        if (supabase_update.success) {
          // Add activity log for firewall rule deletion
          const clusterData = await Database_Clusters.read(validatedData.id);
          if (clusterData.success && clusterData.data.project_id) {
            await Projects.add_log({
              project_id: clusterData.data.project_id,
              event: "Shield",
              text: `Removed firewall rule: ${deletedRuleValue}`
            });
            console.log(`[deleteNetworkRule] ✅ Activity log added for firewall rule deletion`);
          }

          // Create notification for firewall rule deletion
          if (clusterData.success) {
            try {
              await NotificationService.create(
                createServiceNotification({
                  userId: clusterData.data.owner_id,
                  type: 'info',
                  action: 'updated',
                  serviceType: 'database',
                  serviceName: clusterData.data.name,
                  serviceId: validatedData.id,
                  metadata: { updateType: 'firewall_deleted', ipAddress: deletedRuleValue }
                })
              );
            } catch (notifErr) {
              console.error('[deleteNetworkRule] Failed to create notification:', notifErr);
            }
          }
          
          return NextResponse.json(
            {
              message: "IP address deleted successfully",
            },
            { status: 200 }
          );
        } else {
          console.error(
            "Failed to update Supabase:",
            supabase_update.error
          );
          // Still return success as DigitalOcean update was successful
          return NextResponse.json(
            {
              message:
                "IP address deleted from firewall, but failed to update database",
            },
            { status: 200 }
          );
        }
      }
    }

    return NextResponse.json(
      { error: "Failed to delete IP address from firewall" },
      { status: update_firewall.status }
    );
  } catch (err: unknown) {
    console.error("[delete network rule] Error:", err);

    if (axios.isAxiosError(err)) {
      return NextResponse.json(
        {
          error:
            err.response?.data?.message ||
            err.message ||
            "Failed to delete IP address",
        },
        { status: err.response?.status || 500 }
      );
    }

    if (err instanceof Error) {
      return NextResponse.json(
        { error: err.message ?? "Invalid request" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Unknown error occurred" },
      { status: 500 }
    );
  }
}
