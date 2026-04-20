"use client";

import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, User, Phone, KeyRound } from "lucide-react";
import api from "@/lib/axios/axios";
import { toast } from "sonner";
import { ChangePasswordDialog } from "@/components/dashboard/profile/change-password-dialog";
import { useRouter } from "next/navigation";

// Types for user profile
interface UserProfile {
  email: string;
  phone: string;
  userName: string;
  displayName: string;
}

const ProfileSettings: React.FC = () => {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile>({
    email: "",
    phone: "",
    userName: "",
    displayName: "",
  });

  const [loading, setLoading] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

  // ✅ Fetch user data (example API call)
  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await api.get("/auth/profile/read");
        console.log(res?.data, "....res?.data?..");
        if (res.status != 200) throw new Error("Failed to load profile");
        const data: UserProfile = res?.data;
        setProfile(data);
      } catch (err) {
        console.error("Failed to fetch profile:", err);
      }
    }

    fetchProfile();
  }, []);

  // ✅ Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  // ✅ Handle update
  const handleUpdate = async (): Promise<void> => {
    setLoading(true);
    try {
      if (profile?.phone?.length > 0) {
        toast.error("cannot update phone as message service is not attached");
      }
      const res = await fetch("/api/auth/profile/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!res.ok) throw new Error("Failed to update profile");
      toast.success("Profile updated successfully!");
    } catch (err) {
      console.error("Update error:", err);
      toast.error("Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChangeSuccess = () => {
    // Any additional logic after password change success
  };

  const handleResetPasswordByEmail = async () => {
    // First, sign out the user using the API route
    try {
      await fetch("/api/auth/signout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      
      // Then redirect to the reset password page with the user's email
      router.push(`/reset-password?email=${encodeURIComponent(profile.email)}`);
    } catch (error) {
      toast.error("Failed to sign out. Please try again.");
      console.error("Sign out error:", error);
    }
  };

  return (
    // Updated class to remove fixed max-width and centering to match dashboard spacing
    <div className="space-y-6">
      <motion.h2 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl font-semibold"
      >
        Profile Settings
      </motion.h2>

      {/* Email */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col gap-2"
      >
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Input
            id="email"
            type="email"
            name="email"
            value={profile.email}
            onChange={handleChange}
            placeholder="you@example.com"
            className="pl-9"
          />
          <Mail className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
        </div>
      </motion.div>

      {/* Username */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-col gap-2"
      >
        <Label htmlFor="username">Username</Label>
        <div className="relative">
          <Input
            id="userName"
            type="text"
            name="userName"
            value={profile.userName}
            onChange={handleChange}
            placeholder="userName"
            className="pl-9"
          />
          <User className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
        </div>
      </motion.div>

      {/* Display Name */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex flex-col gap-2"
      >
        <Label htmlFor="displayName">Display Name</Label>
        <Input
          id="displayName"
          type="text"
          name="displayName"
          value={profile.displayName}
          onChange={handleChange}
          placeholder="Display name"
        />
      </motion.div>

      {/* Phone */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="flex flex-col gap-2"
      >
        <Label htmlFor="phone">Phone</Label>
        <div className="relative">
          <Input
            id="phone"
            type="tel"
            name="phone"
            value={profile.phone}
            onChange={handleChange}
            placeholder="+1 123 456 7890"
            className="pl-9"
          />
          <Phone className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
        </div>
      </motion.div>

      {/* Password Change Dialog */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Button 
          variant="outline" 
          className="w-full" 
          type="button" 
          onClick={() => setPasswordDialogOpen(true)}
        >
          <KeyRound className="mr-2 h-4 w-4" />
          Change Password
        </Button>
      </motion.div>
      
      {/* Reset Password by Email */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Button 
          variant="outline" 
          className="w-full" 
          type="button" 
          onClick={handleResetPasswordByEmail}
        >
          <Mail className="mr-2 h-4 w-4" />
          Reset Password by Email
        </Button>
      </motion.div>
      
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
      >
        <ChangePasswordDialog 
          open={passwordDialogOpen} 
          onOpenChange={setPasswordDialogOpen}
          onSuccess={handlePasswordChangeSuccess}
        />
      </motion.div>

      {/* Submit */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="pt-4"
      >
        <Button onClick={handleUpdate} disabled={loading} className="w-full">
          {loading ? "Updating..." : "Update Profile"}
        </Button>
      </motion.div>
    </div>
  );
};

export default ProfileSettings;