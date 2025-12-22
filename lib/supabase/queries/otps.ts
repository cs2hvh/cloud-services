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

  verify: async (id: number): Promise<boolean> => {
    try {
      const supabase = await createClient();
      const { error } = await supabase
        .from("otps")
        .update({ verified: true })
        .eq("id", id);

      if (error) {
        handleQueryError("verifying OTP", error, "OTPs");
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
