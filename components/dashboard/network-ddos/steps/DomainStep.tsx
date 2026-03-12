"use client";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronRight, Globe } from "lucide-react";
import { StepProps } from "./types";
import { toast } from "sonner";

export const DomainStep = ({
  formData,
  onUpdate,
  onNext,
  onBack,
  spectrumApps,
}: StepProps) => {
  //console.log(spectrumApps,"........spectrumApps in domain step........");
  const handleNext = () => {
    if (!formData.domain.trim()) {
      toast.error("Please enter a domain name");
      return;
    }
    //formData.name cannot have numbers only or start with numbers or special characters, it must be alphanumeric and can include hyphens but cannot start or end with a hyphen
    if (
      !/^(?=.*[A-Za-z])[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/.test(
        formData.domain,
      )
    ) {
      toast.error(
        "Domain name must start with a letter, contain at least one letter, may include hyphens, and cannot start, end, or repeat hyphens.",
      );
      return;
    }

    if (spectrumApps?.includes(formData.domain)) {
      toast.error(
        "This domain name is already in use. Please choose a different one.",
      );
      return;
    }

    // Validate alphanumeric only
    const alphanumericRegex = /^[a-zA-Z0-9]+$/;
    if (!alphanumericRegex.test(formData.domain)) {
      toast.error("Domain name must contain only letters and numbers");
      return;
    }

    onNext();
  };

  const handleDomainChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow alphanumeric characters
    const sanitized = value.replace(/[^a-zA-Z0-9]/g, "");
    onUpdate({ domain: sanitized });
  };

  return (
    <Card className="glass-panel overflow-hidden">
      <CardHeader>
        <div className="flex gap-2">
          <Globe className="w-5 h-5 text-blue-400" />
          <CardTitle className="text-white">Domain Name</CardTitle>
        </div>
        <p className="text-sm text-white/60">
          Your application will be associated with a DNS name on your Cloudflare
          zone
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Input
            id="domain"
            value={formData.domain}
            onChange={handleDomainChange}
            type="text"
            placeholder="myapp123"
            className="bg-white/10 border-white/20 rounded-md text-white placeholder:text-white/50"
          />
          <p className="text-xs text-white/60 mt-2">
            Only letters and numbers are allowed (e.g., myapp123)
          </p>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button
          variant="outline"
          onClick={onBack}
          className="cursor-pointer rounded-md border-white/[0.14] bg-white/[0.03] text-white/82 hover:bg-white/[0.07]"
        >
          Back
        </Button>
        <Button
          onClick={handleNext}
          className="cursor-pointer rounded-md border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
        >
          Next <ChevronRight size={16} className="ml-2" />
        </Button>
      </CardFooter>
    </Card>
  );
};
