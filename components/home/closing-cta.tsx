import Link from "next/link";

/**
 * ClosingCta — the strip that closes the home page.
 *
 * Replaces the ComplianceCta block, which was a full centred section with an
 * eyebrow, a two-line heading, a paragraph and two buttons. This says the same
 * thing in a single band: label on the left, the line in the middle, one
 * action on the right.
 *
 * White ground on a dark page, so it reads as the end of the scroll rather
 * than one more dark section. All colour comes from the .ah-cta-strip scope in
 * globals.css — the button inverts there because .ah-btn-outline's white fill
 * would be invisible on this ground.
 */
export function ClosingCta() {
    return (
        <section
            className="ah-cta-strip px-6 py-14 sm:px-10 lg:px-12 lg:py-16"
            aria-labelledby="closing-heading"
        >
            {/* the two flanking columns are the same width so the headline
                sits optically centred in the band rather than pushed by the
                longer of the two */}
            <div className="mx-auto flex max-w-[1704px] flex-col items-center gap-9 text-center lg:flex-row lg:justify-between lg:gap-14">
                <span className="ah-lbl shrink-0 lg:w-[11rem] lg:text-left">
                    Ready to build?
                </span>

                <h2 id="closing-heading" className="ah-h2">
                    Infrastructure that moves
                    <br />
                    at the <span className="ah-h2-hl">speed of your ideas.</span>
                </h2>

                <div className="shrink-0 lg:w-[11rem] lg:text-right">
                    <Link
                        href="/signup"
                        className="ah-btn-outline ah-notch-sm inline-flex items-center gap-2 px-7 py-3.5 text-sm font-medium"
                    >
                        Get started
                        <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                            <path d="M3.5 10.5 10.5 3.5M5 3.5h5.5V9" />
                        </svg>
                    </Link>
                </div>
            </div>
        </section>
    );
}

export default ClosingCta;
