// app/api/clusters/[id]/kubeconfig/route.ts
import { authenticateUser } from "@/lib/auth/server-auth";
import { NextResponse } from "next/server";
// import { readFile } from "node:fs/promises";
// import path from "node:path";
// import fs from "node:fs/promises";

// const KUBECONFIG_DIR = process.env.KUBECONFIG_DIR || "/srv/kubeconfigs";

export async function POST(req: Request) {
  const body = await req.json();


  const auth = await authenticateUser();
    if (!auth.authenticated) {
      return auth.response;
    }
  
  try {


    const bufferData=JSON.parse(body.kubeconfig);
   // console.log(bufferData,".............bufferData...........");
   // const file

   const str = String.fromCharCode(...bufferData.data);
//console.log(str);



    return NextResponse.json({
      success: true,
      data: str,
    });
  } catch (err: unknown) {
     if (err instanceof Error) {
    return NextResponse.json({ error: err.message ?? 'Invalid request' }, { status: 400 });
  } else {
    return NextResponse.json({ error: 'Unknown error occurred' }, { status: 400 });
  }
}
}
