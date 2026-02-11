

export default function ServicesHomeSectionFour({ plans}) {
    const indentClass = "pl-[15%]";

    return (
        <section className="relative w-full overflow-hidden bg-[#363636] bg-[url('/images/main-page/service-home-section-4-bg.svg')] bg-cover bg-center backdrop-blur-[50px] py-16 shadow-[-4px_17px_13.4px_0px_#363636]  sm:py-20 lg:py-24">
            {/* <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                <div className="absolute inset-0 bg-[radial-gradient(584%_96.29%_at_39.88%_60.67%,_#002F93_0.35%,_#000133_57.69%)] opacity-80 blur-[23.4px]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(17,60,120,0.35),_transparent_55%)]" />
            </div> */}

			
            <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
                <header className="text-center">
                    <p className="font-[Sansation] text-[28px] font-semibold tracking-tight text-white sm:text-[34px] lg:text-[40px]">
                        <span className="text-white/80">Choose Your Perfect </span>
                        <span className="text-sky-400">Plan</span>
                    </p>
                </header>

				  

                <div className="mt-16 grid gap-6 gap-x-10 md:grid-cols-2 lg:mt-16 lg:grid-cols-3">
                    {plans.map((plan) => (
                        <article
                            key={plan.title}
                            className="group relative flex flex-col items-start overflow-hidden rounded-none border border-white/15 bg-transparent px-8 py-10 font-[Sansation] text-white shadow-[0_25px_60px_rgba(0,0,0,0.55)] transition-transform duration-300 ease-out hover:scale-[1.08] hover:bg-[radial-gradient(584%_96.29%_at_39.88%_60.67%,_#002F93_0.35%,_#000133_57.69%)]"
                        >
                           
                                <span className={`mb-4 inline-block text-2xl font-semibold   text-white ${indentClass}`}>
                                    {plan.badge}
                                </span>
                            
                            <div className={`w-full text-left ${indentClass}`}>
                                <h3 className="text-4xl font-semibold">{plan.title}</h3>
                                <p className="mt-4 text-sm leading-relaxed text-white/80">{plan.description}</p>
                            </div>
                            <ul className={`mt-8 w-full space-y-2 text-left text-sm text-white/90 ${indentClass}`}>
                                {plan.features.map((feature) => (
                                    <li key={feature}>• {feature}</li>
                                ))}
                            </ul>
                            <button
                                type="button"
                                className="mt-10 ml-[15%] inline-flex w-full max-w-[180px] items-center justify-center border border-white/30 px-5 py-2 text-sm font-semibold text-white transition-transform duration-200 hover:scale-105"
                            >
                                Choose Plan
                            </button>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}