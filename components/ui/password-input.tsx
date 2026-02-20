"use client";

import { type CSSProperties, useState } from "react";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface PasswordInputProps {
  field: Record<string, unknown>;
  placeholder: string;
  disabled?: boolean;
  className?: string;
  wrapperClassName?: string;
  toggleClassName?: string;
  style?: CSSProperties;
}

export function PasswordInput({
  field,
  placeholder,
  disabled = false,
  className,
  wrapperClassName,
  toggleClassName,
  style,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className={cn("relative", wrapperClassName)}>
      <Input
        type={showPassword ? "text" : "password"}
        placeholder={placeholder}
        {...field}
        disabled={disabled}
        className={cn("pr-10", className)}
        style={style}
      />
      <button
        type="button"
        disabled={disabled}
        className={cn(
          "absolute right-0 top-0 h-10 px-3 text-gray-400 transition hover:text-gray-200 disabled:opacity-60",
          toggleClassName,
        )}
        onClick={() => setShowPassword(!showPassword)}
      >
        {showPassword ? (
          <EyeOff className="h-4 w-4 text-gray-400" />
        ) : (
          <Eye className="h-4 w-4 text-gray-400" />
        )}
      </button>
    </div>
  );
}
