import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";
import { Encryption } from "@/config/functions";
import { EncryptedData } from "@/lib/supabase/types";
import { readDatabaseSchema } from "@/lib/validation/database";
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
    const validation = validateRequest(readDatabaseSchema, body);
    if (!validation.success) {
      return validation.response;
    }
    const validatedData = validation.data;

    let status=false;
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
        //console.log(database.data.database.status,".............database status fetch for check.............");
        status = database.data.database.status === "online" ? true : false;
      }
    }


      const supabase_read = await Database_Clusters.read(validatedData.id);
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
            status: status,
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















