import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { authenticateUser } from "@/lib/auth/server-auth";
import { Encryption, ConnectionPasswordUpdater, EncryptedData } from "@/config/functions";
import { resetUserPasswordSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";

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
    
    // Validate request body
    const validation = validateRequest(resetUserPasswordSchema, body);
    if (!validation.success) {
      return validation.response;
    }
    const validatedData = validation.data;

    // Reset user password in DigitalOcean
    const response = await axios.post(
      `https://api.digitalocean.com/v2/databases/${validatedData.cluster_id}/users/${validatedData.username}/reset_auth`,
      {},
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 200) {
      const user = response.data.user;
      const encryptionKey = process.env.ENCRYPTION_KEY!;

      // Update user password in Supabase with encryption
      const usersResult = await Database_Clusters.get_users(validatedData.cluster_id);
      
      if (usersResult.success && Array.isArray(usersResult.data)) {
        const updatedUsers = usersResult.data.map((u) => {
          if (u.name === validatedData.username) {
            // For MongoDB: initial user may not have password field
            const updatedUser = { ...u };
            if (user.password) {
              updatedUser.password = Encryption.encrypt(user.password, encryptionKey);
            }
            return updatedUser;
          }
          return u;
        });

        await Database_Clusters.update_users(validatedData.cluster_id, updatedUsers);
      }

      // Update connection URIs if the default user (connection user) password is reset
      // The connection URI uses the default admin user's credentials
      if (user.password) {
        const clusterResult = await Database_Clusters.read(validatedData.cluster_id);

        if (clusterResult.success && clusterResult.data) {
          const cluster = clusterResult.data;
          const connectionUser = cluster.public_connection?.user;

          // Only update connections if the reset user is the connection user (e.g., doadmin)
          if (connectionUser === validatedData.username) {
            console.log("[resetPassword] Updating connection URIs for user:", validatedData.username);
            
            const updatedPublicConnection = { ...cluster.public_connection };
            const updatedPrivateConnection = { ...cluster.private_connection };

            // Update public_connection URI and password
            if (updatedPublicConnection.uri) {
              const newUri = ConnectionPasswordUpdater.updateEncryptedUri(
                updatedPublicConnection.uri as EncryptedData,
                validatedData.username,
                user.password,
                encryptionKey
              );
              if (newUri) {
                updatedPublicConnection.uri = newUri;
              } else {
                console.error("[resetPassword] Failed to update public_connection.uri");
              }
            }
            if (updatedPublicConnection.password) {
              updatedPublicConnection.password = Encryption.encrypt(user.password, encryptionKey);
            }

            // Update private_connection URI and password
            if (updatedPrivateConnection.uri) {
              const newUri = ConnectionPasswordUpdater.updateEncryptedUri(
                updatedPrivateConnection.uri as EncryptedData,
                validatedData.username,
                user.password,
                encryptionKey
              );
              if (newUri) {
                updatedPrivateConnection.uri = newUri;
              } else {
                console.error("[resetPassword] Failed to update private_connection.uri");
              }
            }
            if (updatedPrivateConnection.password) {
              updatedPrivateConnection.password = Encryption.encrypt(user.password, encryptionKey);
            }

            // Update connections in Supabase
            await Database_Clusters.update_connections(
              validatedData.cluster_id,
              updatedPublicConnection,
              updatedPrivateConnection
            );
          }
        }
      }

      return NextResponse.json(
        {
          data: {
            name: user.name,
            password: user.password,
            role: user.role,
          },
          message: "Database user password reset successfully",
        },
        { status: 200 }
      );
    }
  } catch (err: unknown) {
    console.error("[resetDatabaseUserPassword] Error occurred");
    
    if (err as database_error) {
      const message = (err as database_error)?.response?.data?.message;
      return NextResponse.json(
        { error: message ?? "Failed to reset password" },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        { error: "Failed to reset password" },
        { status: 400 }
      );
    }
  }
}
