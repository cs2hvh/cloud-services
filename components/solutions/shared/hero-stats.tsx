import { Container } from "@/components/ui/container";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

export type HeroStatsItem = {
    value: string;
    label: string;
    sub?: string;
};

export function HeroStats({
    metrics,
    eyebrow = "At a glance",
}: {
    metrics: HeroStatsItem[];
    eyebrow?: string;
}) {
    const count = metrics.length;

    return (
        <section className="relative overflow-hidden bg-[#0D0D0F] py-14 sm:py-16">
            <Container>
                <div className="mx-auto max-w-[1180px]">
                    {/* Eyebrow strip */}
                    <div className="mb-7 flex items-center gap-5">
                        <p className={`${MONO} inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/55`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                            {eyebrow}
                        </p>
                        <div aria-hidden className="h-px flex-1 bg-gradient-to-r from-white/[0.10] to-transparent" />
                        <p className={`${MONO} text-[10px] uppercase tracking-[0.18em] text-white/30`}>
                            {String(count).padStart(2, "0")} metrics
                        </p>
                    </div>

                    {/* Metrics grid */}
                    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-white/[0.10] bg-white/[0.08] sm:grid-cols-4">
                        {metrics.map((m, i) => (
                            <div
                                key={m.label}
                                className="group relative flex flex-col gap-5 overflow-hidden bg-[#0F1114] px-5 py-7 transition-colors hover:bg-[#13161B] sm:px-6 sm:py-8"
                            >
                                {/* Index in corner */}
                                <span
                                    className={`${MONO} absolute right-4 top-4 text-[10px] font-semibold tabular-nums text-white/25`}
                                >
                                    {String(i + 1).padStart(2, "0")}
                                </span>

                                {/* Label */}
                                <p
                                    className={`${MONO} relative inline-flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-white/60`}
                                >
                                    <span className="h-1 w-1 rounded-full bg-[#0095FF]" />
                                    {m.label}
                                </p>

                                {/* Value + accent line */}
                                <div className="relative">
                                    <p
                                        className={`${MONO} text-[30px] font-bold leading-none tabular-nums text-white sm:text-[36px]`}
                                    >
                                        {m.value}
                                    </p>
                                    <div
                                        aria-hidden
                                        className="mt-3.5 h-[2px] w-9 bg-[#0095FF] transition-all duration-300 group-hover:w-14"
                                    />
                                </div>

                                {m.sub && (
                                    <p
                                        className={`${MONO} relative mt-auto text-[10px] uppercase tracking-[0.14em] text-white/40`}
                                    >
                                        {m.sub}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </Container>
        </section>
    );
}
