import { permanentRedirect } from "next/navigation";

// The dedicated-server storefront lives at /services/dedicated-servers since
// 2026-09-27 (feat/dedicated-servers: the supplied comps, plus a filterable
// catalog at /services/dedicated-servers/catalog). This path served an
// earlier, simpler page for a few hours that day and was in the sitemap, so
// it forwards rather than 404s.
export default function BareMetalRedirect() {
  permanentRedirect("/services/dedicated-servers");
}
