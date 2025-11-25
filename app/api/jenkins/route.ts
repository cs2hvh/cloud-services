import { getUser } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import cloudflare from "@/lib/cloudflare";
import getJenkinsClient from "@/lib/jenkins";
import { createNodeJsPipeline } from "@/lib/jenkins/pipelines";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

/**
 * Triggers a build for the specified Jenkins job.
 *
 * @param jobName - The name of the Jenkins job to trigger.
 * @param parameters - Optional build parameters for parameterized jobs.
 */
async function triggerJenkinsJob(
  jobName: string,
  parameters?: { [key: string]: string },
): Promise<void> {
  try {
    // If the job is parameterized, pass the parameters.
    // Otherwise, for a non-parameterized job, no additional parameters need to be passed.
    const queueId = await getJenkinsClient().job.build(jobName, parameters);

    console.log(
      `Job "${jobName}" triggered successfully. Queue ID: ${queueId}`,
    );
  } catch (error) {
    console.error(`Error triggering job "${jobName}":`, error);
    throw error;
  }
}

async function createJob(
  name: string,
  github: string,
  branch: string,
  port: string,
) {
  try {
    const jobName = `${name}-job`;
    const pipeline = createNodeJsPipeline(name, github, branch, port);
    // Create job in Jenkins
    await getJenkinsClient().job.create(jobName, pipeline);
    setTimeout(async () => {
      await triggerJenkinsJob(jobName);
    }, 2000);

    console.log(`Job "${jobName}" created successfully!`);
  } catch (error) {
    console.error("Error creating job:", error);
    throw error;
  }
}

// Handle POST requests: create the job and respond
export async function POST(request: Request) {
  try {
    const { name, github, branch, buildCommand, projectId } =
      await request.json();

    if (!name || !github || !branch || !buildCommand) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Get authenticated user
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    // Create service client for database operations
    const supabase = await createServiceClient();

    // Get all used ports from platform_apps table
    const { data: apps, error: appsError } = await supabase
      .from("platform_apps")
      .select("port")
      .not("port", "is", null);

    if (appsError) {
      console.error("Error fetching apps:", appsError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const usedPorts = apps?.map((app) => app.port) || [];

    // Find available port
    let availablePort = null;
    for (let port = 31000; port <= 32000; port++) {
      if (!usedPorts.includes(port)) {
        availablePort = port;
        break;
      }
    }

    if (!availablePort) {
      console.error("No available ports");
      return NextResponse.json({ error: "No available ports" }, { status: 500 });
    }

    // Generate slug from name
    const slug = `${name}-${uuidv4().substring(0, 6)}`;

    // Create app record in database
    const { data: newApp, error: createError } = await supabase
      .from("platform_apps")
      .insert({
        name,
        slug,
        git_provider: "github",
        repository_id: "", // Will be populated later if needed
        repository_name: name,
        repository_url: github,
        branch: branch,
        framework: buildCommand || "nodejs",
        build_command: buildCommand,
        status: "building",
        user_id: user.id,
        port: availablePort,
        ip: process.env.KUBE_IP,
        deployment_url: `https://${name}.uizb210.xyz`,
        project_id: projectId || null,
      })
      .select()
      .single();

    if (createError) {
      console.error("Error creating app:", createError);
      return NextResponse.json({ error: "Failed to create app" }, { status: 500 });
    }

    // Create DNS record in Cloudflare
    await cloudflare.dns.records.create({
      type: "A",
      name,
      proxied: false,
      content: process.env.KUBE_IP,
      ttl: 0,
      zone_id: process.env.CLOUDFLARE_ZONE_ID!,
    });

    // Create Jenkins job
    await createJob(name, github, branch, availablePort.toString());

    // Log the activity if project ID is provided
    if (projectId) {
      await supabase.from("project_logs").insert({
        event: "app_created",
        text: `Created Jenkins app: ${name}`,
        project_id: projectId,
      });
    }

    return NextResponse.json({
      message: "Created App Successfully!",
      app: newApp,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error || "Something went wrong." },
      { status: 500 },
    );
  }
}

// Handle GET requests: list user's apps
export async function GET() {
  try {
    // Get authenticated user
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    // Create client for database operations
    const supabase = await createServiceClient();

    // Get user's apps
    const { data: apps, error } = await supabase
      .from("platform_apps")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching apps:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ apps });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong." }, {
      status: 500,
    });
  }
}

// Handle PATCH requests: update an existing Jenkins job configuration
export async function PATCH(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const appId = searchParams.get("id");

    if (!appId) {
      return NextResponse.json({ error: "App ID required" }, { status: 400 });
    }

    // Get authenticated user
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    // Create service client for database operations
    const supabase = await createServiceClient();

    // Get app details
    const { data: app, error: fetchError } = await supabase
      .from("platform_apps")
      .select("*")
      .eq("id", appId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !app) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }

    // Update Jenkins job with new pipeline configuration
    try {
      const jobName = `${app.name}-job`;
      const pipeline = createNodeJsPipeline(
        app.name,
        app.repository_url,
        app.branch,
        app.port.toString()
      );
      
      await getJenkinsClient().job.config(jobName, pipeline);
      console.log(`Job "${jobName}" updated successfully!`);

      return NextResponse.json({ 
        message: "Job configuration updated successfully!",
        jobName 
      });
    } catch (error) {
      console.error("Error updating Jenkins job:", error);
      return NextResponse.json({ 
        error: "Failed to update Jenkins job configuration" 
      }, { status: 500 });
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong." }, {
      status: 500,
    });
  }
}

// Handle DELETE requests: delete an app
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const appId = searchParams.get("id");

    if (!appId) {
      return NextResponse.json({ error: "App ID required" }, { status: 400 });
    }

    // Get authenticated user
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    // Create service client for database operations
    const supabase = await createServiceClient();

    // Get app details first
    const { data: app, error: fetchError } = await supabase
      .from("platform_apps")
      .select("*")
      .eq("id", appId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !app) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }

    // Delete Jenkins job
    try {
      await getJenkinsClient().job.destroy(`${app.name}-job`);
    } catch (error) {
      console.error("Error deleting Jenkins job:", error);
      // Continue even if Jenkins job deletion fails
    }

    // Delete DNS record from Cloudflare
    try {
      // You might need to store the DNS record ID or fetch it first
      // For now, this is a placeholder
      console.log(`TODO: Delete DNS record for ${app.name}`);
    } catch (error) {
      console.error("Error deleting DNS record:", error);
    }

    // Delete app from database
    const { error: deleteError } = await supabase
      .from("platform_apps")
      .delete()
      .eq("id", appId)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Error deleting app:", deleteError);
      return NextResponse.json({ error: "Failed to delete app" }, { status: 500 });
    }

    // Log the activity if project ID exists
    if (app.project_id) {
      await supabase.from("project_logs").insert({
        event: "app_deleted",
        text: `Deleted Jenkins app: ${app.name}`,
        project_id: app.project_id,
      });
    }

    return NextResponse.json({ message: "App deleted successfully!" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong." }, {
      status: 500,
    });
  }
}
