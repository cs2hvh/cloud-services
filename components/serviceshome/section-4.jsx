export default function ServicesHomeSectionTwo() {
	return (
		<section
         
         className="w-full bg-transparent py-16 sm:py-20 lg:py-24
         bg-[url('/images/main-page/service-home-section-4-bg.svg')]
    bg-no-repeat bg-cover bg-center">
			<div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
				<header className="mb-10 sm:mb-12 lg:mb-14">
					<p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">
						Use Cases
					</p>
					<h2 className="mt-2 text-3xl font-semibold text-white sm:text-4xl lg:text-5xl">
						Built For <span className="text-sky-400">Your Needs</span>
					</h2>
				</header>

				<div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-2 lg:gap-x-16 lg:gap-y-10 lg:justify-items-center">
					<article className="w-full max-w-[520px] mr-80 rounded-none border border-white/30 bg-black/40 px-6 py-5 sm:px-7 sm:py-6">
						<h3 className="text-lg font-semibold text-white">AI/ML Training</h3>
						<p className="mt-2 text-sm leading-relaxed text-white/70 sm:text-base">
							Train large language models and deep learning networks with
							high-performance GPU clusters.
						</p>
					</article>

					<article className="w-full max-w-[520px] mr-80  rounded-none border border-white/30 bg-black/40 px-6 py-5 sm:px-7 sm:py-6">
						<h3 className="text-lg font-semibold text-white">Inference at Scale</h3>
						<p className="mt-2 text-sm leading-relaxed text-white/70 sm:text-base">
							Deploy ML models for real-time inference with auto-scaling
							based on request volume.
						</p>
					</article>

					<article className="w-full max-w-[520px] rounded-none border border-white/30 bg-black/40 px-6 py-5 sm:px-7 sm:py-6">
						<h3 className="text-lg font-semibold text-white">3D Rendering</h3>
						<p className="mt-2 text-sm leading-relaxed text-white/70 sm:text-base">
							Render complex 3D scenes and animations with professional-
							grade GPU acceleration.
						</p>
					</article>

					<article className="w-full max-w-[520px] rounded-none border border-white/30 bg-black/40 px-6 py-5 sm:px-7 sm:py-6">
						<h3 className="text-lg font-semibold text-white">Scientific Computing</h3>
						<p className="mt-2 text-sm leading-relaxed text-white/70 sm:text-base">
							Run simulations, molecular dynamics, and other HPC workloads
							with GPU acceleration.
						</p>
					</article>
				</div>
			</div>
		</section>
	);
}
