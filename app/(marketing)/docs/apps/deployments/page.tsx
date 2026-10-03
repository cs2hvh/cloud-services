import { docsMetadata } from "@/components/docs/metadata";
import { A, C, Callout, DocPage, H2, H3, Li, Ol, P, Strong, Table, Ul } from "@/components/docs/primitives";

export const metadata = docsMetadata({
  title: "Deployments — App Platform — AhuraSense Docs",
  description:
    "How a push becomes a deployment on AhuraSense: production and preview branches, deployment states, build and runtime logs, and rollback.",
  path: "/docs/apps/deployments",
});

const HREF = "/docs/apps/deployments";

export default function DeploymentsPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="App Platform"
      title="Deployments"
      lede="A deployment is one build of one commit. Each push to a connected repository creates one, and so does every deploy hook call and every press of the Deploy button."
    >
      <H2>Production and preview</H2>
      <P>
        Every app has a <Strong>production branch</Strong>, set when you create it and changeable
        under <Strong>Settings → Source</Strong>. What a push does depends on the branch:
      </P>
      <Table
        head={["You push to", "Result", "Address"]}
        rows={[
          [
            "The production branch",
            "A production deployment. When it is ready, your app's address and any custom domains serve it.",
            <C key="p">https://v2-&lt;app-name&gt;.ahurasense.com</C>,
          ],
          [
            "Any other branch",
            "A preview deployment of that branch, with its own address. Production is never touched.",
            <C key="v">https://&lt;app-name&gt;-&lt;branch&gt;-&lt;id&gt;.ahurasense.com</C>,
          ],
        ]}
      />
      <P>
        Preview deployments always run at the Starter size with one instance, whatever size the
        app uses in production. A preview keeps its address across pushes to the same branch.
        Deleting the branch does not remove its preview.
      </P>
      <P>
        To stop pushes to the production branch from deploying — so that production only updates
        from your CI — turn off <Strong>Deploy on every push</Strong>. Previews keep deploying. See{" "}
        <A href="/docs/apps/deploy-hooks#gate-production-on-ci">Deploy hooks</A>.
      </P>

      <H3>What does not deploy</H3>
      <Ul>
        <Li>Pushing a tag, or deleting a branch.</Li>
        <Li>
          Pushing a commit that has already been deployed to the same branch. It is recognised and
          not built twice.
        </Li>
        <Li>A repository connected to more than one app. Connect each repository to one app.</Li>
      </Ul>

      <H2>The lifecycle of a deployment</H2>
      <Table
        head={["State", "What is happening"]}
        rows={[
          [<C key="q">queued</C>, "Waiting for a build machine. Deployments build in the order they arrived."],
          [<C key="b">building</C>, "Your code is being fetched and built into a container image. The build log streams on the deployment's page."],
          [<C key="p">publishing</C>, "The image is stored, your app's address is routed to it, and the new version is starting."],
          [<C key="r">ready</C>, "The new version is running and has answered our health check. It is serving."],
          [<C key="e">error</C>, <>It failed. The deployment shows the reason; see <A key="e-link" href="/docs/apps/errors">Errors</A>.</>],
        ]}
      />
      <P>
        A deployment is only marked <C>ready</C> once it is actually serving — its container has
        started and is accepting connections on its port. Most deployments take between four and
        nine minutes from push to ready, most of it in the build. A build is stopped if it runs
        longer than 20 minutes.
      </P>
      <P>
        A push received while builds are paused — during maintenance, for example — is not lost.
        It waits in the queue and builds when they resume.
      </P>

      <H2>When a deployment fails</H2>
      <P>
        <Strong>If the build fails</Strong>, nothing changes: the previous version keeps serving and
        the deployment shows why it failed, with the full build log.
      </P>
      <P>
        <Strong>If it builds but the app does not start</Strong> — it crashes on boot, or never
        listens on its port — the deployment fails with <C>rollout_failed</C> after four minutes.
        By then your app&rsquo;s address has already moved to the new version, so roll back to
        serve the previous one, then check <Strong>Runtime logs</Strong> for what the app printed
        as it exited.
      </P>

      <H2>Logs</H2>
      <H3>Build log</H3>
      <P>
        Open the <Strong>Deployments</Strong> tab and choose a deployment. Its build log shows the
        detected framework, the generated Dockerfile when we wrote one, and everything your
        install and build commands printed.
      </P>
      <Callout kind="warn" title="Build output is not redacted">
        Anything your build prints appears in the log, including environment variable values. Do
        not print secrets from your build scripts.
      </Callout>
      <H3>Runtime logs</H3>
      <P>
        The <Strong>Runtime logs</Strong> tab shows what your running app writes to standard output
        and standard error, per instance. If an instance has restarted, the logs from the run that
        failed are shown and marked as the previous run, because that is where the error is.
      </P>

      <H2>Rollback</H2>
      <P>
        Rollback serves an earlier production deployment again, instantly and without rebuilding:
        the image it built is kept.
      </P>
      <Ol>
        <Li>
          On the app&rsquo;s <Strong>Overview</Strong>, under <Strong>Serving</Strong>, open{" "}
          <Strong>Rollback available</Strong> and choose a deployment.
        </Li>
        <Li>
          Choose <Strong>Serve this</Strong>. Your app&rsquo;s address and custom domains move to it.
        </Li>
      </Ol>
      <P>
        Only production deployments that reached <C>ready</C> can be rolled back to. A rolled-back
        version runs with the app&rsquo;s <Strong>current</Strong> environment variables, not the
        ones it was built with — except public variables, which are part of its build. Your next
        production deploy moves the app forward again.
      </P>
    </DocPage>
  );
}
