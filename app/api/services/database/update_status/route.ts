import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
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
    // If resolution fails, the original host will be returned as fallback
    const [host_public, host_private] = await Promise.all([
      resolveCached(body.public_connection.host),
      resolveCached(body.private_connection.host)
    ]);
    
    // ✅ FALLBACK: Ensure we always have valid hosts (use original if resolution failed)
    const finalPublicHost = host_public || body.public_connection.host;
    const finalPrivateHost = host_private || body.private_connection.host;
    
    console.log("Public host - Original:", body.public_connection.host, "| Resolved:", finalPublicHost);
    console.log("Private host - Original:", body.private_connection.host, "| Resolved:", finalPrivateHost);

    // ✅ UPDATE URIs: Replace hostname with IP address in connection URIs
    // Extract hostname from URI (part after @ and before :port or /)
    const publicHostnameMatch = body.public_connection.uri.match(/@([^:\/]+)/);
    const privateHostnameMatch = body.private_connection.uri.match(/@([^:\/]+)/);
    
    const public_uri_with_ip = publicHostnameMatch
      ? body.public_connection.uri.replace(publicHostnameMatch[1], finalPublicHost)
      : body.public_connection.uri;
      
    const private_uri_with_ip = privateHostnameMatch
      ? body.private_connection.uri.replace(privateHostnameMatch[1], finalPrivateHost)
      : body.private_connection.uri;

    console.log("Original public URI:", body.public_connection.uri);
    console.log("Extracted public hostname:", publicHostnameMatch?.[1]);
    console.log("Updated public URI:", public_uri_with_ip);
    console.log("Original private URI:", body.private_connection.uri);
    console.log("Extracted private hostname:", privateHostnameMatch?.[1]);
    console.log("Updated private URI:", private_uri_with_ip);

    //encrypt the host and password here and then store in supabase
    
    // Encryption key from environment
    const encryptionKey = process.env.ENCRYPTION_KEY!;
    
    // Encrypt hosts (using resolved IPs or original hosts as fallback)
    const encryptedPublicHost = Encryption.encrypt(finalPublicHost, encryptionKey);
    const encryptedPrivateHost = Encryption.encrypt(finalPrivateHost, encryptionKey);
    
    // Encrypt passwords (handle empty passwords - DigitalOcean MongoDB may not provide separate password field)
    // If password is not provided, try to extract it from the URI
    let publicPassword = body.public_connection.password;
    let privatePassword = body.private_connection.password;
    
    // Extract password from URI if not provided directly
    if (!publicPassword && body.public_connection.uri) {
      const uriMatch = body.public_connection.uri.match(/:\/\/[^:]+:([^@]+)@/);
      if (uriMatch) {
        publicPassword = decodeURIComponent(uriMatch[1]);
        console.log("[update_status] Extracted public password from URI");
      }
    }
    if (!privatePassword && body.private_connection.uri) {
      const uriMatch = body.private_connection.uri.match(/:\/\/[^:]+:([^@]+)@/);
      if (uriMatch) {
        privatePassword = decodeURIComponent(uriMatch[1]);
        console.log("[update_status] Extracted private password from URI");
      }
    }
    
    const encryptedPublicPassword = publicPassword 
      ? Encryption.encrypt(publicPassword, encryptionKey)
      : null;
    const encryptedPrivatePassword = privatePassword
      ? Encryption.encrypt(privatePassword, encryptionKey)
      : null;

    // Encrypt URIs (with IP addresses)
    const encryptedPublicUri = Encryption.encrypt(public_uri_with_ip, encryptionKey);
    const encryptedPrivateUri = Encryption.encrypt(private_uri_with_ip, encryptionKey);

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
        uri: encryptedPublicUri,
        host: encryptedPublicHost,
        password: encryptedPublicPassword
      },
      {
        ...body.private_connection,
        uri: encryptedPrivateUri,
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
