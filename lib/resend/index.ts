import { Resend } from "resend";

let resendInstance: Resend | null = null;

/**
 * Lazy Resend client getter - instantiates only when accessed
 * Prevents build failures when RESEND_API_KEY is missing at build time
 */
export const resend = {
  get emails() {
    if (!resendInstance) {
      if (!process.env.RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY environment variable is not set');
      }
      resendInstance = new Resend(process.env.RESEND_API_KEY);
    }
    return resendInstance.emails;
  }
};
