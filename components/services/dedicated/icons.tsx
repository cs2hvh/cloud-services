// The comps' icon sprite, kept as a sprite.
//
// Both comps define one hidden <svg> of <symbol>s and reference them with
// <use href="#name">, which is why the CSS styles a bare `svg` (stroke, size)
// rather than each icon. Inlining each path instead would mean re-deriving
// that styling per icon, so the sprite is ported as-is: <DedicatedIconSprite/>
// once per page, <DsIcon/> wherever the markup had a <use>.

export type DsIconName =
    | 'arrow'
    | 'plus'
    | 'chip'
    | 'drive'
    | 'shield'
    | 'terminal'
    | 'network'
    | 'sliders'
    | 'check';

export function DedicatedIconSprite() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" style={{ display: 'none' }} aria-hidden="true">
            <symbol id="arrow" viewBox="0 0 24 24">
                <path d="M4 12h15m-6-6 6 6-6 6" />
            </symbol>
            <symbol id="plus" viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" />
            </symbol>
            <symbol id="chip" viewBox="0 0 24 24">
                <rect x="5" y="5" width="14" height="14" rx="2" />
                <path d="M9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4m14-6h4m-4 6h4" />
                <path d="M9 9h6v6H9z" />
            </symbol>
            <symbol id="drive" viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 14h18m-13 3h.01m4 0h5M7 8h10" />
            </symbol>
            <symbol id="shield" viewBox="0 0 24 24">
                <path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z" />
                <path d="m8 12 3 3 5-6" />
            </symbol>
            <symbol id="terminal" viewBox="0 0 24 24">
                <rect x="2" y="3" width="20" height="18" rx="2" />
                <path d="m6 8 4 4-4 4m7 0h5" />
            </symbol>
            <symbol id="network" viewBox="0 0 24 24">
                <rect x="9" y="2" width="6" height="5" rx="1" />
                <rect x="2" y="17" width="6" height="5" rx="1" />
                <rect x="16" y="17" width="6" height="5" rx="1" />
                <path d="M12 7v5M5 17v-5h14v5" />
            </symbol>
            <symbol id="sliders" viewBox="0 0 24 24">
                <path d="M5 3v5m0 4v9M12 3v10m0 4v4m7-18v3m0 4v11" />
                <path d="M2 8h6v4H2zm7 5h6v4H9zm7-7h6v4h-6z" />
            </symbol>
            <symbol id="check" viewBox="0 0 24 24">
                <path d="m5 12 4 4L19 6" />
            </symbol>
        </svg>
    );
}

export function DsIcon({ name }: { name: DsIconName }) {
    return (
        <svg aria-hidden="true">
            <use href={`#${name}`} />
        </svg>
    );
}

/** The globe drawn inline in the comps' country filter and location cells. */
export function DsGlobeIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" />
        </svg>
    );
}
