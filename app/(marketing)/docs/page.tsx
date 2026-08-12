import { redirect } from "next/navigation";

// Single entry point for every "View Documentation" CTA. Today the only
// documentation surface is the Scalar API reference; when product docs land,
// repoint this one file instead of the CTAs scattered across marketing pages.
export default function DocsPage() {
  redirect("/api-docs");
}
