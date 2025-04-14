import { ReactNode } from "react"
import { cn } from "@/lib/utils"

const WidthWrapper = ({
    className,
    children
}: {
    className?: string
    children: ReactNode
}) => {
    return (
        <div className={cn("container max-w-screen-2xl px-4 sm:px-14 mx-auto", className)}>{children}</div>
    )
}

export default WidthWrapper