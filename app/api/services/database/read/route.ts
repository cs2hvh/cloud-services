import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters, Projects } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";
import { Encryption } from "@/config/functions";
import { EncryptedData } from "@/lib/supabase/types";
import { readDatabaseSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";
import { resolveHost } from "@/config/hosttoip";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();
    
    // Validate request body
    const validation = validateRequest(readDatabaseSchema, body);
    if (!validation.success) {
      return validation.response;
    }
    const validatedData = validation.data;

    let status=false;
    let doStatus: string | null = null;
    
    if (validatedData.checkStatus) {
      const database = await axios.get(
        `https://api.digitalocean.com/v2/databases/${validatedData.id}`,
        {
          headers: {
            Authorization: process.env.DIGITAL_OCEAN_TOKEN,
            "Content-Type": "application/json",
          },
        }
      );

      if (database.status === 200) {
        doStatus = database.data.database.status;
        status = doStatus === "online" ? true : false;
        console.log(`[checkStatus] DO Status: ${doStatus}, Supabase will be checked/updated if needed`);
      }
    }

    const supabase_read = await Database_Clusters.read(validatedData.id);
    
    // ✅ UPDATE SUPABASE IF STATUS CHANGED TO ONLINE
    if (doStatus && supabase_read.success && supabase_read.data.status !== doStatus) {
      console.log(`[checkStatus] ⚠️ Status mismatch! Supabase: "${supabase_read.data.status}", DO: "${doStatus}"`);
      
      if (doStatus === "online") {
        console.log(`[checkStatus] 🔄 Cluster is now online, updating Supabase...`);
        
        // Get full cluster details to update Supabase with connection info
        const fullClusterData = await axios.get(
          `https://api.digitalocean.com/v2/databases/${validatedData.id}`,
          {
            headers: {
              Authorization: process.env.DIGITAL_OCEAN_TOKEN,
              "Content-Type": "application/json",
            },
          }
        );
        
        if (fullClusterData.status === 200) {
          const dbData = fullClusterData.data.database;
          
          // Encrypt connection details
          const encryptionKey = process.env.ENCRYPTION_KEY!;
          
          // Encrypt public connection password
          const encryptedPublicPassword = Encryption.encrypt(
            dbData.connection.password,
            encryptionKey
          );
          
          // Encrypt private connection password
          const encryptedPrivatePassword = Encryption.encrypt(
            dbData.private_connection.password,
            encryptionKey
          );

          // Get IP addresses for both public and private connection hosts (only for MySQL and PostgreSQL)
          let publicHostIP = dbData.connection.host;
          let privateHostIP = dbData.private_connection.host;
          let encryptedPublicURI = dbData.connection.uri;
          
          // Only resolve IP for MySQL and PostgreSQL databases
          const shouldResolveIP = dbData.engine === "mysql" || dbData.engine === "pg";
          
          if (shouldResolveIP) {
            try {
              // Resolve public connection host to IP
              const publicHostResult = await resolveHost(dbData.connection.host);
              if (!publicHostResult.error && publicHostResult.records.length > 0) {
                const aRecord = publicHostResult.records.find(r => r.type === "A");
                if (aRecord && aRecord.records.length > 0) {
                  publicHostIP = aRecord.records[0] as string;
                  console.log(`[checkStatus] Resolved public host ${dbData.connection.host} to IP: ${publicHostIP}`);
                  
                  // Replace hostname in URI with IP address
                  // URI format: protocol://user:password@hostname:port/database
                  const uriMatch = dbData.connection.uri.match(/^(.+@)([^:\/]+)(.+)$/);
                  if (uriMatch) {
                    encryptedPublicURI = `${uriMatch[1]}${publicHostIP}${uriMatch[3]}`;
                    console.log(`[checkStatus] Updated URI with IP address`);
                  }
                }
              }
              
              // Resolve private connection host to IP
              const privateHostResult = await resolveHost(dbData.private_connection.host);
              if (!privateHostResult.error && privateHostResult.records.length > 0) {
                const aRecord = privateHostResult.records.find(r => r.type === "A");
                if (aRecord && aRecord.records.length > 0) {
                  privateHostIP = aRecord.records[0] as string;
                  console.log(`[checkStatus] Resolved private host ${dbData.private_connection.host} to IP: ${privateHostIP}`);
                }
              }
            } catch (error) {
              console.error("[checkStatus] Failed to resolve host to IP:", error);
              // Continue with original hostnames if resolution fails
            }
          } else {
            console.log(`[checkStatus] Skipping IP resolution for engine: ${dbData.engine} (only MySQL and PostgreSQL supported)`);
          }
          
          // Encrypt the IP addresses
          const encryptedPublicHost = Encryption.encrypt(publicHostIP, encryptionKey);
          const encryptedPrivateHost = Encryption.encrypt(privateHostIP, encryptionKey);
          const encryptedPublicURIValue = Encryption.encrypt(encryptedPublicURI, encryptionKey);
          
          // Get CA certificate
          let caCertificate = "";
          try {
            const caResponse = await axios.get(
              `https://api.digitalocean.com/v2/databases/${validatedData.id}/ca`,
              {
                headers: {
                  Authorization: process.env.DIGITAL_OCEAN_TOKEN,
                  "Content-Type": "application/json",
                },
              }
            );
            if (caResponse.status === 200) {
              caCertificate = caResponse.data.ca.certificate;
            }
          } catch (error) {
            console.error("[checkStatus] Failed to fetch CA certificate:", error);
          }
          
          // Encrypt CA certificate
          const encryptedCaCert = caCertificate 
            ? Encryption.encrypt(caCertificate, encryptionKey)
            : "";
          
          // Update Supabase with online status and connection details
          await Database_Clusters.update_status(
            validatedData.id,
            "online",
            encryptedCaCert,
            {
              ...dbData.connection,
              host: encryptedPublicHost,
              password: encryptedPublicPassword,
              uri: encryptedPublicURIValue
            },
            {
              ...dbData.private_connection,
              host: encryptedPrivateHost,
              password: encryptedPrivatePassword
            }
          );
          
          console.log(`[checkStatus] ✅ Supabase updated with online status`);
          
          // Re-read from Supabase to get updated data
          const updatedRead = await Database_Clusters.read(validatedData.id);
          if (updatedRead.success) {
            supabase_read.data = updatedRead.data;
            console.log(`[checkStatus] ✅ Re-read from Supabase, new status: "${updatedRead.data.status}"`);
            
            // Add activity log for database cluster going online
            if (updatedRead.data.project_id) {
              await Projects.add_log({
                project_id: updatedRead.data.project_id,
                event: "Database",
                text: `Database cluster '${updatedRead.data.name}' is now online`
              });
              console.log(`[checkStatus] ✅ Activity log added for cluster going online`);
            }
          }
        }
      }
    } else if (doStatus && supabase_read.success) {
      console.log(`[checkStatus] ℹ️ Status matches - Supabase: "${supabase_read.data.status}", DO: "${doStatus}"`);
    }
      //decrypt the host , password , caCertificate here before sending response
      if (supabase_read.success) {
        const data = supabase_read.data;
        const encryptionKey = process.env.ENCRYPTION_KEY!;
        
        // Helper function to check if value is encrypted
        const isEncrypted = (value: any): value is EncryptedData => {
          return value && typeof value === 'object' && 
                 'encrypted' in value && 'iv' in value && 
                 'tag' in value && 'salt' in value;
        };
        
        // Decrypt sensitive fields
        const decryptedData = {
          ...data,
          // Decrypt main password
          password: isEncrypted(data.password)
            ? Encryption.decrypt(data.password, encryptionKey)
            : data.password,
          // Decrypt CA certificate
          ca_certificate: data.ca_certificate && isEncrypted(data.ca_certificate)
            ? Encryption.decrypt(data.ca_certificate, encryptionKey)
            : data.ca_certificate,
          // Decrypt public connection
          public_connection: data.public_connection ? {
            ...data.public_connection,
            host: isEncrypted(data.public_connection.host)
              ? Encryption.decrypt(data.public_connection.host, encryptionKey)
              : data.public_connection.host,
            password: isEncrypted(data.public_connection.password)
              ? Encryption.decrypt(data.public_connection.password, encryptionKey)
              : data.public_connection.password,
            uri: isEncrypted(data.public_connection.uri)
              ? Encryption.decrypt(data.public_connection.uri, encryptionKey)
              : data.public_connection.uri,
          } : undefined,
          // Decrypt private connection
          private_connection: data.private_connection ? {
            ...data.private_connection,
            host: isEncrypted(data.private_connection.host)
              ? Encryption.decrypt(data.private_connection.host, encryptionKey)
              : data.private_connection.host,
            password: isEncrypted(data.private_connection.password)
              ? Encryption.decrypt(data.private_connection.password, encryptionKey)
              : data.private_connection.password,
          } : undefined,
          // Decrypt user passwords
          users: data.users?.map((user: any) => ({
            ...user,
            password: user.password && isEncrypted(user.password)
              ? Encryption.decrypt(user.password, encryptionKey)
              : user.password,
          })),
        };
        
        return NextResponse.json(
          {
            data: decryptedData,
            message: "database fetched successfully",
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















