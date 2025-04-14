import { NextRequest } from "next/server";
import bcryptjs from "bcryptjs";
import { generateIdFromEntropySize } from "lucia";
import { generateRandomUuid, generateSixDigitOtp } from "@/lib/utils";
import { send_otp_email } from "@/lib/resend/send_otp";
import query from "@/lib/db/mysql";
import { DB_User } from "@/lib/db/mysql/types";

export async function POST(request: NextRequest) {
    try {
        const { email, name, password } = await request.json();

        if (!email || !password || !name) {
            return Response.json({ message: "Not found" }, { status: 404 });
        }

        const existing_user = await query.users.get_by_email(email);

        // --------------------------
        // 1. USER ALREADY EXISTS
        // --------------------------
        if (existing_user) {
            // If user is already verified, no need to re-register
            if (existing_user.email_verified) {
                return Response.json(
                    { message: "User already exists and is verified." },
                    { status: 403 }
                );
            }

            // If user exists but is NOT yet verified (email_verified is null),
            // proceed to generating OTP again
            const generatedOtp = generateSixDigitOtp();
            const expiresAt = new Date(Date.now() + 5 * 60_000); // 5 min from now

            // Generate or reuse OTP if unexpired doesn’t exist
            const otpId = await query.otps.createIfExpired(email, generatedOtp, expiresAt);

            if (!otpId) {
                // Means there is already an unexpired OTP for this user
                return Response.json({
                    message: "User is not verified yet. Existing OTP is still valid."
                });
            }

            // Otherwise, a new OTP was created
            return Response.json({
                message: "User exists but not verified. New OTP has been generated.",
                otpId
            });
        }

        // --------------------------
        // 2. CREATE NEW USER
        // --------------------------
        const salt = await bcryptjs.genSalt(10);
        const hashedPassword = await bcryptjs.hash(password, salt);

        const generated_id = generateRandomUuid();
        const generatedOtp = generateSixDigitOtp();
        const expiresAt = new Date(Date.now() + 5 * 60_000); // 5 min from now

        // Create the user in the DB
        await query.users.create({
            id: generated_id,
            username: name,
            email,
            password: hashedPassword,
        } as Partial<DB_User>);


        // Generate OTP for the *new* user
        const otpId = await query.otps.createIfExpired(email, generatedOtp, expiresAt);

        await send_otp_email(email, name, generatedOtp)

        // await query.logs.add({
        //     eventType: "registration",
        //     created: new Date(),
        //     userId: generated_id,
        //     text: `${email} just registered with username: ${name}`
        // });

        return Response.json({
            message: "User registration successfull. OTP generated.",
            name: name,
            otpId
        });
    } catch (error) {
        console.error("Error in registration:", error);
        return Response.json({ message: "Something went wrong :(" }, { status: 500 });
    }
}
