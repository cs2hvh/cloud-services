import { z } from "zod";

/**
 * Schema for initiating forgot password flow
 * User provides their email to receive reset link
 */
export const forgot_password_schema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

/**
 * Schema for resetting password with OTP
 * User provides email, OTP code, and new password
 */
export const reset_password_schema = z.object({
  email: z.string().email("Please enter a valid email address"),
  otp: z
    .string()
    .length(6, "OTP must be exactly 6 digits")
    .regex(/^\d+$/, "OTP must contain only numbers"),
  newPassword: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(100, "Password must be less than 100 characters"),
  confirmPassword: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(100, "Password must be less than 100 characters"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

/**
 * Schema for changing password in profile (requires current password)
 */
export const change_password_schema = z.object({
  currentPassword: z
    .string()
    .min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(100, "Password must be less than 100 characters"),
  confirmPassword: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(100, "Password must be less than 100 characters"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type ForgotPasswordInput = z.infer<typeof forgot_password_schema>;
export type ResetPasswordInput = z.infer<typeof reset_password_schema>;
export type ChangePasswordInput = z.infer<typeof change_password_schema>;
