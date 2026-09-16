import type { Metadata } from 'next';
import Link from 'next/link';

import { DedicatedServerCatalog } from '@/components/services/dedicated/server-catalog';
import { DedicatedIconSprite } from '@/components/services/dedicated/icons';
import {
    DEDICATED_COUNTRIES,
    DEDICATED_ROWS,
    DEDICATED_VENDOR_COUNT,
} from '@/lib/catalog/dedicated-servers';
import s from '@/components/services/dedicated/dedicated-servers.module.css';

export const metadata: Metadata = {
    title: 'Dedicated Server Catalog',
    description:
        'Search and filter the complete Ahura Sense dedicated-server lineup by country, processor, memory, storage, network, and monthly price.',
};

// `.catalog-page` sits on the <main>, not on the `.ds` wrapper: the comp set it
// on <body> and every rule that uses it is written as a descendant of what is
// now `.ds`, so the two classes have to live on different elements. The comp's
// catalog header lives inside that <main> for the same reason — its styles are
// written as `.catalog-page .catalog-nav`.
//
// From the comp's header and footer, only what the site navbar and footer do
// not already provide is ported: the route back to the overview, Compute, and
// "Contact sales". The logo and copyright are theirs.
export default function DedicatedServerCatalogPage() {
    return (
        <div className={s.ds}>
            <DedicatedIconSprite />
            <main className={`${s['catalog-page']} ${s['catalog-page-main']}`} id="catalog-main">
                <header className={s['catalog-nav']}>
                    <div className={`${s.container} ${s['catalog-nav-inner']}`}>
                        <nav className={s['catalog-nav-links']} aria-label="Catalog navigation">
                            <Link href="/services/dedicated-servers">Dedicated server overview</Link>
                            <Link href="/services/compute">Compute</Link>
                            <Link className={s['catalog-contact']} href="/contact">
                                Contact sales ↗
                            </Link>
                        </nav>
                    </div>
                </header>
                <section
                    className={`${s['catalog-page-section']} ${s.pricing}`}
                    id="pricing"
                    aria-labelledby="pricing-title"
                >
                    <div className={s.container}>
                        <div className={s['pc-heading']}>
                            <div>
                                <h1 id="pricing-title">
                                    Dedicated servers.
                                    <br />
                                    <span>Ready to compare.</span>
                                </h1>
                                <p>
                                    Search and filter the complete lineup by country, processor, memory,
                                    storage, network, and monthly price.
                                </p>
                            </div>
                            <div className={s['catalog-page-summary']}>
                                <div>
                                    <strong>{DEDICATED_ROWS.length}</strong>
                                    <span>Configurations</span>
                                </div>
                                <div>
                                    <strong>{DEDICATED_COUNTRIES.length}</strong>
                                    <span>Countries</span>
                                </div>
                                <div>
                                    <strong>{DEDICATED_VENDOR_COUNT}</strong>
                                    <span>CPU brands</span>
                                </div>
                            </div>
                        </div>

                        <DedicatedServerCatalog rows={DEDICATED_ROWS} />

                        <p className={s['pricing-note']}>
                            Configurations and list prices are the published bare-metal lineup — the same
                            one the dashboard shows once you sign in. Prices exclude tax and may change.
                        </p>
                    </div>
                </section>
                <p className={`${s['catalog-page-note']} ${s.container}`}>
                    Confirm current availability, taxes, setup fees, and final specifications before
                    ordering.
                </p>
                {/* The comp's page footer, without the copyright the site footer
                    directly below already prints. A <div>, not a <footer>: inside
                    <main> it is not the page's contentinfo, the site footer is. */}
                <div className={s['catalog-page-footer']}>
                    <div className={s.container}>
                        <Link href="/services/dedicated-servers">Back to dedicated server overview →</Link>
                    </div>
                </div>
            </main>
        </div>
    );
}
