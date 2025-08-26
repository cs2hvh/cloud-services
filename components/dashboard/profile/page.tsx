"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, User, Phone, Image as ImageIcon } from "lucide-react";
import Image from "next/image";
import api from "@/lib/axios/axios";
import { toast } from "sonner";

// Types for user profile
interface UserProfile {
  email: string;
  password: string;
  profilePic: string;
  phone: string;
  userName: string;
  displayName: string;
}

const ProfileSettings: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile>({
    email: "",
    password: "",
    profilePic: "",
    phone: "",
    userName: "",
    displayName: "",
  });

  const [loading, setLoading] = useState(false);

  // ✅ Fetch user data (example API call)
  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await api.get("/auth/profile/read");
        console.log(res.data,"....res.data..")
        if (res.status != 200) throw new Error("Failed to load profile");
        const data: UserProfile = res.data;
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
      if(profile?.phone?.length>0){
        toast.error('cannot update phone as message service is not attached')
      }
      const res = await fetch("/api/auth/profile/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!res.ok) throw new Error("Failed to update profile");
      alert("Profile updated successfully!");
    } catch (err) {
      console.error("Update error:", err);
      alert("Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 bg-white rounded-lg shadow-md space-y-6">
      <h2 className="text-2xl font-semibold">Profile Settings</h2>

      {/* Profile Picture */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="profilePic">Profile Picture</Label>
        <div className="relative">
          <Input
            id="profilePic"
            name="profilePic"
            value={profile.profilePic}
            onChange={handleChange}
            placeholder="Enter image URL"
            className="pl-9"
          />
          <ImageIcon className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
        </div>
        {profile.profilePic && (
          <Image
            src={profile.profilePic}
            alt="Profile Preview"
            className="h-16 w-16 rounded-full border object-cover mt-2"
          />
        )}
      </div>

      {/* Email */}
      <div className="flex flex-col gap-2">
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
      </div>


      {/* Username */}
      <div className="flex flex-col gap-2">
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
      </div>

      {/* Display Name */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">Display Name</Label>
        <Input
          id="displayName"
          type="text"
          name="displayName"
          value={profile.displayName}
          onChange={handleChange}
          placeholder="Display name"
        />
      </div>

      {/* Phone */}
      <div className="flex flex-col gap-2">
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
      </div>

      {/* Submit */}
      <div className="pt-4">
        <Button onClick={handleUpdate} disabled={loading} className="w-full">
          {loading ? "Updating..." : "Update"}
        </Button>
      </div>
    </div>
  );
};

export default ProfileSettings;
