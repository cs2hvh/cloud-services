"use client";

// Brand/software icons for GPU container-image templates. Resolves a template's
// name (+ image ref) to a real logo: brand SVG/PNG assets in /public/software,
// the shared NvidiaLogo for CUDA, and a node-graph glyph for ComfyUI. Falls
// back to a generic container box for anything unrecognised (e.g. custom images
// the keyword set doesn't match).

import { Box, Workflow } from "lucide-react";
import { NvidiaLogo } from "@/components/branding/nvidia-logo";

// Plain <img> on purpose: these are tiny static brand assets in /public, and
// next/image refuses local SVGs unless dangerouslyAllowSVG is set. No
// optimization is needed for a 20px logo.
function Img({ src, size, className }: { src: string; size: number; className?: string }) {
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={src}
            alt=""
            width={size}
            height={size}
            className={`object-contain ${className ?? ""}`}
            style={{ width: size, height: size }}
        />
    );
}

export function SoftwareIcon({
    name,
    image,
    size = 22,
    className,
}: {
    name?: string;
    image?: string;
    size?: number;
    className?: string;
}) {
    const hay = `${name ?? ""} ${image ?? ""}`.toLowerCase();

    // Frameworks first — "PyTorch + CUDA 12.1" should read as PyTorch, not CUDA.
    if (/pytorch|torch/.test(hay)) return <Img src="/software/pytorch.svg" size={size} className={className} />;
    if (/tensorflow|tflow|\btf\b/.test(hay)) return <Img src="/software/tensorflow.svg" size={size} className={className} />;
    if (/vllm/.test(hay)) return <Img src="/software/vllm.png" size={size} className={className} />;
    if (/comfyui|comfy/.test(hay)) {
        return (
            <Workflow
                style={{ width: size * 0.82, height: size * 0.82 }}
                className={`text-[#9d6bff] ${className ?? ""}`}
            />
        );
    }
    // CUDA toolkit / NVIDIA-only images → the brand mark.
    if (/\bcuda\b|nvidia|nvcc|cudnn/.test(hay)) {
        return (
            <span
                className={`inline-flex items-center justify-center ${className ?? ""}`}
                style={{ width: size, height: size }}
            >
                <NvidiaLogo width={size} height={Math.round(size * 0.72)} />
            </span>
        );
    }
    if (/ubuntu/.test(hay)) return <Img src="/software/ubuntu.svg" size={size} className={className} />;
    if (/python|conda|jupyter/.test(hay)) return <Img src="/software/python.svg" size={size} className={className} />;
    // Custom / bring-your-own Docker image.
    if (/custom|docker|registry|image/.test(hay)) return <Img src="/software/docker.svg" size={size} className={className} />;

    return (
        <Box
            style={{ width: size * 0.8, height: size * 0.8 }}
            className={`text-white/55 ${className ?? ""}`}
        />
    );
}
