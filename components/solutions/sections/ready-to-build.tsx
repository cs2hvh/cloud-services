"use client";
import { assetUrl } from "@/lib/asset-url";

import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/container";
import Image from "next/image";
import { useState } from "react";

type FormField = {
  name: string;
  placeholder: string;
  type: "text" | "email" | "textarea";
};

type ReadyToBuildProps = {
  title: string;
  description: string;
  formFields: FormField[];
  buttonText: string;
  backgroundImage?: string;
  className?: string;
  consultationService?: string;
  onSubmitAction?: (data: Record<string, string>) => void | Promise<void>;
};

export function ReadyToBuild({
  title,
  description,
  formFields,
  buttonText,
  backgroundImage = assetUrl("/images/main-page/ready-to-secure-bg.svg"),
  className,
  consultationService,
  onSubmitAction,
}: ReadyToBuildProps) {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;

    const sanitizedData = Object.fromEntries(
      Object.entries(formData).map(([key, value]) => [key, value.trim()]),
    );

    setSubmitStatus({ type: null, message: "" });
    setIsSubmitting(true);

    try {
      if (onSubmitAction) {
        await onSubmitAction(sanitizedData);
        setSubmitStatus({
          type: "success",
          message: "Request submitted successfully.",
        });
        setFormData({});
        return;
      }

      if (!consultationService) {
        setSubmitStatus({
          type: "error",
          message: "Consultation service is not configured.",
        });
        return;
      }

      const nameField = formFields.find((field) => field.type === "text")?.name;
      const emailField = formFields.find((field) => field.type === "email")?.name;
      const bodyField = formFields.find((field) => field.type === "textarea")?.name;

      const name = (nameField && sanitizedData[nameField]) || "";
      const email = (emailField && sanitizedData[emailField]) || "";
      const body = (bodyField && sanitizedData[bodyField]) || "";

      if (!name || !email || !body) {
        setSubmitStatus({
          type: "error",
          message: "Please fill in all fields before submitting.",
        });
        return;
      }

      const response = await fetch("/api/consultation/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          body,
          service: consultationService,
        }),
      });

      const responseBody = (await response.json().catch(() => null)) as
        | { message?: string; error?: string }
        | null;

      if (!response.ok) {
        setSubmitStatus({
          type: "error",
          message:
            responseBody?.error || "Failed to submit consultation request.",
        });
        return;
      }

      setSubmitStatus({
        type: "success",
        message:
          responseBody?.message || "Consultation request submitted successfully.",
      });
      setFormData({});
    } catch (error) {
      console.error("[ReadyToBuild] Consultation submit error:", error);
      setSubmitStatus({
        type: "error",
        message: "Something went wrong while submitting your request.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const inputFields = formFields.filter((f) => f.type !== "textarea");
  const textareaFields = formFields.filter((f) => f.type === "textarea");

  return (
    <section
      className={cn(
        "relative w-full bg-[#0E0F0F] py-16 md:py-20 lg:py-24",
        className
      )}
    >
      <Container>
        {/* Main box with background */}
        <div className="relative bg-[#141414] border border-[#707070] overflow-hidden">
          {/* Background Image - covers entire box */}
          <div className="absolute inset-0">
            <Image
              src={backgroundImage}
              alt=""
              fill
              className="object-cover object-right"
            />
          </div>

          {/* Content Grid */}
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2">
            {/* Left Side - Text Content */}
            <div className="p-6 sm:p-8 md:p-10 lg:p-12 flex flex-col justify-center min-h-[200px] sm:min-h-[250px] lg:min-h-[320px]">
              <h2 className="text-xl sm:text-2xl md:text-3xl font-semibold text-white  md:mb-4">
                {title}
              </h2>
              <p className="text-sm sm:text-base text-white leading-relaxed max-w-md">
                {description}
              </p>
            </div>

            {/* Right Side - Form */}
            <div className="p-6 sm:p-8 md:p-10 lg:p-12">
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Input Fields Row */}
                {inputFields.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {inputFields.map((field) => (
                      <input
                        key={field.name}
                        type={field.type}
                        name={field.name}
                        placeholder={field.placeholder}
                        value={formData[field.name] || ""}
                        onChange={(e) => handleChange(field.name, e.target.value)}
                        required
                        className="w-full px-4 py-3 bg-transparent border border-[#6b6b6b] text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-white/60 transition-colors"
                      />
                    ))}
                  </div>
                )}

                {/* Textarea Fields */}
                {textareaFields.map((field) => (
                  <textarea
                    key={field.name}
                    name={field.name}
                    placeholder={field.placeholder}
                    value={formData[field.name] || ""}
                    onChange={(e) => handleChange(field.name, e.target.value)}
                    rows={4}
                    required
                    className="w-full px-4 py-3 bg-transparent border border-[#6b6b6b] text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-white/60 transition-colors resize-none"
                  />
                ))}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full px-6 py-3 bg-[#D4D4D4] text-black text-sm font-medium hover:bg-white/90 transition-colors cursor-pointer"
                >
                  {isSubmitting ? "Submitting..." : buttonText}
                </button>
                {submitStatus.type ? (
                  <p
                    className={cn(
                      "text-xs",
                      submitStatus.type === "success"
                        ? "text-emerald-300"
                        : "text-rose-300",
                    )}
                  >
                    {submitStatus.message}
                  </p>
                ) : null}
              </form>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
