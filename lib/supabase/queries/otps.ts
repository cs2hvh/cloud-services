import { createClient, createServiceClient, createSSRClient } from "../server";
import { handleQueryError } from "@/lib/utils/error-handler";
import { Tables, TablesInsert } from "../types";

type OTP = Tables<"otps">;

export const OTPs = {
  create: async (props: TablesInsert<"otps">): Promise<number | null> => {
    try {
      const supabase = await createSSRClient();
      const { data, error } = await supabase
        .from("otps")
        .insert(props)
        .select("id")
        .single();

      if (error) {
        handleQueryError("creating OTP", error, "OTPs");
        return null;
      }
      return data.id;
    } catch (err) {
      handleQueryError("creating OTP", err, "OTPs");
      return null;
    }
  },

  /**
   * Mark every outstanding OTP for an email as used.
   *
   * Called whenever a new code is issued for the email, and again once a
   * code is accepted. Without it, every code ever sent stays valid until it
   * expires, so two overlapping signups for the same address (a victim's and
   * an attacker's, minutes apart) each hold a live code for the same account
   * and whichever is typed confirms it. One live code per address, always.
   *
   * Service client: public.otps has RLS enabled with no policies, so the
   * cookie client would match no rows and report success (the bug verify()
   * had until 2026-09-05).
   */
  invalidate_pending: async (email: string): Promise<boolean> => {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase
        .from("otps")
        .update({ verified: true })
        .eq("email", email)
        .eq("verified", false);
      if (error) {
        handleQueryError("invalidating pending OTPs", error, "OTPs");
        return false;
      }
      return true;
    } catch (err) {
      handleQueryError("invalidating pending OTPs", err, "OTPs");
      return false;
    }
  },
  get_by_email: async (email: string): Promise<OTP | null> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("otps")
        .select("*")
        .eq("email", email)
        .eq("verified", false)
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error) {
        handleQueryError("getting OTP by email", error, "OTPs");
        return null;
      }
      return data;
    } catch (err) {
      handleQueryError("getting OTP by email", err, "OTPs");
      return null;
    }
  },

  /**
   * Mark an OTP as used.
   *
   * This ran on createClient(), the ANON-key cookie client. public.otps has RLS
   * enabled with ZERO policies, so that client matches no rows: the UPDATE
   * silently affected nothing, Postgres returned no error, and this function
   * reported success. The OTP was therefore never invalidated and stayed
   * replayable until it expired.
   *
   * A write that quietly changes nothing is the worst shape for this: the caller
   * sees `true` and moves on, so nothing anywhere reports a problem.
   *
   * Fixed by using the service client, which is what every other write in this
   * file already uses, and by confirming a row actually changed rather than
   * trusting the absence of an error.
   */
  verify: async (id: number): Promise<boolean> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("otps")
        .update({ verified: true })
        .eq("id", id)
        .select("id");

      if (error) {
        handleQueryError("verifying OTP", error, "OTPs");
        return false;
      }

      // No error and no row is not success. Report it rather than returning
      // true for a write that did nothing.
      if (!data || data.length === 0) {
        handleQueryError(
          "verifying OTP",
          new Error(`no OTP row updated for id ${id}`),
          "OTPs"
        );
        return false;
      }

      return true;
    } catch (err) {
      handleQueryError("verifying OTP", err, "OTPs");
      return false;
    }
  },

  verify_otp: async (
    email: string,
    otp_code: string
  ): Promise<{ id: number; verified: boolean; expires_at: string } | null> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("otps")
        .select("id, verified, expires_at")
        .eq("email", email)
        .eq("otp_code", otp_code)
        .eq("verified", false)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        handleQueryError(
          "verifying OTP code",
          error || new Error("No data found"),
          "OTPs"
        );
        return null;
      }
      return data;
    } catch (err) {
      handleQueryError("verifying OTP code", err, "OTPs");
      return null;
    }
  },
};
