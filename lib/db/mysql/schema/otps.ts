import type { ResultSetHeader } from 'mysql2'
import db from '../lib'
import { DB_OtpData } from '../types'

// 3. Define your repository object
const OTPS = {
    /**
     * Create a new OTP record in the `otps` table.
     * @param email user’s email
     * @param otpCode 6-digit OTP code
     * @param expiresAt expiration time (Date)
     * @returns insertId or null
     */
    create: async (
        email: string,
        otpCode: string,
        expiresAt: Date
    ): Promise<number | null> => {
        try {
            const [rows] = await db.query<ResultSetHeader>(
                `INSERT INTO otps (email, otp_code, expires_at)
           VALUES (?, ?, ?)`,
                [email, otpCode, expiresAt]
            )
            return rows.insertId
        } catch (err) {
            console.error('[DB] Error creating OTP:', err)
            return null
        }
    },

    /**
     * Check if there's an unexpired OTP for a given email.
     * An unexpired OTP means:
     *   verified = 0
     *   expires_at > NOW()
     */
    getUnexpiredOtp: async (email: string): Promise<DB_OtpData | null> => {
        try {
            const [rows] = await db.query<DB_OtpData[]>(
                `SELECT *
           FROM otps
           WHERE email = ?
             AND verified = 0
             AND expires_at > NOW()
           ORDER BY created_at DESC
           LIMIT 1`,
                [email]
            )
            if (rows.length === 0) return null
            return rows[0]
        } catch (err) {
            console.error('[DB] Error getting unexpired OTP:', err)
            return null
        }
    },

    /**
     * Create a new OTP if the existing one for that email is expired (or doesn't exist).
     * @param email user’s email
     * @param otpCode 6-digit OTP code
     * @param expiresAt expiration time (Date)
     * @returns new OTP's ID (if created), or null if we already have an unexpired OTP
     */
    createIfExpired: async (
        email: string,
        otpCode: string,
        expiresAt: Date
    ): Promise<number | null> => {
        try {
            // 1. Check for existing unexpired OTP
            const existingOtp = await OTPS.getUnexpiredOtp(email)

            // 2. If unexpired OTP exists, we do NOT create a new one
            if (existingOtp) {
                console.log('[DB] Found existing unexpired OTP for this email. Skipping creation.')
                return null
            }

            // 3. Otherwise, create a new OTP
            const id = await OTPS.create(email, otpCode, expiresAt)
            return id
        } catch (err) {
            console.error('[DB] Error creating OTP if expired:', err)
            return null
        }
    },

    /**
     * Verify an OTP:
     *   1. Check if there's a matching, unverified, unexpired OTP
     *   2. Mark it as verified
     *   3. Also update `users.email_verified` to the current time
     * @param email user’s email
     * @param otpCode the OTP code submitted
     * @returns boolean => true if verified, false otherwise
     */
    verify: async (email: string, otpCode: string): Promise<boolean> => {
        const connection = await db.getConnection() // get a connection for a transaction
        try {
            await connection.beginTransaction()

            // 1. Look for an unverified, unexpired OTP
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
            )

            if (otpRows.length === 0) {
                // no matching or valid OTP found
                await connection.rollback()
                return false
            }

            const otpId = otpRows[0].id

            // 2. Mark the OTP as verified
            const [updateOtpRes] = await connection.query<ResultSetHeader>(
                `UPDATE otps
           SET verified = 1
           WHERE id = ?`,
                [otpId]
            )

            if (updateOtpRes.affectedRows === 0) {
                // no rows updated => rollback
                await connection.rollback()
                return false
            }

            // 3. Also update the user's `email_verified` to the current time
            const [updateUserRes] = await connection.query<ResultSetHeader>(
                `UPDATE users
           SET email_verified = NOW()
           WHERE email = ?`,
                [email]
            )

            if (updateUserRes.affectedRows === 0) {
                // user not found or no update => rollback
                await connection.rollback()
                return false
            }

            // If everything is good, commit
            await connection.commit()
            return true
        } catch (err) {
            console.error('[DB] Error verifying OTP:', err)
            await connection.rollback()
            return false
        } finally {
            connection.release() // release the connection back to the pool
        }
    }
}

export default OTPS