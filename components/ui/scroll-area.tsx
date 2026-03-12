"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type ScrollAreaProps = React.HTMLAttributes<HTMLDivElement>

type ScrollBarProps = React.HTMLAttributes<HTMLDivElement> & {
  orientation?: "vertical" | "horizontal"
}

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("relative overflow-auto", className)}
      {...props}
    >
      {children}
    </div>
  )
)
ScrollArea.displayName = "ScrollArea"

const ScrollBar = React.forwardRef<HTMLDivElement, ScrollBarProps>(
  ({ className, orientation = "vertical", ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute rounded-full bg-transparent",
        orientation === "vertical" ? "right-1 top-1 bottom-1 w-2" : "left-1 right-1 bottom-1 h-2",
        className
      )}
      {...props}
    />
  )
)
ScrollBar.displayName = "ScrollBar"

export { ScrollArea, ScrollBar }