import Link from "next/link";

/**
 * ComplianceCta — closing call to action.
 *
 * Copy note: the previous version read "Use ahurasense's flexible building
 * blocks to keep your customers' data secure and compliant at all times",
 * which is generic vendor phrasing that could describe any provider. It now
 * says what the platform actually does, and drops the lowercase brand spelling
 * that conflicted with "AhuraSense Cloud" in the metadata and nav.
 */
export function ComplianceCta() {
  return (
    <section
      className="relative overflow-hidden px-6 py-24 text-center sm:px-10 lg:py-32"
      style={{ background: "var(--ah-surface)", borderTop: "1px solid var(--ah-line-hi)" }}
      aria-labelledby="compliance-heading"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(820px 340px at 50% 20%, rgba(0,149,255,.12), transparent 72%)",
        }}
      />

      {/*
        The eyebrow label is gone and the copy has moved onto a white plate
        lifted off the dark section. Colours invert inside it: black type, and
        the light-ground blue for the highlight, since the dark-ground blue is
        unreadable on white. See .ah-trust-panel in globals.css.
      */}
      <div className="relative mx-auto max-w-[52rem]">
        <div className="ah-trust-panel px-7 py-12 sm:px-12 lg:px-16 lg:py-16">
          <h2 id="compliance-heading" className="ah-h2">
            Meet compliance requirements.
            <br />
            <span className="ah-h2-hl">Build customer trust.</span>
          </h2>

          <p
            className="mx-auto mt-6 max-w-[33rem] text-base leading-[1.6]"
            style={{ color: "#4a4a55" }}
          >
            Residency, encryption and an exportable audit trail built into the
            platform rather than bolted on.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-2.5">
            <Link
              href="/api-docs"
              className="ah-btn-outline ah-notch-sm inline-flex items-center gap-2 px-7 py-3.5 text-sm font-medium"
            >
              Documentation
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
              </svg>
            </Link>
            <Link
              href="/trust"
              className="ah-btn-outline ah-notch-sm inline-flex items-center gap-2 px-7 py-3.5 text-sm font-medium"
            >
              Trust centre
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ComplianceCta;
