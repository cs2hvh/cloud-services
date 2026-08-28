/**
 * The three git providers, as marks rather than words.
 *
 * Inline SVG rather than files in public/images: these appear in lists where a
 * failed image request leaves a broken box beside an account name, and there is
 * no provider logo in that directory to point at anyway. Each path is the
 * provider's own mark, drawn in currentColor so it inherits the row's state —
 * dimmed when a connection is unavailable, full strength when it works.
 */

export type Provider = "github" | "gitlab" | "bitbucket";

export const PROVIDER_LABEL: Record<Provider, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
};

/**
 * Brand colours, used only as an accent. The marks themselves inherit
 * currentColor so a disabled row stays legibly disabled — a full-colour logo on
 * a greyed-out row reads as available.
 */
export const PROVIDER_ACCENT: Record<Provider, string> = {
  github: "#8b949e",
  gitlab: "#fc6d26",
  bitbucket: "#2684ff",
};

export function ProviderMark({
  provider,
  className = "h-4 w-4",
}: {
  provider: Provider;
  className?: string;
}) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    "aria-hidden": true as const,
    focusable: "false" as const,
  };

  if (provider === "gitlab") {
    return (
      <svg {...common}>
        <path d="M12 21.6 8.7 11.4h6.6L12 21.6zM3.3 11.4H8.7L12 21.6 3.3 11.4zm-1.2-.8L1.1 7.4a.9.9 0 0 1 .3-1l1.9-1.5 2 5.7H2.1zm1.2.8h5.4L12 21.6l-8.7-10.2zM15.3 11.4h5.4L12 21.6l3.3-10.2zm6.6-.8h-3.2l2-5.7 1.9 1.5a.9.9 0 0 1 .3 1l-1 3.2zM8.7 10.6 6.6 4.1a.5.5 0 0 1 .9 0l2.1 6.5H8.7zm7.5 0h-1L17.3 4a.5.5 0 0 1 .9 0l-2 6.6z" />
      </svg>
    );
  }

  if (provider === "bitbucket") {
    return (
      <svg {...common}>
        <path d="M2.6 3a.8.8 0 0 0-.8.9l2.9 17.5a1 1 0 0 0 1 .8h13.9a.8.8 0 0 0 .8-.7l2.9-17.6a.8.8 0 0 0-.8-.9H2.6zm11.9 12.6h-4.9L8.3 8.4h7.4l-1.2 7.2z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C16.9 4.8 18 5.1 18 5.1c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3z" />
    </svg>
  );
}
