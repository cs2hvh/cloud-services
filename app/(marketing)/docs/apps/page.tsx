import { Code } from "@/components/docs/code";
import { docsMetadata } from "@/components/docs/metadata";
import { A, C, Callout, Cards, DocPage, H2, Li, Ol, P, Strong, Table } from "@/components/docs/primitives";

export const metadata = docsMetadata({
  title: "App Platform — AhuraSense Docs",
  description:
    "Deploy an app from GitHub, GitLab or Bitbucket: connect a repository, push to deploy, preview branches, deploy hooks and custom domains.",
  path: "/docs/apps",
});

const HREF = "/docs/apps";

export default function AppsOverviewPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="App Platform"
      title="App Platform"
      lede="Connect a git repository and AhuraSense builds it, runs it and serves it over HTTPS. Every push to your production branch deploys; every other branch gets its own preview."
    >
      <H2>How it works</H2>
      <P>
        You connect a repository once. From then on a push is the deploy: we fetch the commit,
        detect the framework, build it into a container image on an isolated build machine, start
        it, and route your app&rsquo;s address to it. If the build fails, nothing changes — the
        previous version keeps serving and the deployment is marked failed with the reason.
      </P>
      <P>
        Each app gets an address of the form <C>https://v2-&lt;app-name&gt;.ahurasense.com</C>{" "}
        straight away, with a certificate. You can add your own domains alongside it.
      </P>

      <H2>Deploy your first app</H2>
      <Ol>
        <Li>
          Open <A href="/dashboard/services/apps">Apps</A> in the dashboard and connect GitHub,
          GitLab or Bitbucket. This happens once, in the provider&rsquo;s own consent screen.
        </Li>
        <Li>
          Choose <Strong>New app</Strong>, pick a repository and branch, and create it. The first
          deployment starts immediately.
        </Li>
        <Li>
          If the app needs environment variables to build or run, add them under{" "}
          <Strong>Environment</Strong>, then deploy again. See{" "}
          <A href="/docs/apps/environment-variables">Environment variables</A>.
        </Li>
        <Li>Push a commit. It builds and goes live on its own.</Li>
      </Ol>
      <Code lang="bash" title="deploy">{`git push origin main`}</Code>
      <Callout kind="tip" title="Most apps need no configuration">
        Next.js, Node, Vite and other common frameworks are detected from your repository. If
        yours is not, add a <C>Dockerfile</C> and it is built exactly as written. See{" "}
        <A href="/docs/apps/builds">Build configuration</A>.
      </Callout>

      <H2>Ways to integrate</H2>
      <P>
        There are three ways to start a deployment. All three produce the same kind of deployment,
        with the same build, logs and rollback.
      </P>
      <Table
        head={["How", "Deploys", "Use it for"]}
        rows={[
          [
            <Strong key="push">git push</Strong>,
            "The pushed branch: production for your production branch, a preview for any other",
            "Everyday development. On by default for every connected repository.",
          ],
          [
            <A key="hook" href="/docs/apps/deploy-hooks">Deploy hook</A>,
            "Your production branch",
            "Deploying from CI after tests pass, from a CMS, or on a schedule. A secret URL; no key or session needed.",
          ],
          [
            <Strong key="button">Deploy button</Strong>,
            "Your production branch",
            "Redeploying by hand from the dashboard.",
          ],
        ]}
      />
      <P>
        Two steps always happen outside any API, here and on every similar platform: connecting
        your git account, which runs through the provider&rsquo;s own consent screen, and adding
        DNS records for a custom domain, which you do wherever your domain&rsquo;s DNS is hosted.
      </P>

      <H2>Next</H2>
      <Cards
        items={[
          {
            title: "Deployments",
            description: "Production and preview branches, what each deployment state means, logs and rollback.",
            href: "/docs/apps/deployments",
          },
          {
            title: "Deploy hooks",
            description: "Deploy from your CI with a secret URL, and make your pipeline the only way to production.",
            href: "/docs/apps/deploy-hooks",
          },
          {
            title: "Build configuration",
            description: "Supported frameworks, your own Dockerfile, root directories and runtime versions.",
            href: "/docs/apps/builds",
          },
          {
            title: "Custom domains",
            description: "Serve the app on your own domain, with a certificate issued automatically.",
            href: "/docs/apps/domains",
          },
        ]}
      />
    </DocPage>
  );
}
