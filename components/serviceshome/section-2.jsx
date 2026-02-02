import Image from "next/image";

const defaultItems = [
	{
		title: "Latest GPU Hardware",
		description:
			"Access NVIDIA H100, A100, and RTX 4090 GPUs for maximum performance. Updated regularly with the latest hardware.",
		iconSrc: "/images/Features/gpu.png",
		iconAlt: "GPU hardware",
	},
	{
		title: "Multi-GPU Support",
		description:
			"Scale from single GPU to multi-node clusters with NVLink interconnect for distributed training workloads.",
		iconSrc: "/images/Features/multi-gpu.png",
		iconAlt: "Multi GPU",
	},
	{
		title: "Fast Storage",
		description:
			"High-bandwidth NVMe storage optimized for training data. Local SSD for maximum IOPS.",
		iconSrc: "/images/Features/storage.png",
		iconAlt: "Fast storage",
	},
	{
		title: "Spot Instances",
		description:
			"Save up to 90% with spot instances for fault-tolerant workloads. Automatic checkpointing included.",
		iconSrc: "/images/Features/spot.png",
		iconAlt: "Spot instances",
	},
	{
		title: "Pre-configured Environments",
		description:
			"Start faster with pre-installed CUDA, cuDNN, PyTorch, TensorFlow, and other ML frameworks.",
		iconSrc: "/images/Features/env.png",
		iconAlt: "Preconfigured environments",
	},
];

function ServicesHomeSectionTwo({
	badge = "Features",
	title = "Powerful Capabilities",
	description,
	backgroundImage,
	items = defaultItems,
	className = "",
}) {
	return (
		<section
			className={`relative w-full overflow-hidden bg-[#0A0A0A] ${className}
            
            
            
            `}
		>
			{backgroundImage ? (
				<div className="absolute inset-0">
					<Image
						src={backgroundImage}
						alt=""
						fill
						className="object-cover opacity-60"
						priority={false}
					/>
					<div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-black" />
				</div>
			) : (
				<div className="absolute inset-0">
					<div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.08),_transparent_55%)]" />
					<div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.06),_transparent_45%)]" />
				</div>
			)}

			<div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-14 sm:px-8 sm:py-16 lg:flex-row lg:items-center lg:gap-14 lg:px-12 lg:py-20">
				<div className="max-w-xl">
					<span className="inline-flex items-center rounded-full border border-white/20 px-4 py-1 text-xs text-white/80">
						{badge}
					</span>
					<h2 className="mt-6 text-3xl font-normal tracking-tight text-white sm:text-4xl whitespace-nowrap">
						{title}
					</h2>
					
				</div>


					{/* Right */}
					<div className="grid w-full grid-cols-6 gap-10 text-center sm:grid-cols-6 lg:grid-cols-6 lg:[&>div:nth-child(-n+2)]:col-span-3 lg:[&>div]:col-span-2 lg:ml-6">
						{items.map((item) => (
							<div key={item.title} className="col-span-6 flex flex-col items-center sm:col-span-3">
								<div className="relative h-12 w-12 sm:h-14 sm:w-14">
									{item.iconSrc ? (
										<Image
											src={item.iconSrc}
											alt={item.iconAlt || item.title}
											fill
											className="object-contain"
										/>
									) : (
										<div className="h-3 w-3 rounded-full bg-white/60" />
									)}
								</div>
								<h3 className="mt-4 text-sm font-semibold text-white sm:text-base">
									{item.title}
								</h3>
								<p className="mt-2 max-w-[240px] text-xs leading-relaxed text-white/70 sm:text-sm whitespace-pre-line">
									{item.description}
								</p>
							</div>
						))}
					</div>
			</div>
		</section>
	);
}

export default ServicesHomeSectionTwo;
