"use client";

import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  User, 
  Shield,
  QrCode
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ProfileSettings from "@/components/dashboard/profile/page";
import Accounts from "@/components/dashboard/accounts/page";
import EnableTotp from "@/components/dashboard/2fa/page";

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState<"profile" | "account" | "security">("profile");

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings and preferences</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-4 mb-6 border-b border-white/10">
        <Button
          variant={activeTab === "profile" ? "default" : "ghost"}
          className={`px-4 py-2 rounded-b-none ${
            activeTab === "profile" 
              ? "bg-white text-black" 
              : "text-white hover:bg-white/10"
          }`}
          onClick={() => setActiveTab("profile")}
        >
          <User className="h-4 w-4 mr-2" />
          Profile
        </Button>
        
        <Button
          variant={activeTab === "account" ? "default" : "ghost"}
          className={`px-4 py-2 rounded-b-none ${
            activeTab === "account" 
              ? "bg-white text-black" 
              : "text-white hover:bg-white/10"
          }`}
          onClick={() => setActiveTab("account")}
        >
          <Shield className="h-4 w-4 mr-2" />
          Account
        </Button>
        
        <Button
          variant={activeTab === "security" ? "default" : "ghost"}
          className={`px-4 py-2 rounded-b-none ${
            activeTab === "security" 
              ? "bg-white text-black" 
              : "text-white hover:bg-white/10"
          }`}
          onClick={() => setActiveTab("security")}
        >
          <QrCode className="h-4 w-4 mr-2" />
          Security
        </Button>
      </div>

      {/* Tab Content */}
      <Card className="bg-black/50 border-white/10">
        <CardContent className="pt-6">
          {activeTab === "profile" && (
            <div>
              <div className="mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile Settings
                </h2>
                <p className="text-sm text-muted-foreground">Update your profile information</p>
              </div>
              <ProfileSettings />
            </div>
          )}

          {activeTab === "account" && (
            <div>
              <div className="mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Account Settings
                </h2>
                <p className="text-sm text-muted-foreground">Manage your connected accounts</p>
              </div>
              <Accounts />
            </div>
          )}

          {activeTab === "security" && (
            <div>
              <div className="mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <QrCode className="h-5 w-5" />
                  Security Settings
                </h2>
                <p className="text-sm text-muted-foreground">Manage your security preferences</p>
              </div>
              <EnableTotp />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;