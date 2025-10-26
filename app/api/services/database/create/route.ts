import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries";
import { resolve } from "path";
import { resolveHost } from "@/config/hosttoip";
import { authenticateUser } from "@/lib/auth/server-auth";

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

    const database = await axios.post(
      "https://api.digitalocean.com/v2/databases",
      body,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (database.status === 201) {


      //encrypt the db password here before storing in supabase

      const sendData = {
        name: database.data.database.name,
        engine: database.data.database.engine,
        project_id: body.project_id,
        owner_id: body.owner_id,
        version: database.data.database.version,
        num_nodes: database.data.database.num_nodes,
        cluster_id: database.data.database.id,
        public_connection: database.data.database.connection,
        private_connection: database.data.database.private_connection,
        status: database.data.database.status,
        password: database.data.database.password,
        size: database.data.database.size,
        region: database.data.database.region,
        window: database.data.database.maintenance_window,
        users: database.data.database.users,
        dbs: database.data.database.db_names,
      };

      const supabase_data = await Database_Clusters.create(sendData);
    
      if (supabase_data.success) {
        return NextResponse.json(
          {
            data: supabase_data.data,
            message: "database created success",
          },
          { status: 200 }
        );
      }
    }
  } catch (err: unknown) {
    if (err as database_error) {
      const message = (err as database_error)?.response?.data?.message;
      // console.log(,"..............error...........");
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
