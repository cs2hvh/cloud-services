import { NextRequest } from "next/server";
import { ResultSetHeader } from "mysql2";
import db from "@/lib/db/mysql/lib";
import { DB_OtpData } from "@/lib/db/mysql/types";

export async function POST(request: NextRequest) {
    try {
        const { email, otpCode } = await request.json();
        if (!email || !otpCode) {
            return Response.json(
                { message: "Missing email or OTP code." },
                { status: 400 }
            );
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Check for valid, unexpired, unverified OTP
            const [otpRows] = await connection.query<DB_OtpData[]>(
                `SELECT id
                 FROM otps
                 WHERE email = ?
                   AND otp_code = ?
                   AND verified = 0
                   AND expires_at > NOW()
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [email, otpCode]
            );

            if (!otpRows.length) {
                await connection.rollback();
                return Response.json(
                    { message: "OTP is invalid or expired." },
                    { status: 400 }
                );
            }

            const otpId = otpRows[0].id;

            // 2. Mark this OTP as verified
            const [updateOtpResult] = await connection.query<ResultSetHeader>(
                `UPDATE otps SET verified = 1 WHERE id = ?`,
                [otpId]
            );

            if (updateOtpResult.affectedRows === 0) {
                await connection.rollback();
                return Response.json(
                    { message: "Failed to update OTP record." },
                    { status: 500 }
                );
            }

            // 3. Mark user's email as verified
            const [updateUserResult] = await connection.query<ResultSetHeader>(
                `UPDATE users SET email_verified = NOW() WHERE email = ?`,
                [email]
            );

            if (updateUserResult.affectedRows === 0) {
                await connection.rollback();
                return Response.json(
                    { message: "Failed to update user record." },
                    { status: 500 }
                );
            }

            await connection.commit();
            connection.release();

            return Response.json(
                { message: "OTP verified successfully. Email is now verified." },
                { status: 200 }
            );
        } catch (error) {
            await connection.rollback();
            connection.release();
            console.error("[DB] Error verifying OTP:", error);
            return Response.json(
                { message: "Internal server error (transaction)." },
                { status: 500 }
            );
        }
    } catch (error) {
        console.error("[Route] Error:", error);
        return Response.json(
            { message: "Something went wrong :(" },
            { status: 500 }
        );
    }
}
