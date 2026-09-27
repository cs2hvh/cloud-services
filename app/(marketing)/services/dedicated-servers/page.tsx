import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { assetUrl } from '@/lib/asset-url';
import { DedicatedServerCatalog } from '@/components/services/dedicated/server-catalog';
import { DedicatedIconSprite, DsIcon } from '@/components/services/dedicated/icons';
import {
    DEDICATED_ROWS,
    PREVIEW_ROWS,
} from '@/lib/catalog/dedicated-servers';
import s from '@/components/services/dedicated/dedicated-servers.module.css';

export const metadata: Metadata = {
    title: 'Dedicated Servers',
    description:
        'Dedicated servers from Ahura Sense. Compare Intel Xeon and Core, AMD Ryzen and EPYC hardware with enterprise NVMe storage and full root access.',
};

// app/(marketing)/layout.tsx already wraps every marketing route in the real
// <Navbar/> and <Footer/>, so the comp's own header and footer are not ported;
// only its "Back to top" link is kept.
const preview = DEDICATED_ROWS.slice(0, PREVIEW_ROWS);

export default function DedicatedServersPage() {
    return (
        <main className={s.ds}>
            <DedicatedIconSprite />

            {/* 01 / HERO */}
            <section className={s.hero} id="top" aria-labelledby="hero-title">
                <div className={s.container}>
                    <div className={s['hero-main']}>
                        <div className={s['hero-copy']}>
                            <h1 id="hero-title">
                                Dedicated Servers,{' '}
                                <span className={s['hero-accent']}>Built for Performance</span>
                            </h1>
                            <p>
                                Your workloads deserve room to run. Dedicated Intel and AMD servers with
                                enterprise NVMe, full root access, and the freedom to build on your terms.
                            </p>
                            <div className={s['hero-actions']}>
                                <Link className={`${s.btn} ${s['btn-primary']}`} href="#pricing">
                                    Explore dedicated servers <DsIcon name="arrow" />
                                </Link>
                                <Link className={s.btn} href="#information">
                                    Meet your infrastructure
                                </Link>
                            </div>
                            <p className={s['hero-note']}>
                                <DsIcon name="check" />
                                Single-tenant hardware. Predictable monthly pricing.
                            </p>
                        </div>
                        <div className={s['hero-art']}>
                            {/*
                              This illustration is already in the repo: the comp
                              inlines an animated version of compute-hero.png as an
                              18 MB base64 APNG, but the artwork itself is the same
                              file, transparent and at 1024². Using the one we have
                              rather than shipping a second copy of it.
                            */}
                            <Image
                                src={assetUrl('/images/compute-page/compute-hero.png')}
                                alt="Ahura Sense compute infrastructure illustration"
                                width={650}
                                height={470}
                                priority
                            />
                            <div className={s['art-caption']}>
                                BARE METAL / BUILT FOR YOUR NEXT BIG THING
                            </div>
                        </div>
                    </div>
                    <div className={s.stats}>
                        <div className={s.stat}>
                            <strong>100%</strong>
                            <span>
                                Dedicated
                                <br />
                                resources
                            </span>
                        </div>
                        <div className={s.stat}>
                            <strong>NVMe</strong>
                            <span>
                                Enterprise
                                <br />
                                storage
                            </span>
                        </div>
                        <div className={s.stat}>
                            <strong>IPMI</strong>
                            <span>
                                Remote
                                <br />
                                hardware access
                            </span>
                        </div>
                        <div className={s.stat}>
                            <strong>1–25</strong>
                            <span>
                                Gbps uplinks
                                <br />
                                by configuration
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            {/* 02 / INFORMATION */}
            <section className={`${s.section} ${s.info}`} id="information" aria-labelledby="info-title">
                <div className={`${s.container} ${s['info-grid']}`}>
                    <div>
                        <h2 id="info-title">Built for Demanding Workloads</h2>
                        <p className={s.intro}>
                            When your application outgrows shared infrastructure, give it a machine of its
                            own. Every core, every byte of memory, and every drive is dedicated to your
                            workload.
                        </p>
                        <Link className={s['text-link']} href="#pricing">
                            Find the right hardware <DsIcon name="arrow" />
                        </Link>
                    </div>
                    <div className={s.workloads}>
                        <article className={s.workload}>
                            <span className={s.number}>/ 01</span>
                            <div>
                                <h3>Built for Web &amp; SaaS</h3>
                                <p>
                                    Build your web, SaaS, and database foundation on isolated resources with
                                    predictable capacity.
                                </p>
                            </div>
                        </article>
                        <article className={s.workload}>
                            <span className={s.number}>/ 02</span>
                            <div>
                                <h3>Performance for Compute-Heavy Workloads</h3>
                                <p>
                                    Choose high-clock Ryzen hardware for game servers, real-time
                                    applications, and fast build pipelines.
                                </p>
                            </div>
                        </article>
                        <article className={s.workload}>
                            <span className={s.number}>/ 03</span>
                            <div>
                                <h3>Ready for Virtualization &amp; Data Platforms</h3>
                                <p>
                                    Bring virtualization and memory-intensive data platforms to
                                    high-core-count EPYC infrastructure.
                                </p>
                            </div>
                        </article>
                    </div>
                </div>
            </section>

            {/* 03 / FEATURES */}
            <section className={`${s.section} ${s.features}`} id="features" aria-labelledby="features-title">
                <div className={s.container}>
                    <div className={s['section-head']}>
                        <h2 id="features-title">Everything You Need, Included</h2>
                        <p>
                            From the processor to the remote console, take control of the infrastructure
                            behind your application.
                        </p>
                    </div>
                    <div className={s['feature-grid']}>
                        <article className={s.feature}>
                            <DsIcon name="chip" />
                            <span className={s['feature-no']}>01</span>
                            <h3>Dedicated Compute</h3>
                            <p>
                                Intel Xeon and Core, AMD Ryzen and EPYC options. Choose core count, clock
                                speed, and memory around the work you actually run.
                            </p>
                        </article>
                        <article className={s.feature}>
                            <DsIcon name="drive" />
                            <span className={s['feature-no']}>02</span>
                            <h3>Enterprise NVMe Storage</h3>
                            <p>
                                Keep databases, application data, and build caches close to the CPU with fast
                                local storage and multi-drive configurations.
                            </p>
                        </article>
                        <article className={s.feature}>
                            <DsIcon name="shield" />
                            <span className={s['feature-no']}>03</span>
                            <h3>Built-In DDoS Protection</h3>
                            <p>
                                Always-on L3/L4 mitigation helps protect network availability. Discuss
                                application-layer protection for your specific workload.
                            </p>
                        </article>
                        <article className={s.feature}>
                            <DsIcon name="terminal" />
                            <span className={s['feature-no']}>04</span>
                            <h3>Full Root Access</h3>
                            <p>
                                Own your software stack with full administrator access. Use IPMI / BMC for
                                out-of-band hardware management.
                            </p>
                        </article>
                        <article className={s.feature}>
                            <DsIcon name="network" />
                            <span className={s['feature-no']}>05</span>
                            <h3>High-Speed Networking</h3>
                            <p>
                                Compare uplink speeds alongside memory and storage. Choose 1, 10 or 25 Gbps
                                networking from the listed configurations.
                            </p>
                        </article>
                        <article className={s.feature}>
                            <DsIcon name="sliders" />
                            <span className={s['feature-no']}>06</span>
                            <h3>Your Choice of Operating System</h3>
                            <p>
                                Start with a familiar Linux distribution or discuss Windows Server, custom
                                images, and RAID requirements with our team.
                            </p>
                        </article>
                    </div>
                    <p className={s['feature-note']}>
                        Hardware options, operating-system compatibility, and network services depend on the
                        selected configuration.
                    </p>
                </div>
            </section>

            {/* 04 / PLANS & PRICING */}
            <section className={`${s.section} ${s.pricing}`} id="pricing" aria-labelledby="pricing-title">
                <div className={s.container}>
                    <div className={s['pc-heading']}>
                        <div>
                            <h2 id="pricing-title">Pricing</h2>
                            <p>
                                Compare all {DEDICATED_ROWS.length} dedicated-server plans by location,
                                processor, memory, storage, network, and monthly price.
                            </p>
                        </div>
                    </div>

                    <DedicatedServerCatalog
                        rows={preview}
                        preview
                        showMoreHref="/services/dedicated-servers/catalog"
                    />

                    <p className={s['pricing-note']}>
                        Configurations and list prices are the published bare-metal lineup. Prices exclude
                        tax and may change. Confirm current stock and final specifications before ordering.
                    </p>

                    <div className={s['pc-custom']}>
                        <span className={s['pc-custom-icon']}>
                            <DsIcon name="sliders" />
                        </span>
                        <div>
                            <h3>Need a Custom Configuration?</h3>
                            <p>Build around your memory, storage, and networking requirements.</p>
                        </div>
                        <Link href="/contact">
                            Discuss custom hardware <DsIcon name="arrow" />
                        </Link>
                    </div>
                </div>
            </section>

            {/* 05 / MORE DETAILS */}
            <section
                className={`${s.section} ${s['details-section']}`}
                id="more-details"
                aria-labelledby="details-title"
            >
                <div className={`${s.container} ${s['detail-grid']}`}>
                    <div className={s['detail-intro']}>
                        <h2 id="details-title">Infrastructure That Works Your Way</h2>
                        <p>
                            Keep the environment your team knows, with direct access to the hardware
                            underneath. Set the details before your server goes live.
                        </p>
                        <div className={s['os-list']} aria-label="Operating-system options to discuss">
                            <span>Ubuntu</span>
                            <span>Debian</span>
                            <span>Rocky Linux</span>
                            <span>AlmaLinux</span>
                            <span>Windows Server*</span>
                            <span>Custom ISO*</span>
                        </div>
                        <Link href="/api-docs" className={s['text-link']}>
                            Explore the documentation <DsIcon name="arrow" />
                        </Link>
                    </div>
                    <div className={s.accordion}>
                        <details open>
                            <summary>
                                <span>01</span>From configuration to first login
                                <DsIcon name="plus" />
                            </summary>
                            <p>
                                Choose a hardware profile, confirm the deployment location and available
                                stock, then select your operating system. The compute page lists 30-minute
                                provisioning for dedicated hardware; confirm the delivery time for your
                                chosen machine.
                            </p>
                        </details>
                        <details>
                            <summary>
                                <span>02</span>Operating systems and custom images
                                <DsIcon name="plus" />
                            </summary>
                            <p>
                                Discuss Linux images, Windows Server licensing, or your own installation
                                media. Custom ISO support, drivers, and remote installation options depend on
                                the server. *Confirm availability and any licensing fees before ordering.
                            </p>
                        </details>
                        <details>
                            <summary>
                                <span>03</span>Storage, RAID, and backups
                                <DsIcon name="plus" />
                            </summary>
                            <p>
                                Listed drive capacities are raw capacity; usable space depends on the
                                selected RAID layout. Confirm hardware RAID support for your configuration.
                                Plan backups separately—RAID alone does not protect against accidental
                                deletion or data corruption.
                            </p>
                        </details>
                        <details>
                            <summary>
                                <span>04</span>Networking and protection
                                <DsIcon name="plus" />
                            </summary>
                            <p>
                                Each plan lists its uplink speed and included traffic — unmetered, 50 TB or
                                100 TB. Confirm the applicable network terms, IP allocation, and DDoS coverage. L3/L4
                                network mitigation and L7 application protection are different services.
                            </p>
                        </details>
                        <details>
                            <summary>
                                <span>05</span>Management and future upgrades
                                <DsIcon name="plus" />
                            </summary>
                            <p>
                                Root access gives your team responsibility for the operating system and
                                applications. Confirm the support scope, hardware replacement process, and
                                maintenance windows. Physical memory or storage upgrades may require downtime
                                or a server migration.
                            </p>
                        </details>
                    </div>
                </div>
            </section>

            {/* The comp footer's bottom row, without the copyright the site
                footer directly below already prints. */}
            <div className={s.container}>
                <div className={s['footer-bottom']}>
                    <a href="#top">
                        Back to top
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 20V4m-6 6 6-6 6 6" />
                        </svg>
                    </a>
                </div>
            </div>
        </main>
    );
}
