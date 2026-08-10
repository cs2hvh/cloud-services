// The GPU enterprise inquiry route writes its ticket body server-side, and the
// support UI renders that body as sanitized HTML via dangerouslySetInnerHTML.
// It used to emit Markdown, so readers saw literal `**Plan type:**` in both the
// ticket and the notification email (which shares the sanitizer). These tests
// pin the body to the format the renderer actually understands.
import { describe, it, expect } from 'vitest';

import { describeGpuInquiry as describeBody } from '@/lib/support/gpu-inquiry';
import { sanitizeSupportRichText, plainTextFromRichText } from '@/lib/support/richtext';

const baseBody = {
  planType: 'reserved',
  gpus: ['H100 SXM', 'H200'],
  gpuCount: 16,
  duration: '1-month',
  workload: 'Internal Model Training',
  budget: null,
  region: 'Asia-Pacific',
  contactPref: 'email',
  extra: null,
} as Parameters<typeof describeBody>[0];

/** What the reader actually sees, after the UI's sanitizer runs. */
function rendered(body: Parameters<typeof describeBody>[0], email: string | null = null) {
  return sanitizeSupportRichText(describeBody(body, email));
}

describe('describeBody', () => {
  it('emits bold labels as markup, not Markdown asterisks', () => {
    const html = rendered(baseBody, 'vedendra.singh@ahurasense.com');

    expect(html).toContain('<strong>Plan type:</strong>');
    expect(html).toContain('<strong>Target GPU count:</strong>');
    expect(html).not.toContain('**');
  });

  it('survives the support sanitizer without losing the bold tags', () => {
    // sanitizeSupportRichText drops any tag outside its allowlist, so a body
    // built from tags it does not accept would render as unstyled soup.
    const html = rendered(baseBody);

    expect(html).toContain('<strong>');
    expect(html).toContain('<hr>');
    expect(html).toContain('<p>');
  });

  it('reads as clean plain text once the tags are stripped (the email path)', () => {
    const text = plainTextFromRichText(rendered(baseBody, 'ved@example.com'));

    expect(text).toContain('Plan type: reserved');
    expect(text).toContain('GPUs of interest: H100 SXM, H200');
    expect(text).toContain('Target GPU count: 16');
    expect(text).toContain('Submitted by: ved@example.com');
    expect(text).not.toContain('*');
  });

  it('includes every field that was supplied and omits the optional blanks', () => {
    const withExtras = rendered({ ...baseBody, budget: '$50k', extra: 'Call me first' });
    expect(withExtras).toContain('<strong>Budget:</strong>');
    expect(withExtras).toContain('<strong>Additional notes:</strong>');

    const withoutExtras = rendered({ ...baseBody, budget: null, region: null, extra: null });
    expect(withoutExtras).not.toContain('Budget:');
    expect(withoutExtras).not.toContain('Region preference:');
    expect(withoutExtras).not.toContain('Additional notes:');
  });

  it('escapes user-supplied text instead of letting it inject markup', () => {
    // workload/extra/region are free-form and reach an innerHTML sink, so the
    // escaping has to happen here — the sanitizer treats this body as trusted
    // markup and will not re-escape text content for us.
    const html = rendered({
      ...baseBody,
      workload: '<img src=x onerror=alert(1)> & "quoted"',
      region: '<b>eu</b>',
    });

    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&amp;');
    // The injected <b> must arrive escaped, not as a live tag.
    expect(html).toContain('&lt;b&gt;eu&lt;/b&gt;');
  });

  it('keeps the author line breaks inside free-form prose', () => {
    const html = rendered({ ...baseBody, workload: 'line one\nline two' });
    expect(html).toContain('line one<br>line two');
  });
});
