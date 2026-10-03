import { Code } from "@/components/docs/code";
import { docsMetadata } from "@/components/docs/metadata";
import { A, C, Callout, DocPage, H2, H3, Li, P, Strong, Table, Ul } from "@/components/docs/primitives";

export const metadata = docsMetadata({
  title: "Environment variables — App Platform — AhuraSense Docs",
  description:
    "Environment variables on the AhuraSense app platform: which reach the build and which reach the running app, public prefixes, and using them from your own Dockerfile.",
  path: "/docs/apps/environment-variables",
});

const HREF = "/docs/apps/environment-variables";

export default function EnvironmentVariablesPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="App Platform"
      title="Environment variables"
      lede="Set configuration and secrets per app, outside your repository. Where a variable is visible — during the build, in the running app, or in the browser — depends on its name."
    >
      <H2>Add variables</H2>
      <P>
        Open the app and go to <Strong>Environment</Strong>. Variables apply to production and to
        every preview of the app.
      </P>
      <Ul>
        <Li>
          Names use letters, digits and underscores, cannot start with a digit, and are at most 128
          characters: <C>DATABASE_URL</C>, <C>NEXT_PUBLIC_API_URL</C>.
        </Li>
        <Li>Values can be up to 32,768 characters.</Li>
        <Li>
          Values are encrypted when stored and are never shown again after you save them. To change
          one, set it again.
        </Li>
      </Ul>
      <Callout kind="note" title="Changes need a deploy">
        Saving a variable does not restart anything. It takes effect on the app&rsquo;s next
        deployment — push, call a <A href="/docs/apps/deploy-hooks">deploy hook</A>, or press{" "}
        <Strong>Deploy</Strong>.
      </Callout>

      <H2>Where each variable is visible</H2>
      <Table
        head={["Variable", "During the build", "In the running app", "In the browser"]}
        rows={[
          [
            <>Starts with <C key="a1">NEXT_PUBLIC_</C> or <C key="a2">PUBLIC_</C></>,
            "Yes, as a build argument",
            "No — its value is already built into your code",
            "Yes, once your framework embeds it",
          ],
          [
            "Any other name",
            "Yes, for Node, static and Hugo builds",
            "Yes",
            "Only if your build embeds it",
          ],
        ]}
      />
      <H3>Public variables</H3>
      <P>
        A variable whose name starts with <C>NEXT_PUBLIC_</C> or <C>PUBLIC_</C> is meant for client
        code. It is passed to the build, where your framework writes its value into the JavaScript
        sent to browsers, so anyone visiting the site can read it. Never put a secret in one.
      </P>
      <P>
        Because the value is built in, changing it only takes effect when the app is rebuilt — a{" "}
        <A href="/docs/apps/deployments#rollback">rollback</A> keeps the value that version was
        built with.
      </P>
      <H3>Other prefixes your framework embeds</H3>
      <P>
        Vite, Create React App and Nuxt embed variables with their own prefixes —{" "}
        <C>VITE_</C>, <C>REACT_APP_</C>, <C>NUXT_PUBLIC_</C>. These reach the build like any other
        variable, and your framework embeds them as usual, so they end up public in the same way.
        They are also set in the running app.
      </P>
      <H3>Everything else</H3>
      <P>
        Every other variable is set in your running app&rsquo;s environment. For Node, static-site
        and Hugo apps it is also available while your <C>build</C> script runs, so a build that
        fetches data or checks configuration can use it. It is not available while dependencies
        are being installed.
      </P>
      <P>
        For Python, PHP, Go, Rust, Java and Ruby apps, variables are available at runtime only. If
        your build needs them, use your own Dockerfile, below.
      </P>

      <H2 id="your-own-dockerfile">With your own Dockerfile</H2>
      <P>
        When you bring a <A href="/docs/apps/builds#your-own-dockerfile">Dockerfile</A>, variables
        reach your build in two ways.
      </P>
      <H3>Public variables: build arguments</H3>
      <P>Declare each one you use with <C>ARG</C>:</P>
      <Code lang="docker" title="Dockerfile">{`ARG NEXT_PUBLIC_API_URL
RUN npm run build`}</Code>
      <H3>Other variables: a build secret</H3>
      <P>
        Every other variable is provided as a BuildKit secret with the id <C>ahura-env</C>: a file
        of <C>export NAME=&apos;value&apos;</C> lines. Mount it only in the step that needs it, so
        no value is written into an image layer:
      </P>
      <Code lang="docker" title="Dockerfile">{`# syntax=docker/dockerfile:1.7
RUN --mount=type=secret,id=ahura-env \\
    . /run/secrets/ahura-env && npm run build`}</Code>
      <P>
        At runtime, every variable except public ones is set in your container&rsquo;s environment,
        exactly as for apps we build.
      </P>

      <H2>Keep secrets out of logs</H2>
      <Callout kind="warn" title="Build output is not redacted">
        Whatever your build prints appears in its build log, which everyone on your team can read.
        Do not print environment variables from build scripts, and be wary of tools that echo their
        configuration.
      </Callout>
    </DocPage>
  );
}
