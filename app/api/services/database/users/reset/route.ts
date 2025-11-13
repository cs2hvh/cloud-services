import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";
import { Encryption } from "@/config/functions";
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
      console.log("[resetDatabaseUserPassword] Password reset successfully:", response.data.user);

      const user = response.data.user;
      const encryptionKey = process.env.ENCRYPTION_KEY!;

      // Optional: Update user password in Supabase with encryption
      // Get current users and update the specific user's password
      const usersResult = await Database_Clusters.get_users(validatedData.cluster_id);
      
      if (usersResult.success && Array.isArray(usersResult.data)) {
        const updatedUsers = usersResult.data.map((u: any) => {
          if (u.name === validatedData.username) {
            return {
              ...u,
              password: user.password ? Encryption.encrypt(user.password, encryptionKey) : undefined,
            };
          }
          return u;
        });

        await Database_Clusters.update_users(validatedData.cluster_id, updatedUsers);
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
    if (err as database_error) {
      const message = (err as database_error)?.response?.data?.message;
      console.error("[resetDatabaseUserPassword] Error:", message);
      return NextResponse.json(
        { error: message ?? "Invalid request" },
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
