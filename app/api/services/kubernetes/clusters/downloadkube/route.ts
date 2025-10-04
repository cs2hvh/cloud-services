// app/api/clusters/[id]/kubeconfig/route.ts
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fs from "node:fs/promises";

const KUBECONFIG_DIR = process.env.KUBECONFIG_DIR || "/srv/kubeconfigs";

export async function POST(req: Request) {
  const body = await req.json();
  
  try {


    const bufferData=JSON.parse(body.kubeconfig);
    console.log(bufferData,".............bufferData...........");
   // const file

   const str = String.fromCharCode(...bufferData.data);
//console.log(str);



    return NextResponse.json({
      success: true,
      data: str,
    });
  } catch (_e: any) {
    console.error(_e.message);
    return new NextResponse(_e.message, { status: 500 });
  }
}
