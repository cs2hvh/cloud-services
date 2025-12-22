import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import {Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { Billing } from "@/lib/supabase/queries/billing";
import { Encryption } from "@/config/functions";
import {
  createDatabaseSchema,
  validateEngineVersion,
} from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";
import { DatabaseUser } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/server";
import { ensureBalance, postProvisionBilling } from "@/config/billing-flow";
import { getRatesForDatabase } from "@/config/pricing";

interface database_error {
  response: {
    data: { message: string };
  };
}

// Helper function to check if user is admin
async function checkAdminAuth() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { authorized: false, user: null };
  }

  // Get user profile to check roles
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("roles")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.roles?.includes("admin");

  return { authorized: isAdmin, user };
}

export async function POST(req: NextRequest) {
  // Check admin authentication
  const { authorized } = await checkAdminAuth();
  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();

    // ✅ VALIDATE REQUEST PAYLOAD
    const validation = validateRequest(createDatabaseSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;

    // Additional validation: Check engine-specific version
    if (!validateEngineVersion(validatedData.engine, validatedData.version)) {
      return NextResponse.json(
        {
          error: "Invalid version for selected engine",
          message: `Version ${validatedData.version} is not valid for engine ${validatedData.engine}`,
        },
        { status: 400 }
      );
    }

    // Billing: upfront and hourly (dynamic from admin pricing)
    const { initialCost: INITIAL_COST, hourlyRate: HOURLY_RATE } =
      await getRatesForDatabase(validatedData.plan_id);

    // Check balance BEFORE creating provider resources
    const balCheck = await ensureBalance(validatedData.owner_id, INITIAL_COST);
    if (!balCheck.ok) {
      return NextResponse.json(
        {
          error: "Insufficient credits",
          balance: balCheck.balance,
          required: INITIAL_COST,
        },
        { status: 402 }
      );
    }

    // Validate that the target user exists and the project belongs to them
    // const supabase = await createClient();

    // Forward VALIDATED data to DigitalOcean (prevents malicious payloads)
    console.log("Admin creating database with data:", validatedData);
    const database = await axios.post(
      "https://api.digitalocean.com/v2/databases",
      validatedData,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (database.status === 201) {
      // Encrypt sensitive data before storing
      const encryptionKey = process.env.ENCRYPTION_KEY!;
      console.log(
        encryptionKey,
        "...........encryption key in admin create database api..........."
      );

      // Encrypt public connection password
      const encryptedPublicPassword = Encryption.encrypt(
        database.data.database.connection.password,
        encryptionKey
      );
      console.log(
        encryptedPublicPassword,
        "...........encrypted public password in admin create database api..........."
      );

      // Encrypt private connection password
      const encryptedPrivatePassword = Encryption.encrypt(
        database.data.database.private_connection.password,
        encryptionKey
      );

      console.log(
        encryptedPrivatePassword,
        "...........encrypted private password in admin create database api..........."
      );

      // Encrypt user passwords
      const encryptedUsers = database.data.database.users?.map(
        (user: DatabaseUser) => ({
          ...user,
          password: user.password
            ? Encryption.encrypt(user.password, encryptionKey)
            : undefined,
        })
      );

      const sendData = {
        name: database.data.database.name,
        engine: database.data.database.engine,
        project_id: body.project_id,
        owner_id: body.owner_id,
        version: database.data.database.version,
        num_nodes: database.data.database.num_nodes,
        cluster_id: database.data.database.id,
        public_connection: {
          ...database.data.database.connection,
          password: encryptedPublicPassword,
        },
        private_connection: {
          ...database.data.database.private_connection,
          password: encryptedPrivatePassword,
        },
        status: database.data.database.status,
        password: database.data.database.password,
        size: database.data.database.size,
        region: database.data.database.region,
        window: database.data.database.maintenance_window,
        // ✅ Fix: Normalize users and dbs to arrays (MongoDB returns undefined/null initially)
        users: encryptedUsers || [],
        dbs: database.data.database.db_names || [],
      };

      console.log(
        "[adminCreateDatabase] Database created successfully:",
        sendData
      );

      const supabase_data = await Database_Clusters.create(sendData);

      if (supabase_data.success) {
        // Deduct upfront and insert into billing.active_database after provisioning
        try {
          const serviceId = supabase_data.data?.id ?? database.data.database.id;
          await postProvisionBilling({
            userId: validatedData.owner_id,
            initialCost: INITIAL_COST,
            hourlyRate: HOURLY_RATE,
            serviceId,
            addActive: Billing.add_active_database,
          });
        } catch (e) {
          const message =
            e instanceof Error
              ? e.message
              : typeof e === "string"
                ? e
                : JSON.stringify(e);

          return NextResponse.json(
            {
              error: "Post-provision billing failed",
              details: message,
            },
            { status: 500 }
          );
        }
        return NextResponse.json(
          {
            data: supabase_data.data,
            message: "database creation started",
          },
          { status: 200 }
        );
      } else {
        // ✅ Handle Supabase insertion failure
        console.error(
          "[createDatabase] Supabase insertion failed:",
          supabase_data.error
        );
        return NextResponse.json(
          {
            error: "Failed to save database cluster to database",
            details: supabase_data.error,
          },
          { status: 500 }
        );
      }

      // console.log(supabase_data, "...........supabase admin create database response...........");

      if (supabase_data.success) {
        return NextResponse.json(
          {
            data: supabase_data.data,
            message: `Database successfully assigned`,
          },
          { status: 200 }
        );
      } else {
        // ✅ Handle Supabase insertion failure
        console.error(
          "[adminCreateDatabase] Supabase insertion failed:",
          supabase_data.error
        );
        return NextResponse.json(
          {
            error: "Failed to save database cluster to database",
            details: supabase_data.error,
          },
          { status: 500 }
        );
      }
    }
  } catch (err: unknown) {
    if (err as database_error) {
      const message = (err as database_error)?.response?.data?.message;
      console.log(
        message,
        "..............admin database creation error.........."
      );
      return NextResponse.json(
        { error: message ?? "Invalid request" },
        { status: 400 }
      );
    } else {
      console.log(
        "unknown error occurred in admin database creation",
        "..............error.........."
      );
      return NextResponse.json(
        { error: "Unknown error occurred" },
        { status: 400 }
      );
    }
  }

  // ✅ Handle case where DigitalOcean API returns non-201 status without throwing error
  return NextResponse.json(
    { error: "Failed to create database cluster in DigitalOcean" },
    { status: 500 }
  );
}
