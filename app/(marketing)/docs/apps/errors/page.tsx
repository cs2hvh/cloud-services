import { docsMetadata } from "@/components/docs/metadata";
import { A, C, Callout, DocPage, H2, H3, P, Strong, Table } from "@/components/docs/primitives";

export const metadata = docsMetadata({
  title: "Errors — App Platform — AhuraSense Docs",
  description:
    "Every reason an AhuraSense deployment can fail: the error code, what it means, and what to do about it.",
  path: "/docs/apps/errors",
});

const HREF = "/docs/apps/errors";

export default function ErrorsPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="App Platform"
      title="Errors"
      lede="A failed deployment shows an error code and a message on its page. The message says what went wrong in your terms; this page explains each code and what to do next."
    >
      <P>
        Codes are stable; messages may be reworded. For errors that
        come from your own code, the deployment&rsquo;s build log or the app&rsquo;s runtime logs
        hold the detail; see <A href="/docs/apps/deployments#logs">Logs</A>.
      </P>

      <H2>Your repository</H2>
      <Table
        head={["Code", "Meaning", "What to do"]}
        rows={[
          [
            <C key="1">repo_unreadable</C>,
            "We could see no files in the repository at all. That almost always means we do not have access, rather than that it is empty.",
            "If it is private, connect the git account that owns it, then deploy again.",
          ],
          [
            <C key="2">repo_not_granted</C>,
            "Your connected GitHub account cannot see this repository.",
            "In your GitHub settings, under the installed app, give it access to this repository, then deploy again.",
          ],
          [
            <C key="3">framework_undetected</C>,
            "Nothing in the root directory told us how to build it.",
            <>Set the <A key="3a" href="/docs/apps/builds#root-directory">root directory</A> if the app is in a subfolder, or add a <C key="3b">Dockerfile</C>. See <A key="3c" href="/docs/apps/builds">Build configuration</A>.</>,
          ],
          [
            <C key="4">no_entrypoint</C>,
            <>A Python project with none of <C key="4a">manage.py</C>, <C key="4b">app.py</C>, <C key="4c">main.py</C>, <C key="4d">wsgi.py</C>, <C key="4e">asgi.py</C>, <C key="4f">application.py</C>, <C key="4g">server.py</C> or <C key="4h">run.py</C> in the root directory, so there is nothing to start.</>,
            "Set the root directory to the folder that contains the app. A library cannot be deployed.",
          ],
          [
            <C key="5">nothing_to_build</C>,
            <>A project with no <C key="5a">build</C> script and no <C key="5b">index.html</C> to serve.</>,
            "In a monorepo, set the root directory to the app. For a plain static site, commit an index.html.",
          ],
        ]}
      />

      <H2>The build</H2>
      <Table
        head={["Code", "Meaning", "What to do"]}
        rows={[
          [
            <C key="1">build_failed</C>,
            <>The build did not produce an app. The message names the step: checking out your code, a commit that no longer exists (often after a force-push), a missing root directory or Dockerfile, or your own build command failing.</>,
            "Read the build log. When your build command failed, its own output is there.",
          ],
          [
            <C key="2">build_timeout</C>,
            "The build ran for more than 20 minutes and was stopped.",
            "Deploy again. If it keeps happening, look for a step that hangs or downloads far more than it needs.",
          ],
        ]}
      />
      <H3>Common causes of a failed build command</H3>
      <Table
        head={["In the build log", "Cause"]}
        rows={[
          [
            "Missing environment variables, or a key not provided",
            <>Code that reads a variable at import time and throws if it is absent. Add the variable under <Strong key="e1">Environment</Strong> and deploy again.</>,
          ],
          [
            "A lockfile error from npm ci, pnpm or yarn",
            <>Your lockfile does not match <C key="e2">package.json</C>. Update and commit the lockfile.</>,
          ],
          [
            "Out of memory, or the process was killed",
            "The build needs more than the 4 GB a build machine has. Reduce what the build does at once.",
          ],
        ]}
      />

      <H2>Starting the app</H2>
      <Table
        head={["Code", "Meaning", "What to do"]}
        rows={[
          [
            <C key="1">rollout_failed</C>,
            "It built, but the app never started serving within four minutes: it exited, crashed, or did not listen on its port.",
            <>Open <Strong key="1a">Runtime logs</Strong> for what it printed. Check that it listens on <C key="1b">PORT</C> on <C key="1c">0.0.0.0</C>. <A key="1d" href="/docs/apps/deployments#rollback">Roll back</A> to restore the previous version meanwhile.</>,
          ],
          [
            <C key="2">hostname_taken</C>,
            "The app's address is already used by another app.",
            "Rename the app under Settings, then deploy again.",
          ],
        ]}
      />

      <H2>On our side</H2>
      <Table
        head={["Code", "Meaning", "What to do"]}
        rows={[
          [
            <C key="1">interrupted</C>,
            "The platform restarted while your deployment was building. Nothing was changed.",
            "Deploy again. It builds the same commit.",
          ],
          [
            <C key="2">publish_failed</C>,
            "The build succeeded, but storing its image failed.",
            "Deploy again. If it keeps happening, contact support.",
          ],
          [
            <C key="3">internal_error</C>,
            "Something failed on our side. The message ends with a reference.",
            "Deploy again. If it keeps happening, contact support and quote the reference.",
          ],
        ]}
      />
      <Callout kind="tip" title="Quote the reference">
        Messages for errors on our side end with <C>Reference:</C> and eight characters. It lets us
        find exactly what happened. Include it, and the app name, when you{" "}
        <A href="/contact">contact support</A>.
      </Callout>

      <H2>Deploy hook responses</H2>
      <P>
        Calls to a deploy hook return their own HTTP errors, such as <C>404</C> for an unknown hook
        and <C>429</C> when it is called too often. They are listed on the{" "}
        <A href="/docs/apps/deploy-hooks#errors">Deploy hooks</A> page.
      </P>
    </DocPage>
  );
}
