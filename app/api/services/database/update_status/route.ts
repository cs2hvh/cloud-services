import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries";
import { resolveCached } from "@/lib/cache/cached-dns-resolver";
import { authenticateUser } from "@/lib/auth/server-auth";
import { Encryption } from "@/config/functions";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();

    //console.log(body, "...........in update database status api........");

    // ✅ PERFORMANCE OPTIMIZATION: Resolve both hosts in parallel with caching
    const [host_public, host_private] = await Promise.all([
      resolveCached(body.public_connection.host),
      resolveCached(body.private_connection.host)
    ]);
    
    //console.log(host_public, ".............database host ip.............");
    //console.log(
    //  host_private,
    //  ".............database private host ip............."
    //);

    //encrypt the host and password here and then store in supabase
    
    // Encryption key from environment
    const encryptionKey = process.env.ENCRYPTION_KEY!;
    
    // Encrypt hosts
    const encryptedPublicHost = Encryption.encrypt(host_public, encryptionKey);
    const encryptedPrivateHost = Encryption.encrypt(host_private, encryptionKey);
    
    // Encrypt passwords
    const encryptedPublicPassword = Encryption.encrypt(
      body.public_connection.password,
      encryptionKey
    );
    const encryptedPrivatePassword = Encryption.encrypt(
      body.private_connection.password,
      encryptionKey
    );

    let caCertificate: string = "";

    // console.log(
    //   `https://api.digitalocean.com/v2/databases/${body.id}/ca`,
    //   "...........fetch ca certificate url..........."
    // );
    // console.log("Fetching CA certificate...");
    const database = await axios.get(
      `https://api.digitalocean.com/v2/databases/${body.id}/ca`,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    // console.log(
    //   database,
    //   "............database ca certificate response..........."
    // );

    if (database.status === 200) {
      caCertificate = database.data.ca.certificate;
      //encrypt the caCertificate here before storing in supabase
    }
    
    // Encrypt CA certificate
    const encryptedCaCert = caCertificate 
      ? Encryption.encrypt(caCertificate, encryptionKey)
      : "";

    const supabase_read = await Database_Clusters.update_status(
      body.id,
      "online",
      encryptedCaCert,
      {
        ...body.public_connection,
        host: encryptedPublicHost,
        password: encryptedPublicPassword
      },
      {
        ...body.private_connection,
        host: encryptedPrivateHost,
        password: encryptedPrivatePassword
      }
    );
    if (supabase_read.success) {
      return NextResponse.json(
        {
          data: supabase_read.data,
          message: "database updated successfully",
        },
        { status: 200 }
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
