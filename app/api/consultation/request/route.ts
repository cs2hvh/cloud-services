import { NextRequest, NextResponse } from "next/server";

import { emailService } from "@/lib/email";
import { createServiceClient } from "@/lib/supabase/server";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    const name = normalizeValue(payload?.name);
    const email = normalizeValue(payload?.email).toLowerCase();
    const body = normalizeValue(payload?.body);
    const service = normalizeValue(payload?.service);

    if (!name || !email || !body || !service) {
      return NextResponse.json(
        { error: "Name, email, body, and service are required." },
        { status: 400 },
      );
    }

    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { error: "Please provide a valid email address." },
        { status: 400 },
      );
    }

   // const supabase = await createServiceClient();

    // const { data: adminProfiles, error: adminsError } = await supabase
    //   .from("user_profiles")
    //   .select("email")
    //   .contains("roles", ["admin"])
    //   .not("email", "is", null);
    const adminProfiles=[{email:process.env.Admin}]


    // if (adminsError) {
    //   console.error("[Consultation Request] Failed to fetch admin emails:", adminsError);
    //   return NextResponse.json(
    //     { error: "Failed to process consultation request." },
    //     { status: 500 },
    //   );
    // }

    const adminEmails = Array.from(
      new Set(
        (adminProfiles || [])
          .map((profile) => profile.email?.trim().toLowerCase())
          .filter((value): value is string => Boolean(value)),
      ),
    );

    if (adminEmails.length === 0) {
      console.error("[Consultation Request] No admin emails found in Supabase.");
      return NextResponse.json(
        { error: "No admin recipient configured." },
        { status: 500 },
      );
    }

    const sendResult = await emailService.sendTemplate({
      template: "consultationRequest",
      to: adminEmails,
      data: {
        requesterName: name,
        requesterEmail: email,
        serviceName: service,
        messageBody: body,
        submittedAt: new Date().toISOString(),
      },
    });

    if (!sendResult.success) {
      console.error(
        "[Consultation Request] Failed to send email:",
        sendResult.error,
      );
      return NextResponse.json(
        { error: "Failed to send consultation request email." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { message: "Consultation request submitted successfully." },
      { status: 200 },
    );
  } catch (error) {
    console.error("[Consultation Request] Unexpected error:", error);
    return NextResponse.json(
      { error: "Unable to submit consultation request." },
      { status: 500 },
    );
  }
}
