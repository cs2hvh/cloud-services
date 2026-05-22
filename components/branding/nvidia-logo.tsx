import Image from "next/image";

interface NvidiaLogoProps {
    className?: string;
    width?: number;
    height?: number;
    priority?: boolean;
}

export function NvidiaLogo({
    className,
    width = 20,
    height = 14,
    priority = false,
}: NvidiaLogoProps) {
    return (
        <Image
            src="/nvidia/Nvidia-Logo.png"
            alt="NVIDIA"
            width={width}
            height={height}
            priority={priority}
            className={className}
            style={{ objectFit: "contain" }}
        />
    );
}
