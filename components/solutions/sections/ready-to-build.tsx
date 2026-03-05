"use client";

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
  onSubmitAction?: (data: Record<string, string>) => void;
};

export function ReadyToBuild({
  title,
  description,
  formFields,
  buttonText,
  backgroundImage = "/images/main-page/ready-to-secure-bg.png",
  className,
  onSubmitAction,
}: ReadyToBuildProps) {
  const [formData, setFormData] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmitAction?.(formData);
  };

  const handleChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const inputFields = formFields.filter((f) => f.type !== "textarea");
  const textareaFields = formFields.filter((f) => f.type === "textarea");

  return (
    <section
      className={cn(
        "relative w-full   py-16 md:py-20 lg:py-24",
        className
      )}
    >
      <Container>
        {/* Main box with background */}
        <div className="relative bg-[#141414] border border-[#737373] overflow-hidden">
          {/* Background Image - covers entire box */}
          <div className="absolute inset-0">
            <Image
              src={backgroundImage}
              alt=""
              fill
              className="object-cover object-right"
            />
            {/* Gradient overlay for text readability on left */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-transparent" />
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
                    className="w-full px-4 py-3 bg-transparent border border-[#6b6b6b] text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-white/60 transition-colors resize-none"
                  />
                ))}

                {/* Submit Button */}
                <button
                  type="submit"
                  className="w-full sm:w-auto px-6 py-3 bg-white text-black text-sm font-medium hover:bg-white/90 transition-colors"
                >
                  {buttonText}
                </button>
              </form>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
