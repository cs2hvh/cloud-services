import { z } from "zod";

const validUnameRegex = /^[a-zA-Z0-9_]+$/;

export const signup_schema = z
  .object({
    name: z
      .string()
      .min(3)
      .max(25)
      .refine((value) => validUnameRegex.test(value), {
        message:
          "Invalid value. Username must contain only capital letters, small letters, numbers, and underscores.",
      }),
    email: z.string().email(),
    password: z.string().min(6).max(100),
    confirmPassword: z.string().min(6).max(100),
  })
  .superRefine(({ confirmPassword, password }, ctx) => {
    if (confirmPassword !== password) {
      ctx.addIssue({
        code: "custom",
        message: "The passwords did not match",
        path: ["confirmPassword"],
      });
    }
  });

export const signin_schema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(100),
});

export const otp_schema = z.object({
  pin: z
    .string()
    .min(6, "Your one-time password must be exactly 6 characters.")
    .max(6, "Your one-time password must be exactly 6 characters."),
});
