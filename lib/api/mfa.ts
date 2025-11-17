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
  const response = await fetch("/api/auth/mfa/enroll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    const error: APIError = await response.json();
    throw new Error(error.error || "Failed to enroll MFA");
  }

  return response.json();
}

/**
 * Verify a TOTP code
 */
export async function verifyMFA(
  factorId: string,
  code: string
): Promise<MFAVerifyResponse> {
  const response = await fetch("/api/auth/mfa/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ factorId, code }),
  });

  if (!response.ok) {
    const error: APIError = await response.json();
    throw new Error(error.error || "Failed to verify MFA");
  }

  return response.json();
}

/**
 * Unenroll/disable a TOTP factor
 */
export async function unenrollMFA(factorId?: string): Promise<MFAUnenrollResponse> {
  const response = await fetch("/api/auth/mfa/unenroll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ factorId }),
  });

  if (!response.ok) {
    const error: APIError = await response.json();
    throw new Error(error.error || "Failed to unenroll MFA");
  }

  return response.json();
}

/**
 * Get current MFA status
 */
export async function getMFAStatus(): Promise<MFAStatusResponse> {
  const response = await fetch("/api/auth/mfa/status", {
    method: "GET",
  });

  if (!response.ok) {
    const error: APIError = await response.json();
    throw new Error(error.error || "Failed to get MFA status");
  }

  return response.json();
}

/**
 * Update 2FA enabled status in user profile
 */
export async function update2FAStatus(enabled: boolean): Promise<void> {
  const response = await fetch("/api/profile/twofa", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ two_factor_enabled: enabled }),
  });

  if (!response.ok) {
    const error: APIError = await response.json();
    throw new Error(error.error || "Failed to update 2FA status");
  }
}
