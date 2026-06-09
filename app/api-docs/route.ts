import { ApiReference } from "@scalar/nextjs-api-reference";

export const GET = ApiReference({
  pageTitle: "API Docs — AhuraSense Cloud",
  url: "/openapi.json",
  // Browser loads script from same origin to satisfy CSP script-src 'self'.
  cdn: "/api-docs/scalar",
});
