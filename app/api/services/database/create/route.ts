import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { Billing } from "@/lib/supabase/queries/billing";
import { ensureBalance, postProvisionBilling } from "@/config/billing-flow";
// import { resolve } from "path";
// import { resolveHost } from "@/config/hosttoip";
import { authenticateUser } from "@/lib/auth/server-auth";
import { Encryption } from "@/config/functions";
import {
  createDatabaseSchema,
  validateEngineVersion,
} from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";
import { NotificationService, createServiceNotification } from "@/lib/notifications";
import { DatabaseUser } from "@/lib/supabase/types";
import { getRatesForDatabase } from "@/config/pricing";

interface database_error {
  response: {
    data: { message: string };
  };
}

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
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
    const { initialCost: INITIAL_COST, hourlyRate: HOURLY_RATE } = await getRatesForDatabase(validatedData.plan_id);

    // Check balance BEFORE creating provider resources
    const balCheck = await ensureBalance(validatedData.owner_id, INITIAL_COST);
    if (!balCheck.ok) {
      return NextResponse.json(
        { error: "Insufficient credits", balance: balCheck.balance, required: INITIAL_COST },
        { status: 402 }
      );
    }

    // Forward VALIDATED data to DigitalOcean (prevents malicious payloads)
   // console.log("Creating database with data:", validatedData);
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
      //encrypt the db password here before storing in supabase

      // Encrypt sensitive data before storing
      const encryptionKey = process.env.ENCRYPTION_KEY!;
      // console.log(
      //   encryptionKey,
      //   "...........encryption key in create database api..........."
      // );

      // Encrypt main password
      // const encryptedPassword = Encryption.encrypt(
      //   database.data.database.password,
      //   encryptionKey
      // );
      // console.log(encryptedPassword,"...........encrypted password in create database api...........");

      // Helper function to extract password from URI if not provided directly
      const extractPasswordFromUri = (uri: string): string | null => {
        if (!uri) return null;
        const uriMatch = uri.match(/:\/\/[^:]+:([^@]+)@/);
        if (uriMatch) {
          return decodeURIComponent(uriMatch[1]);
        }
        return null;
      };

      // Get passwords - fallback to extracting from URI for MongoDB which may not provide separate password field
      const publicPassword = database.data.database.connection?.password 
        || extractPasswordFromUri(database.data.database.connection?.uri);
      const privatePassword = database.data.database.private_connection?.password 
        || extractPasswordFromUri(database.data.database.private_connection?.uri);

      // Encrypt public connection password (if available)
      const encryptedPublicPassword = publicPassword
        ? Encryption.encrypt(publicPassword, encryptionKey)
        : null;
      // console.log(encryptedPublicPassword,"...........encrypted public password in create database api...........");

      // Encrypt private connection password (if available)
      const encryptedPrivatePassword = privatePassword
        ? Encryption.encrypt(privatePassword, encryptionKey)
        : null;

      //console.log(encryptedPrivatePassword,"...........encrypted private password in create database api...........");

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
        storage_size_mib: database.data.database.storage_size_mib,
      };

      //console.log("[createDatabase] Database created successfully:", sendData);

      const supabase_data = await Database_Clusters.create(sendData);

      //console.log(supabase_data, "...........supabase create database response...........");

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
        // Create notification
        await NotificationService.create(
          createServiceNotification({
            userId: body.owner_id,
            type: 'success',
            action: 'created',
            serviceType: 'database',
            serviceName: validatedData.name,
            serviceId: supabase_data.data?.id ?? database.data.database.id,
          })
        );

        return NextResponse.json(
          {
            data: supabase_data.data,
            // Include unencrypted connection info for immediate use
            // (only returned on create, subsequent reads use encrypted data)
            connection: {
              host: database.data.database.connection.host,
              port: database.data.database.connection.port,
              user: database.data.database.connection.user,
              password: database.data.database.connection.password,
              database: database.data.database.connection.database || 'defaultdb',
              uri: database.data.database.connection.uri,
            },
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
    }
    else if(database.status==500 || database.status==429){
      return NextResponse.json({
        error: "DigitalOcean API error",
        message: "our server is busy. please try again later",
      }, { status: 503 });
    }
  } catch (err: unknown) {
    // Create error notification
    try {
      await NotificationService.create(
        createServiceNotification({
          userId: auth.user!.id,
          type: 'error',
          action: 'created',
          serviceType: 'database',
          serviceName: 'Database Cluster',
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      );
    } catch (notifErr) {
      console.error('Failed to create error notification:', notifErr);
    }

    if (err as database_error) {
      const message = (err as database_error)?.response?.data?.message;
      console.log(message, "..............error...........");
      return NextResponse.json(
        { error: message ?? "Invalid request" },
        { status: 400 }
      );
    } else {
      console.log("unknown error occurred", "..............error...........");
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
