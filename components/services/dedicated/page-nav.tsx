'use client';

// The landing comp's own header: section links plus "Contact sales", with the
// hamburger that takes over below 560px. Ported with its script's behaviour —
// toggle, close when a link is followed, Escape closes and hands focus back to
// the button.
//
// Two changes. The logo is gone, because the site navbar directly above already
// shows it. And the landmark is labelled "Page sections" rather than the comp's
// "Main navigation", which now belongs to that navbar — two landmarks with the
// same name leave a screen reader unable to tell them apart.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import s from '@/components/services/dedicated/dedicated-servers.module.css';

export function DedicatedPageNav() {
    const [open, setOpen] = useState(false);
    const button = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setOpen(false);
            button.current?.focus();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    return (
        <header className={s.nav}>
            <div className={`${s.container} ${s['nav-inner']}`}>
                <button
                    ref={button}
                    type="button"
                    className={s['mobile-menu']}
                    aria-label={open ? 'Close page sections' : 'Open page sections'}
                    aria-expanded={open}
                    aria-controls="dedicated-page-sections"
                    onClick={() => setOpen((value) => !value)}
                >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 7h16M4 12h16M4 17h16" />
                    </svg>
                </button>
                <nav
                    id="dedicated-page-sections"
                    className={`${s['nav-links']}${open ? ` ${s.open}` : ''}`}
                    aria-label="Page sections"
                    onClick={(event) => {
                        if ((event.target as HTMLElement).closest('a')) setOpen(false);
                    }}
                >
                    <Link href="/services/compute" className={s['wide-link']}>
                        Compute
                    </Link>
                    <a href="#information" className={s['wide-link']}>
                        Overview
                    </a>
                    <a href="#features">Features</a>
                    <a href="#pricing">Pricing</a>
                    <a href="#more-details" className={s['wide-link']}>
                        Details
                    </a>
                    <Link className={s['nav-cta']} href="/contact">
                        Contact sales ↗
                    </Link>
                </nav>
            </div>
        </header>
    );
}
