import api from "@/lib/axios/axios";

/**
 * Client-side API wrapper for MFA operations
 * This provides a cleaner abstraction over the MFA API endpoints
 */

export interface MFAEnrollResponse {
  success: boolean;
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
}

export interface MFAVerifyResponse {
  success: boolean;
  message: string;
}

export interface MFAUnenrollResponse {
  success: boolean;
  message: string;
}

export interface MFAFactor {
  id: string;
  status: "verified" | "unverified";
  factorType: string;
  friendlyName: string;
  createdAt: string;
}

export interface MFAStatusResponse {
  currentLevel: "aal1" | "aal2";
  nextLevel: "aal1" | "aal2";
  hasVerifiedFactor: boolean;
  factorId: string | null;
  factors: MFAFactor[];
}

export interface APIError {
  error: string;
}

/**
 * Enroll a new TOTP factor
 */
export async function enrollMFA(): Promise<MFAEnrollResponse> {
  try {
    const response = await api.post("/auth/mfa/enroll");
    return response.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enroll MFA";
    throw new Error(message);
  }
}

/**
 * Verify a TOTP code
 */
export async function verifyMFA(
  factorId: string,
  code: string
): Promise<MFAVerifyResponse> {
  try {
    const response = await api.post("/auth/mfa/verify", { factorId, code });
    return response.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to verify MFA";
    throw new Error(message);
  }
}

/**
 * Unenroll/disable a TOTP factor
 */
export async function unenrollMFA(factorId?: string): Promise<MFAUnenrollResponse> {
  try {
    const response = await api.post("/auth/mfa/unenroll", { factorId });
    return response.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to unenroll MFA";
    throw new Error(message);
  }
}

/**
 * Get current MFA status
 */
export async function getMFAStatus(): Promise<MFAStatusResponse> {
  try {
    const response = await api.get("/auth/mfa/status");
    return response.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get MFA status";
    throw new Error(message);
  }
}

/**
 * Update 2FA enabled status in user profile
 */
export async function update2FAStatus(enabled: boolean): Promise<void> {
  try {
    await api.put("/profile/twofa", { two_factor_enabled: enabled });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update 2FA status";
    throw new Error(message);
  }
}
