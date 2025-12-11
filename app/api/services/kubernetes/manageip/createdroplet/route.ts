import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Encryption, generateStrongPassword } from "@/config/functions";
import { Billing } from "@/lib/supabase/queries";

export async function POST(req: NextRequest) {
  try {
    //debugger
    const json = await req.json();
    //console.log(json,"...............................25")
    // Expect ownerId in payload to check credits
    const ownerId: string | undefined = json?.ownerId;
    const upfront: number = typeof json?.initial_cost === "number" ? json.initial_cost : 5.0; // default dummy upfront

    if (!ownerId) {
      return NextResponse.json({ error: "ownerId is required to validate credits" }, { status: 400 });
    }

    // Check balance before hitting DO API
    const hasBalance = await Billing.has_balance(ownerId, upfront);
    if (!hasBalance) {
      const bal = await Billing.get_balance(ownerId);
      return NextResponse.json({ error: "Insufficient credits", balance: bal, required: upfront }, { status: 402 });
    }

    // Deduct upfront immediately to avoid race conditions with external provisioning
    // try {
    //   await Billing.deduct(ownerId, upfront);
    // } catch (err) {
    //   const msg =
    //     err instanceof Error
    //       ? err.message
    //       : typeof err === "string"
    //         ? err
    //         : JSON.stringify(err);

    //   return NextResponse.json(
    //     { error: "Credit deduction failed", details: msg },
    //     { status: 500 }
    //   );
    // }


    const vmPassword=generateStrongPassword();
  //console.log(vmPassword,".................generateStrongPassword..............28")
    const payload={...json,
     user_data:`#cloud-config\npassword: ${vmPassword}!\nchpasswd:\n  list: |\n    root:${vmPassword}\n  expire: false\nssh_pwauth: true`
    }
    //console.log(payload,"...............................28")
    const droplets=await axios.post(
        "https://api.digitalocean.com/v2/droplets",
       payload,
        {
          headers: {
            Authorization:
               process.env.DIGITAL_OCEAN_TOKEN,
            "Content-Type": "application/json",
          },
        }
      );
        const hashedPassword=Encryption.encrypt(vmPassword,process.env.ENCRYPTION_KEY!);

        //console.log(hashedPassword,"...............hashedPassword................39")


    if (droplets.status === 202) {
      return NextResponse.json(
        {
          data: droplets.data,
          vmPassword: hashedPassword,
          message: "droplet created success",
        },
        { status: 202 }
      );
    }

    if(droplets.status!=202){
return NextResponse.json({ error: "there is some internal error. please try later" }, { status: 400 });
    }

  } catch (err: unknown) {
    if (err instanceof Error) {
    //  console.log(err.cause,"...............error in creating droplet................")
      return NextResponse.json(
        { error: "our server is not responding. please try later"},
        { status: 400 }
      );
    } else {
      console.log("Unknown error occurred");
      return NextResponse.json(
        { error: "Unknown error occurred" },
        { status: 400 }
      );
    }
  }
}



