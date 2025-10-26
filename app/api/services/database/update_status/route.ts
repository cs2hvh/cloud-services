import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries";
import { resolveHost } from "@/config/hosttoip";
import { authenticateUser } from "@/lib/auth/server-auth";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();

    //console.log(body, "...........in update database status api........");

    const host_public =
      (await resolveHost(body.public_connection.host)).records[0].records[0] ||
      body.public_connection.host;
    //console.log(host_public, ".............database host ip.............");
    const host_private =
      (await resolveHost(body.private_connection.host)).records[0].records[0] ||
      body.private_connection.host;
    //console.log(
    //  host_private,
    //  ".............database private host ip............."
    //);

    //encrypt the host and password here and then store in supabase
    body.public_connection.host = host_public;
    body.private_connection.host = host_private;

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

    const supabase_read = await Database_Clusters.update_status(
      body.id,
      "online",
      caCertificate,
      body.public_connection,
      body.private_connection
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
