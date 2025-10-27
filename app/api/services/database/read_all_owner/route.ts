import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";
import { Encryption } from "@/config/functions";
import { EncryptedData } from "@/lib/supabase/types";
import { readAllOwnerSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();
    
    // Validate request body
    const validation = validateRequest(readAllOwnerSchema, body);
    if (!validation.success) {
      return validation.response;
    }
    const validatedData = validation.data;

      const supabase_read = await Database_Clusters.read_all_owner(
            validatedData.id
          );

         // console.log(supabase_read, "...........supabase read all owner response...........");
          if (supabase_read.success) {
            const encryptionKey = process.env.ENCRYPTION_KEY!;
            
            // Helper function to check if value is encrypted
            const isEncrypted = (value: any): value is EncryptedData => {
              return value && typeof value === 'object' && 
                     'encrypted' in value && 'iv' in value && 
                     'tag' in value && 'salt' in value;
            };
            
            // Decrypt all database clusters
            const decryptedData = supabase_read.data?.map((cluster: any) => ({
              ...cluster,
              // Decrypt main password
              password: isEncrypted(cluster.password)
                ? Encryption.decrypt(cluster.password, encryptionKey)
                : cluster.password,
              // Decrypt CA certificate
              ca_certificate: cluster.ca_certificate && isEncrypted(cluster.ca_certificate)
                ? Encryption.decrypt(cluster.ca_certificate, encryptionKey)
                : cluster.ca_certificate,
              // Decrypt public connection
              public_connection: cluster.public_connection ? {
                ...cluster.public_connection,
                host: isEncrypted(cluster.public_connection.host)
                  ? Encryption.decrypt(cluster.public_connection.host, encryptionKey)
                  : cluster.public_connection.host,
                password: isEncrypted(cluster.public_connection.password)
                  ? Encryption.decrypt(cluster.public_connection.password, encryptionKey)
                  : cluster.public_connection.password,
              } : undefined,
              // Decrypt private connection
              private_connection: cluster.private_connection ? {
                ...cluster.private_connection,
                host: isEncrypted(cluster.private_connection.host)
                  ? Encryption.decrypt(cluster.private_connection.host, encryptionKey)
                  : cluster.private_connection.host,
                password: isEncrypted(cluster.private_connection.password)
                  ? Encryption.decrypt(cluster.private_connection.password, encryptionKey)
                  : cluster.private_connection.password,
              } : undefined,
              // Decrypt user passwords
              users: cluster.users?.map((user: any) => ({
                ...user,
                password: user.password && isEncrypted(user.password)
                  ? Encryption.decrypt(user.password, encryptionKey)
                  : user.password,
              })),
            }));
            
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



