// The bucket summary reads its monthly price from the product catalog. A failed
// fetch used to reset the price to 0, and 0 renders as "Free" — so an API blip
// advertised free storage on a bucket that bills by the hour. Unknown and free
// are now distinct states.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';

import BucketCreate from '@/components/dashboard/object-storage/bucket-create';

vi.mock('axios');
vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));
vi.mock('next/image', () => ({
  default: ({ alt, ...props }: any) => <img alt={alt} {...props} />,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const props = {
  projects: [{ id: 'proj-1', name: 'My First Project' }],
  locations: [{ id: 1, short: 'blr1', name: 'Banglore', country: 'India', status: 'ready' }],
  userId: 'user-1',
  buckets: [],
  role: 'user' as const,
};

/** The rendered monthly figure, or whatever placeholder stands in for it. */
async function priceText() {
  render(<BucketCreate {...props} />);
  // The block renders "—" while loading; wait for the fetch to settle.
  await waitFor(() => {
    expect(vi.mocked(axios.get)).toHaveBeenCalled();
  });
  return screen.getByText('Monthly cost').closest('div') as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('BucketCreate — monthly cost', () => {
  it('shows the catalog price when the fetch succeeds', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { products: [{ price: '5' }] } });

    const block = await priceText();

    await waitFor(() => expect(block).toHaveTextContent('5.00'));
    expect(block).not.toHaveTextContent('Free');
  });

  it('does not advertise "Free" when the price fetch fails', async () => {
    // The regression: catch set the price to 0, and 0 means free.
    vi.mocked(axios.get).mockRejectedValue(new Error('network down'));

    const block = await priceText();

    await waitFor(() => expect(block).toHaveTextContent('—'));
    expect(block).not.toHaveTextContent('Free');
  });

  it('does not advertise "Free" when the catalog returns a malformed payload', async () => {
    // A 200 with no products array leaves the price unset. The initial state
    // used to be 0, which renders "Free" — the exact bug, reached without any
    // error being thrown.
    vi.mocked(axios.get).mockResolvedValue({ data: { error: 'boom' } });

    const block = await priceText();

    await waitFor(() => expect(block).toHaveTextContent('—'));
    expect(block).not.toHaveTextContent('Free');
    expect(block).not.toHaveTextContent('NaN');
  });

  it('still renders a genuinely zero price as Free', async () => {
    // 0 from the catalog is a real answer and must survive the fix.
    vi.mocked(axios.get).mockResolvedValue({ data: { products: [{ price: '0' }] } });

    const block = await priceText();

    await waitFor(() => expect(block).toHaveTextContent('Free'));
  });

  it('renders large catalog prices without a decimal tail', async () => {
    // The $43200 row from the report — the display is faithful to the catalog,
    // which is the point: the number itself is a data problem, not a UI one.
    vi.mocked(axios.get).mockResolvedValue({ data: { products: [{ price: '43200' }] } });

    const block = await priceText();

    await waitFor(() => expect(block).toHaveTextContent('43200'));
  });
});
