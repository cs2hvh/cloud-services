import { Code } from "@/components/docs/code";
import { docsMetadata } from "@/components/docs/metadata";
import { A, C, Callout, DocPage, H2, H3, Li, Ol, P, Strong, Table, Ul } from "@/components/docs/primitives";

export const metadata = docsMetadata({
  title: "Custom domains — App Platform — AhuraSense Docs",
  description:
    "Serve an AhuraSense app on your own domain: the DNS records to add, how the certificate is issued, apex domains, and removing a domain.",
  path: "/docs/apps/domains",
});

const HREF = "/docs/apps/domains";

export default function DomainsPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="App Platform"
      title="Custom domains"
      lede="Every app has an ahurasense.com address from its first deployment. Add your own domain and it serves the same app over HTTPS, with a certificate issued automatically."
    >
      <H2>Add a domain</H2>
      <Ol>
        <Li>
          Open the app and go to <Strong>Domains</Strong>. Enter the domain, such as{" "}
          <C>app.example.com</C>, and add it.
        </Li>
        <Li>
          The dashboard lists the DNS records to create. Add them at your DNS provider — wherever
          your domain&rsquo;s DNS is hosted, which is often your registrar. Your domain stays where
          it is.
        </Li>
        <Li>
          Wait for the records to resolve. The domain shows <Strong>Verifying</Strong> until its
          certificate is issued, then <Strong>Active</Strong>. This usually takes a few minutes, and
          can take longer if your DNS provider is slow to publish changes. The page refreshes on
          its own.
        </Li>
      </Ol>

      <H2>The records</H2>
      <Table
        head={["Type", "Name", "Value", "Purpose"]}
        rows={[
          [
            "CNAME",
            <C key="c1">app.example.com</C>,
            <C key="c2">fallback.ahurasense.com</C>,
            "Routes visitors to your app. Required.",
          ],
          [
            "TXT",
            "shown in the dashboard",
            "shown in the dashboard",
            "Proves you control the domain, so the certificate can be issued.",
          ],
        ]}
      />
      <P>
        Copy the exact TXT names and values from the dashboard — each has a copy button. They are
        specific to your domain.
      </P>
      <Code lang="text" title="example">{`app.example.com.                      CNAME  fallback.ahurasense.com.
_cf-custom-hostname.app.example.com.  TXT    "…value from the dashboard…"`}</Code>
      <Callout kind="tip" title="Leave the records in place">
        Keep every record for as long as the domain is in use. Removing the CNAME stops traffic to
        your app.
      </Callout>

      <H3>Apex domains</H3>
      <P>
        A bare domain such as <C>example.com</C> cannot normally have a CNAME record. Either use a
        subdomain such as <C>www.example.com</C>, or, if your DNS provider supports it, use its
        CNAME flattening or <C>ALIAS</C> record pointing at <C>fallback.ahurasense.com</C>. Many
        people serve the app on <C>www</C> and redirect the apex to it at their DNS provider.
      </P>

      <H2>What a domain serves</H2>
      <Ul>
        <Li>
          Custom domains serve your app&rsquo;s production deployment. They move with it on every
          production deploy and on rollback.
        </Li>
        <Li>Your ahurasense.com address keeps working alongside them.</Li>
        <Li>Certificates require TLS 1.2 or later.</Li>
      </Ul>

      <H2>Rules</H2>
      <Ul>
        <Li>
          A domain can be attached to one app at a time. To move it, remove it from the first app,
          then add it to the second.
        </Li>
        <Li>Domains under <C>ahurasense.com</C> cannot be added.</Li>
        <Li>
          The name must be a valid domain of at least two labels, such as <C>example.com</C>.
        </Li>
      </Ul>

      <H2>Remove a domain</H2>
      <P>
        Choose <Strong>Remove</Strong> next to it under <Strong>Domains</Strong>. It stops serving
        your app, and its certificate is withdrawn. Then delete its records at your DNS provider.
        Deleting an app removes all of its domains.
      </P>

      <H2>Troubleshooting</H2>
      <Table
        head={["What you see", "Likely cause"]}
        rows={[
          [
            "Verifying for more than an hour",
            "A record is missing or mistyped, or a conflicting record exists for the same name. Check the CNAME target and the TXT values against the dashboard exactly.",
          ],
          [
            "The domain is already claimed",
            "It is attached to another app. Remove it there first.",
          ],
          [
            "A certificate error in the browser right after adding",
            "The certificate is not issued yet. Wait until the domain shows Active.",
          ],
        ]}
      />
      <P>
        Still stuck? <A href="/contact">Contact support</A> with the domain and the app name.
      </P>
    </DocPage>
  );
}
