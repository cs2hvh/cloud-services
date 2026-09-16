'use client';

// The dedicated-server table, ported from the supplied comps.
//
// Markup, class names and filter behaviour follow the comps' own: the country
// popover with live per-country counts, the "More filters" disclosure, the
// applied-filter chips, header sorting that cycles ascending → descending, the
// empty state, and the per-row details disclosure. The comps ship this as one
// IIFE driving data-* attributes on each <tbody>; here the same state lives in
// React, and the data-* attributes stay so the CSS that keys off them still
// applies.
//
// One component serves both pages. `preview` renders the landing page's
// ten-row teaser — no search field, and the fade with "Show more servers" —
// while the catalog page renders every row with search.

import { Fragment, useId, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

import { assetUrl } from '@/lib/asset-url';

import { countriesFor, type DedicatedRow } from '@/lib/catalog/dedicated-servers';
import { DsGlobeIcon, DsIcon } from '@/components/services/dedicated/icons';
import s from '@/components/services/dedicated/dedicated-servers.module.css';

type SortKey = 'name' | 'cores' | 'ram' | 'storage' | 'network' | 'price';

const SORT_NAMES: Record<SortKey, string> = {
    name: 'Plan',
    cores: 'CPU cores',
    ram: 'Memory',
    storage: 'Storage',
    network: 'Network',
    price: 'Monthly price',
};

const COLUMNS: { key: SortKey; label: string }[] = [
    { key: 'name', label: 'Plan' },
    { key: 'cores', label: 'CPU' },
    { key: 'ram', label: 'Memory' },
    { key: 'storage', label: 'Storage' },
    { key: 'network', label: 'Network' },
    { key: 'price', label: 'Monthly price' },
];

// The comps' select steps, re-cut for this lineup: it runs 6 → 192 cores,
// 64 GB → 768 GB, 1 → 25 Gbps and $69 → $3,990, where the comps' workbook
// stopped at 128 GB, 10 Gbps and €1,500.
const BRANDS = [
    { value: 'all', label: 'All brands' },
    { value: 'intel', label: 'Intel' },
    { value: 'amd', label: 'AMD' },
];
const MEMORY = [
    { value: 0, label: 'Any capacity' },
    { value: 64, label: '64 GB or more' },
    { value: 128, label: '128 GB or more' },
    { value: 256, label: '256 GB or more' },
    { value: 512, label: '512 GB or more' },
];
const NETWORK = [
    { value: 0, label: 'Any uplink' },
    { value: 1, label: '1 Gbps or more' },
    { value: 10, label: '10 Gbps or more' },
    { value: 25, label: '25 Gbps' },
];
const CORES = [
    { value: 0, label: 'Any core count' },
    { value: 16, label: '16 cores or more' },
    { value: 32, label: '32 cores or more' },
    { value: 64, label: '64 cores or more' },
];
const STORAGE = [
    { value: 0, label: 'Any capacity' },
    { value: 2, label: '2 TB or more' },
    { value: 4, label: '4 TB or more' },
    { value: 8, label: '8 TB or more' },
];
const BUDGET = [
    { value: 0, label: 'Any budget' },
    { value: 200, label: 'Up to $200' },
    { value: 500, label: 'Up to $500' },
    { value: 1000, label: 'Up to $1,000' },
    { value: 2000, label: 'Up to $2,000' },
];

const FIELD_LABELS = {
    brand: 'CPU brand',
    memory: 'Memory',
    network: 'Network',
    cores: 'CPU cores',
    storage: 'Storage',
    budget: 'Approx. budget',
} as const;

type Filters = {
    brand: string;
    memory: number;
    network: number;
    cores: number;
    storage: number;
    budget: number;
};

const DEFAULTS: Filters = { brand: 'all', memory: 0, network: 0, cores: 0, storage: 0, budget: 0 };

const money = new Intl.NumberFormat('en-US');

function searchText(row: DedicatedRow): string {
    return [
        row.name,
        row.code,
        row.brandLine,
        row.cpuModel,
        row.storage,
        row.ramType,
        row.bandwidth,
        ...row.locations.flatMap((l) => [l.city, l.country, l.code]),
    ]
        .join(' ')
        .toLowerCase();
}

export function DedicatedServerCatalog({
    rows,
    preview = false,
    showMoreHref,
}: {
    rows: DedicatedRow[];
    preview?: boolean;
    showMoreHref?: string;
}) {
    const uid = useId();
    const countries = useMemo(() => countriesFor(rows), [rows]);
    const [filters, setFilters] = useState<Filters>(DEFAULTS);
    const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
    const [query, setQuery] = useState('');
    const [countryQuery, setCountryQuery] = useState('');
    const [countryOpen, setCountryOpen] = useState(false);
    const [sortKey, setSortKey] = useState<SortKey | ''>('');
    const [sortDirection, setSortDirection] = useState<1 | -1>(1);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    // The comps' script hands focus back explicitly in four places — Done,
    // Escape, removing a filter chip, and the empty state's reset — so keyboard
    // users are never dropped back at the top of the document.
    const countrySummaryRef = useRef<HTMLElement>(null);
    const resetRef = useRef<HTMLButtonElement>(null);

    const haystacks = useMemo(
        () => new Map(rows.map((row) => [row.id, searchText(row)])),
        [rows],
    );

    // `ignoreCountry` is how the country popover counts what each country would
    // return under the other filters — without it every count would collapse to
    // the countries already ticked.
    const matches = useMemo(
        () =>
            (row: DedicatedRow, ignoreCountry = false) => {
                const q = query.trim().toLowerCase();
                return (
                    (!q || (haystacks.get(row.id) ?? '').includes(q)) &&
                    (ignoreCountry ||
                        selectedCountries.size === 0 ||
                        row.countryCodes.some((code) => selectedCountries.has(code))) &&
                    (filters.brand === 'all' || row.vendor === filters.brand) &&
                    row.ramGb >= filters.memory &&
                    row.uplinkGbps >= filters.network &&
                    row.cores >= filters.cores &&
                    row.storageTb >= filters.storage &&
                    (filters.budget === 0 || row.priceMonthly <= filters.budget)
                );
            },
        [filters, haystacks, query, selectedCountries],
    );

    const visible = useMemo(() => {
        const ordered = [...rows].sort((a, b) => {
            if (!sortKey) return a.order - b.order;
            const delta =
                sortKey === 'name'
                    ? a.name.localeCompare(b.name)
                    : sortKey === 'ram'
                      ? a.ramGb - b.ramGb
                      : sortKey === 'storage'
                        ? a.storageTb - b.storageTb
                        : sortKey === 'network'
                          ? a.uplinkGbps - b.uplinkGbps
                          : sortKey === 'price'
                            ? a.priceMonthly - b.priceMonthly
                            : a.cores - b.cores;
            return delta * sortDirection || a.order - b.order;
        });
        return ordered.filter((row) => matches(row));
    }, [matches, rows, sortDirection, sortKey]);

    const countryCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const country of countries) {
            counts.set(
                country.code,
                rows.filter((row) => matches(row, true) && row.countryCodes.includes(country.code))
                    .length,
            );
        }
        return counts;
    }, [countries, matches, rows]);

    const activeFields = (Object.keys(DEFAULTS) as (keyof Filters)[]).filter(
        (key) => filters[key] !== DEFAULTS[key],
    );
    const activeCount = selectedCountries.size + activeFields.length + (query.trim() ? 1 : 0);
    const moreCount = (['cores', 'storage', 'budget'] as const).filter(
        (key) => filters[key] !== 0,
    ).length;

    const countryMatches = countries.filter((country) =>
        `${country.code} ${country.name}`.toLowerCase().includes(countryQuery.trim().toLowerCase()),
    );

    function clearFilters() {
        setFilters(DEFAULTS);
        setSelectedCountries(new Set());
        setQuery('');
    }

    function toggleCountry(code: string) {
        setSelectedCountries((current) => {
            const next = new Set(current);
            if (next.has(code)) next.delete(code);
            else next.add(code);
            return next;
        });
    }

    function toggleSort(key: SortKey) {
        if (sortKey === key) setSortDirection((d) => (d === 1 ? -1 : 1));
        else {
            setSortKey(key);
            setSortDirection(1);
        }
    }

    function toggleDetails(id: string) {
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    const countrySummary =
        selectedCountries.size === 0
            ? 'All countries'
            : selectedCountries.size === 1
              ? (countries.find((c) => selectedCountries.has(c.code))?.name ?? '1 country selected')
              : `${selectedCountries.size} countries selected`;

    const sortDescription = sortKey
        ? `${SORT_NAMES[sortKey]}${sortDirection === 1 ? ' · ascending' : ' · descending'}`
        : 'Default order';

    const chips: { label: string; remove: () => void }[] = [
        ...[...selectedCountries].map((code) => ({
            label: countries.find((c) => c.code === code)?.name ?? code,
            remove: () => toggleCountry(code),
        })),
        ...activeFields.map((key) => ({
            label: `${FIELD_LABELS[key]}: ${labelFor(key, filters[key])}`,
            remove: () => setFilters((f) => ({ ...f, [key]: DEFAULTS[key] })),
        })),
        ...(query.trim() ? [{ label: `Search: ${query.trim()}`, remove: () => setQuery('') }] : []),
    ];

    const sortButton = (key: SortKey, label: string) => {
        const active = sortKey === key;
        return (
            <button
                type="button"
                className={s['pf-sort-button']}
                data-sort={key}
                aria-pressed={active}
                aria-label={`Sort ${SORT_NAMES[key]}${active && sortDirection === 1 ? ' descending' : ' ascending'}`}
                onClick={() => toggleSort(key)}
            >
                <span>{label}</span>
                <span className={s['pf-sort-icon']} aria-hidden="true">
                    {active ? (sortDirection === 1 ? '↑' : '↓') : '↕'}
                </span>
            </button>
        );
    };

    return (
        <div className={s['pc-catalog']}>
            <div className={s['pf-panel']}>
                <div className={s['pf-panel-top']}>
                    <DsIcon name="sliders" />
                    <div>
                        <h3>Find your server</h3>
                        <p>Filter the complete list without dividing plans into categories.</p>
                    </div>
                    <button
                        ref={resetRef}
                        className={s['pc-reset']}
                        type="button"
                        disabled={activeCount === 0}
                        onClick={() => {
                            // Clearing disables this button, so focus has to move or it
                            // falls to <body>. Same place the empty state sends it.
                            clearFilters();
                            countrySummaryRef.current?.focus();
                        }}
                    >
                        Clear all filters
                    </button>
                </div>

                <div className={s['pf-fields']}>
                    <div className={s['pf-field']}>
                        <span className={s['pf-label']} id={`${uid}-country-label`}>
                            Country
                        </span>
                        {/* The comp uses <details> for this popover; `open` is
                            controlled so a click outside or Escape can close it. */}
                        <details
                            className={s['pf-country']}
                            open={countryOpen}
                            onToggle={(event) => setCountryOpen(event.currentTarget.open)}
                            onBlur={(event) => {
                                if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                                    setCountryOpen(false);
                                }
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'Escape' && countryOpen) {
                                    setCountryOpen(false);
                                    countrySummaryRef.current?.focus();
                                }
                            }}
                        >
                            <summary
                                ref={countrySummaryRef}
                                aria-labelledby={`${uid}-country-label ${uid}-country-summary`}
                                onClick={(event) => {
                                    event.preventDefault();
                                    setCountryOpen((open) => !open);
                                }}
                            >
                                <DsGlobeIcon />
                                <span id={`${uid}-country-summary`}>{countrySummary}</span>
                            </summary>
                            <div className={s['pf-country-popover']}>
                                <input
                                    type="search"
                                    aria-label="Search countries"
                                    placeholder="Search countries…"
                                    autoComplete="off"
                                    value={countryQuery}
                                    onChange={(event) => setCountryQuery(event.target.value)}
                                />
                                <div className={s['pf-country-options']}>
                                    {countryMatches.map((country) => (
                                        <label className={s['pf-country-option']} key={country.code}>
                                            <input
                                                type="checkbox"
                                                name={`${uid}-country`}
                                                value={country.code}
                                                checked={selectedCountries.has(country.code)}
                                                onChange={() => toggleCountry(country.code)}
                                            />
                                            <span>{country.code}</span>
                                            <span>{country.name}</span>
                                            <small aria-label="Matching configurations">
                                                {countryCounts.get(country.code) ?? 0}
                                            </small>
                                        </label>
                                    ))}
                                    <p className={s['pf-country-no-match']} hidden={countryMatches.length > 0}>
                                        No countries match your search.
                                    </p>
                                </div>
                                <div className={s['pf-country-bottom']}>
                                    <button
                                        type="button"
                                        disabled={selectedCountries.size === 0}
                                        onClick={() => setSelectedCountries(new Set())}
                                    >
                                        Clear selection
                                    </button>
                                    <button
                                        className={s['pf-done']}
                                        type="button"
                                        onClick={() => {
                                            setCountryOpen(false);
                                            countrySummaryRef.current?.focus();
                                        }}
                                    >
                                        Done
                                    </button>
                                </div>
                            </div>
                        </details>
                    </div>

                    <div className={s['pf-field']}>
                        <label htmlFor={`${uid}-brand`}>CPU brand</label>
                        <select
                            id={`${uid}-brand`}
                            value={filters.brand}
                            onChange={(event) => setFilters((f) => ({ ...f, brand: event.target.value }))}
                        >
                            {BRANDS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={s['pf-field']}>
                        <label htmlFor={`${uid}-memory`}>Memory</label>
                        <select
                            id={`${uid}-memory`}
                            value={filters.memory}
                            onChange={(event) =>
                                setFilters((f) => ({ ...f, memory: Number(event.target.value) }))
                            }
                        >
                            {MEMORY.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={s['pf-field']}>
                        <label htmlFor={`${uid}-network`}>Network</label>
                        <select
                            id={`${uid}-network`}
                            value={filters.network}
                            onChange={(event) =>
                                setFilters((f) => ({ ...f, network: Number(event.target.value) }))
                            }
                        >
                            {NETWORK.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className={s['pf-secondary']}>
                    <details className={s['pf-more']}>
                        <summary>
                            <DsIcon name="plus" />
                            More filters{' '}
                            <span className={s['pf-more-count']} hidden={moreCount === 0}>
                                {moreCount}
                            </span>
                        </summary>
                        <div className={s['pf-advanced']}>
                            <div className={s['pf-field']}>
                                <label htmlFor={`${uid}-cores`}>CPU cores</label>
                                <select
                                    id={`${uid}-cores`}
                                    value={filters.cores}
                                    onChange={(event) =>
                                        setFilters((f) => ({ ...f, cores: Number(event.target.value) }))
                                    }
                                >
                                    {CORES.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className={s['pf-field']}>
                                <label htmlFor={`${uid}-storage`}>Raw storage</label>
                                <select
                                    id={`${uid}-storage`}
                                    value={filters.storage}
                                    onChange={(event) =>
                                        setFilters((f) => ({ ...f, storage: Number(event.target.value) }))
                                    }
                                >
                                    {STORAGE.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className={s['pf-field']}>
                                <label htmlFor={`${uid}-budget`}>Approx. monthly budget (USD)</label>
                                <select
                                    id={`${uid}-budget`}
                                    value={filters.budget}
                                    onChange={(event) =>
                                        setFilters((f) => ({ ...f, budget: Number(event.target.value) }))
                                    }
                                >
                                    {BUDGET.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </details>
                </div>

                <div className={s['pf-selection']} hidden={activeCount === 0}>
                    <span className={s['pf-selection-label']}>Applied filters</span>
                    <div style={{ display: 'contents' }}>
                        {chips.map((chip) => (
                            <button
                                key={chip.label}
                                type="button"
                                className={s['pf-chip']}
                                aria-label={`Remove ${chip.label} filter`}
                                onClick={() => {
                                    chip.remove();
                                    // The comp focuses "Clear all filters", but removing the
                                    // last chip disables that button, and focus on a disabled
                                    // button falls to <body>. The country filter takes it then.
                                    if (activeCount > 1) resetRef.current?.focus();
                                    else countrySummaryRef.current?.focus();
                                }}
                            >
                                {chip.label}
                                <span aria-hidden="true">×</span>
                            </button>
                        ))}
                    </div>
                </div>

                <p className={s['pf-location-note']}>
                    Locations, configurations, and prices come from the published bare-metal lineup.
                    Confirm current availability and final charges before ordering.
                </p>
            </div>

            <div className={s['pc-results']}>
                {!preview && (
                    <label className={s['catalog-search-wrap']} htmlFor={`${uid}-search`}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <circle cx="11" cy="11" r="7" />
                            <path d="m20 20-4-4" />
                        </svg>
                        <span className={s['pc-sr']}>Search server plans</span>
                        <input
                            id={`${uid}-search`}
                            type="search"
                            placeholder="Search plan, processor, city, or storage…"
                            autoComplete="off"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </label>
                )}
                <span role="status" aria-live="polite">
                    {visible.length} of {rows.length} servers shown
                </span>
                <div className={s['pf-result-tools']}>
                    <span className={s['pf-sort-description']}>{sortDescription}</span>
                    <button
                        className={s['pf-sort-reset']}
                        type="button"
                        hidden={!sortKey}
                        onClick={() => {
                            setSortKey('');
                            setSortDirection(1);
                        }}
                    >
                        Reset sorting
                    </button>
                </div>
            </div>

            <div className={s['pf-mobile-sort']} role="group" aria-label="Sort server configurations">
                {/* A wrapper element per button is not available here: the comp
                    styles `.pf-mobile-sort>span` as the "Sort" label itself. */}
                <span>Sort</span>
                {COLUMNS.map((column) => (
                    <Fragment key={column.key}>{sortButton(column.key, column.label)}</Fragment>
                ))}
            </div>

            <div className={s['pc-table-wrap']}>
                <table className={s['pc-table']}>
                    <caption className={s['pc-sr']}>
                        {rows.length} dedicated server configurations with monthly prices in US dollars
                    </caption>
                    <colgroup>
                        <col style={{ width: '25%' }} />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '11%' }} />
                        <col style={{ width: '15%' }} />
                        <col style={{ width: '11%' }} />
                        <col style={{ width: '13%' }} />
                        <col style={{ width: '13%' }} />
                    </colgroup>
                    <thead>
                        <tr>
                            {COLUMNS.map((column) => (
                                <th
                                    key={column.key}
                                    scope="col"
                                    className={column.key === 'price' ? s['pc-price-heading'] : undefined}
                                    aria-sort={
                                        sortKey === column.key
                                            ? sortDirection === 1
                                                ? 'ascending'
                                                : 'descending'
                                            : 'none'
                                    }
                                >
                                    {sortButton(column.key, column.label)}
                                </th>
                            ))}
                            <th scope="col">
                                <span className={s['pc-sr']}>Actions</span>
                            </th>
                        </tr>
                    </thead>

                    {visible.map((row) => {
                        const detailsId = `${uid}-details-${row.id}`;
                        const open = expanded.has(row.id);
                        const [primary, ...elsewhere] = row.locations;
                        return (
                            <tbody
                                className={s['pc-group']}
                                key={row.id}
                                data-country={primary?.code}
                                data-brand={row.vendor}
                                data-name={row.name}
                                data-storage={row.storageTb}
                                data-price={row.priceMonthly}
                                data-cores={row.cores}
                                data-ram={row.ramGb}
                                data-network={row.uplinkGbps}
                                data-order={row.order}
                            >
                                <tr className={s['pc-row']}>
                                    <th scope="row" className={s['pc-processor']}>
                                        <span className={s['pc-processor-brand']}>
                                            {/* Existing marks from the compute
                                                pricing table, not new artwork. */}
                                            <Image
                                                src={assetUrl(
                                                    row.vendor === 'intel'
                                                        ? '/images/compute-page/intel.png'
                                                        : '/images/compute-page/amd.png',
                                                )}
                                                alt={row.vendor === 'intel' ? 'Intel' : 'AMD'}
                                                width={14}
                                                height={14}
                                                className={s['pc-brand-logo']}
                                            />
                                            {row.brandLine}
                                        </span>
                                        <strong>{row.name}</strong>
                                        <span className={s['pc-sku']}>{row.code}</span>
                                        <span className={s['pc-location']}>
                                            <DsGlobeIcon />
                                            <span className={s['pc-location-code']}>{primary?.code}</span>
                                            {primary?.city}
                                            {elsewhere.length > 0 ? ` +${elsewhere.length}` : ''}
                                        </span>
                                    </th>
                                    <td data-label="CPU">
                                        <strong>{row.cores} cores</strong>
                                        <small>
                                            {row.sockets} × {row.cores / row.sockets}-core CPU
                                        </small>
                                        <small>{row.boostGhz} GHz</small>
                                    </td>
                                    <td data-label="Memory">
                                        <strong>{row.ramGb} GB</strong>
                                        <small>{row.ramType}</small>
                                    </td>
                                    <td data-label="Storage">
                                        <strong>{row.storage}</strong>
                                    </td>
                                    <td data-label="Network">
                                        <strong>{row.uplinkGbps} Gbps</strong>
                                        <small className={s['pc-unmetered']}>{row.bandwidth}</small>
                                    </td>
                                    <td className={s['pc-price']} data-label="From / month">
                                        <strong>
                                            <span className={s['pc-code']}>USD</span>
                                            <span className={s['pc-symbol']}>$</span>
                                            {money.format(row.priceMonthly)}
                                        </strong>
                                        <small>per month</small>
                                        <small className={s['pc-currency-note']}>Excludes tax</small>
                                    </td>
                                    <td className={s['pc-actions']}>
                                        <Link
                                            href="/contact"
                                            className={s['pc-enquire']}
                                            aria-label={`Enquire about ${row.name}`}
                                        >
                                            Enquire <DsIcon name="arrow" />
                                        </Link>
                                        <button
                                            type="button"
                                            className={s['pc-expand']}
                                            aria-expanded={open}
                                            aria-controls={detailsId}
                                            onClick={() => toggleDetails(row.id)}
                                        >
                                            Details <DsIcon name="plus" />
                                            <span className={s['pc-sr']}> for {row.name}</span>
                                        </button>
                                    </td>
                                </tr>
                                <tr className={s['pc-detail-row']} id={detailsId} hidden={!open}>
                                    <td colSpan={7}>
                                        <div className={s['pc-detail-content']}>
                                            <div>
                                                <span className={s['pc-detail-label']}>Location</span>
                                                <h3>
                                                    {primary?.city}, {primary?.country}
                                                </h3>
                                                <p>
                                                    {elsewhere.length > 0
                                                        ? `Also racked in ${elsewhere.map((l) => l.city).join(', ')}.`
                                                        : 'Single-location configuration.'}{' '}
                                                    Listed in USD at ${money.format(row.priceMonthly)} per month.
                                                </p>
                                            </div>
                                            <div>
                                                <span className={s['pc-detail-label']}>Hardware layout</span>
                                                <p>
                                                    <strong>
                                                        {row.sockets} socket{row.sockets > 1 ? 's' : ''}
                                                    </strong>{' '}
                                                    · {row.cpuModel} · {row.cores} cores / {row.threads}{' '}
                                                    threads · {row.baseGhz}–{row.boostGhz} GHz · {row.ramGb} GB{' '}
                                                    {row.ramType}.
                                                </p>
                                            </div>
                                            <div>
                                                <span className={s['pc-detail-label']}>Before you order</span>
                                                <p>
                                                    {/* "Unmetered" reads as prose, "50 TB" does not —
                                                        lowercasing both turned a capacity into "50 tb". */}
                                                    {row.storage} with{' '}
                                                    {row.bandwidth.toLowerCase() === 'unmetered'
                                                        ? 'unmetered traffic'
                                                        : `${row.bandwidth} of traffic`}{' '}
                                                    at {row.uplinkGbps} Gbps. Confirm current stock, taxes,
                                                    setup fees, and final specifications with sales.
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        );
                    })}

                    <tbody hidden={visible.length > 0}>
                        <tr>
                            <td colSpan={7}>
                                <div className={s['pc-empty-state']}>
                                    <DsIcon name="sliders" />
                                    <h3>No matching configurations</h3>
                                    <p>Try another country, CPU brand, or hardware requirement.</p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            clearFilters();
                                            countrySummaryRef.current?.focus();
                                        }}
                                    >
                                        Clear all filters <DsIcon name="arrow" />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {preview && showMoreHref && (
                <div className={s['pc-preview-fade']}>
                    <Link className={s['pc-show-more']} href={showMoreHref}>
                        Show more servers <DsIcon name="arrow" />
                    </Link>
                </div>
            )}

            <div className={s['pc-included']}>
                <span>WITH EVERY CONFIGURATION</span>
                <span>
                    <DsIcon name="check" /> Dedicated hardware
                </span>
                <span>
                    <DsIcon name="check" /> Full root access
                </span>
                <span>
                    <DsIcon name="check" /> Monthly pricing
                </span>
            </div>
        </div>
    );
}

function labelFor(key: keyof Filters, value: string | number): string {
    const source =
        key === 'brand'
            ? BRANDS
            : key === 'memory'
              ? MEMORY
              : key === 'network'
                ? NETWORK
                : key === 'cores'
                  ? CORES
                  : key === 'storage'
                    ? STORAGE
                    : BUDGET;
    return (source as { value: string | number; label: string }[]).find((o) => o.value === value)?.label ?? String(value);
}
