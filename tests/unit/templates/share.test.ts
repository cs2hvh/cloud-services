import { describe, it, expect } from 'vitest';
import { buildTemplateShareLinks } from '@/lib/templates/domain/share';

describe('buildTemplateShareLinks', () => {
  const BASE = 'https://cloud.example.com';

  it('builds a correct template URL', () => {
    const links = buildTemplateShareLinks(BASE, 'my-template');
    expect(links.templateUrl).toBe(`${BASE}/dashboard/templates/my-template`);
  });

  it('builds a correct button image URL', () => {
    const links = buildTemplateShareLinks(BASE, 'my-template');
    expect(links.buttonImageUrl).toBe(`${BASE}/button.svg`);
  });

  it('includes utm parameters in markdown and html links', () => {
    const links = buildTemplateShareLinks(BASE, 'my-template');
    expect(links.markdown).toContain('utm_medium=integration');
    expect(links.markdown).toContain('utm_source=button');
    expect(links.html).toContain('utm_medium=integration');
  });

  it('uses the template slug as the default campaign', () => {
    const links = buildTemplateShareLinks(BASE, 'my-template');
    expect(links.markdown).toContain('utm_campaign=my-template');
  });

  it('uses a custom campaign when provided', () => {
    const links = buildTemplateShareLinks(BASE, 'my-template', 'launch-2025');
    expect(links.markdown).toContain('utm_campaign=launch-2025');
  });

  it('strips trailing slashes from baseUrl', () => {
    const links = buildTemplateShareLinks('https://cloud.example.com/', 'my-template');
    expect(links.templateUrl).toBe('https://cloud.example.com/dashboard/templates/my-template');
  });

  it('encodes special characters in the slug', () => {
    const links = buildTemplateShareLinks(BASE, 'my template/v2');
    expect(links.templateUrl).toContain(encodeURIComponent('my template/v2'));
  });

  it('produces valid markdown link syntax', () => {
    const links = buildTemplateShareLinks(BASE, 'app');
    expect(links.markdown).toMatch(/^\[!\[.*\]\(.*\)\]\(.*\)$/);
  });

  it('produces a valid HTML anchor tag', () => {
    const links = buildTemplateShareLinks(BASE, 'app');
    expect(links.html).toMatch(/^<a href="[^"]+"><img src="[^"]+" alt="[^"]+" \/><\/a>$/);
  });
});
