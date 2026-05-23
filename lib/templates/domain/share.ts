export type TemplateShareLinks = {
  templateUrl: string;
  buttonImageUrl: string;
  markdown: string;
  html: string;
};

export function buildTemplateShareLinks(baseUrl: string, slug: string, campaign = slug): TemplateShareLinks {
  const origin = baseUrl.replace(/\/$/, '');
  const templateUrl = `${origin}/dashboard/templates/${encodeURIComponent(slug)}`;
  const buttonImageUrl = `${origin}/button.svg`;
  const deployUrl = `${templateUrl}?utm_medium=integration&utm_source=button&utm_campaign=${encodeURIComponent(campaign)}`;

  return {
    templateUrl,
    buttonImageUrl,
    markdown: `[![Deploy](${buttonImageUrl})](${deployUrl})`,
    html: `<a href="${deployUrl}"><img src="${buttonImageUrl}" alt="Deploy" /></a>`,
  };
}

export function requestBaseUrl(req: Request) {
  const forwardedProto = req.headers.get('x-forwarded-proto');
  const forwardedHost = req.headers.get('x-forwarded-host');
  if (forwardedHost) return `${forwardedProto ?? 'https'}://${forwardedHost}`;

  const host = req.headers.get('host');
  if (host) return `${forwardedProto ?? 'http'}://${host}`;

  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}
