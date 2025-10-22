import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries";
import { resolve } from "path";
import { resolveHost } from "@/config/hosttoip";

interface database_error {
  response: {
    data: { message: string };
  };
}

export async function POST(req: NextRequest) {
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
      //console.log("[createDatabase] Database created successfully:", database.data.database);
      //get the ip address from database.data.database.connection.host
      // const host_public=await resolveHost(database.data.database.connection.host);
      // console.log(host_public,".............database host ip.............");
      // const host_private=await resolveHost(database.data.database.private_connection.host);
      // console.log(host_private,".............database private host ip.............");

      // database.data.database.connection.host=host_public;
      // database.data.database.private_connection.host=host_private;



      console.log("[createDatabase] Database created successfully:", database.data.database);
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
      };

      const supabase_data = await Database_Clusters.create(sendData);
      console.log(supabase_data, "...........supabase create database response...........");
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
