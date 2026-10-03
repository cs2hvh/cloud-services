import { Code, CodeTabs } from "@/components/docs/code";
import { docsMetadata } from "@/components/docs/metadata";
import {
  A,
  C,
  Callout,
  DocPage,
  Endpoint,
  H2,
  H3,
  Li,
  Ol,
  P,
  Strong,
  Table,
  Ul,
} from "@/components/docs/primitives";

export const metadata = docsMetadata({
  title: "Deploy hooks — App Platform — AhuraSense Docs",
  description:
    "Trigger an AhuraSense deployment from your CI with a secret URL: the endpoint, responses, rate limits, and examples for GitHub Actions, GitLab CI and Bitbucket Pipelines.",
  path: "/docs/apps/deploy-hooks",
});

const HREF = "/docs/apps/deploy-hooks";

export default function DeployHooksPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="App Platform"
      title="Deploy hooks"
      lede="A deploy hook is a secret URL that deploys your app when your CI calls it. Use one when a release should wait for your own checks — tests, a manual approval, a scheduled window — instead of going out on every push."
    >
      <H2>When to use one</H2>
      <P>
        Connecting a repository deploys on every push to the production branch. That is the right
        default, but it deploys before your CI has run. A deploy hook moves the decision into your
        pipeline: production updates when the step that calls the hook runs, and not before.
      </P>
      <P>Hooks are also how to deploy when nothing was pushed:</P>
      <Ul>
        <Li>after content changes in a headless CMS, from its publish webhook</Li>
        <Li>on a schedule, to rebuild a site that renders data at build time</Li>
        <Li>after changing an environment variable that is read during the build</Li>
      </Ul>
      <P>
        A hook always deploys the app&rsquo;s <Strong>production branch</Strong> — the branch set
        in the app&rsquo;s Settings under Source — at its latest commit when the build starts. It
        cannot choose a different branch or commit.
      </P>

      <H2 id="gate-production-on-ci">Make your CI the only way to production</H2>
      <P>
        While <Strong>Deploy on every push</Strong> is on, a push to the production branch deploys
        straight away, and the hook then deploys a second time once your tests pass. To have your
        pipeline decide when production updates, turn it off:
      </P>
      <Ol>
        <Li>
          Open <Strong>Settings → Deploy hooks</Strong> and clear{" "}
          <Strong>Deploy on every push to</Strong> your production branch.
        </Li>
        <Li>Create a hook and call it from the step that runs after your tests.</Li>
      </Ol>
      <P>
        From then on, pushes to the production branch build nothing until your CI calls the hook,
        or someone presses <Strong>Deploy</Strong> in the dashboard. Pushes to other branches still
        create <A href="/docs/apps/deployments">preview deployments</A> as before.
      </P>

      <H2>Create a hook</H2>
      <Ol>
        <Li>
          Open the app in the dashboard and go to <Strong>Settings → Deploy hooks</Strong>.
        </Li>
        <Li>Give the hook a name that says where it is used, such as <C>GitHub Actions</C>.</Li>
        <Li>
          Copy the URL. It is shown <Strong>once</Strong>: we store only a hash of it, so it cannot
          be displayed again. If you lose it, revoke the hook and create a new one.
        </Li>
        <Li>Save it in your CI as a secret, for example <C>AHURA_DEPLOY_HOOK</C>.</Li>
      </Ol>
      <P>
        Only team owners and admins can create or revoke hooks. Members can see the list. An app can
        have up to 10 active hooks; the dashboard shows each one&rsquo;s name, the last four
        characters of its URL and when it was last used.
      </P>

      <H2>Call it</H2>
      <Endpoint method="POST" path="https://ahurasense.com/api/v2/hooks/deploy/{token}" />
      <P>
        Send a <C>POST</C> with no body and no headers. The token in the path is the
        authentication; it starts with <C>dh_</C>. A <C>GET</C> is refused, so that a link preview
        or a crawler fetching the URL can never start a deploy.
      </P>
      <CodeTabs
        tabs={[
          {
            label: "curl",
            lang: "bash",
            code: `curl -fsS -X POST "$AHURA_DEPLOY_HOOK"`,
          },
          {
            label: "GitHub Actions",
            lang: "yaml",
            code: `# .github/workflows/deploy.yml
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test

  deploy:
    needs: test          # runs only if the tests passed
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to AhuraSense
        run: curl -fsS -X POST "\${{ secrets.AHURA_DEPLOY_HOOK }}"`,
          },
          {
            label: "GitLab CI",
            lang: "yaml",
            code: `# .gitlab-ci.yml
stages: [test, deploy]

test:
  stage: test
  script: npm ci && npm test

deploy:
  stage: deploy
  only: [main]
  script: curl -fsS -X POST "$AHURA_DEPLOY_HOOK"`,
          },
          {
            label: "Bitbucket",
            lang: "yaml",
            code: `# bitbucket-pipelines.yml
pipelines:
  branches:
    main:
      - step:
          name: Test
          script:
            - npm ci && npm test
      - step:
          name: Deploy
          script:
            - curl -fsS -X POST "$AHURA_DEPLOY_HOOK"`,
          },
        ]}
      />
      <Callout kind="note" title="Deploying twice?">
        If production deploys on the push and again when the hook is called, turn off{" "}
        <Strong>Deploy on every push</Strong> — see{" "}
        <A href="#gate-production-on-ci">Make your CI the only way to production</A>.
      </Callout>

      <H2>Response</H2>
      <P>
        A successful call returns <C>202 Accepted</C> as soon as the deployment is queued. It does
        not wait for the build to finish.
      </P>
      <Code lang="json" title="202 Accepted">{`{
  "deployment": { "ref": "dpl-8e76876577a2" },
  "status": "queued"
}`}</Code>
      <Table
        head={["status", "Meaning"]}
        rows={[
          [<C key="q">queued</C>, "A new deployment was created and will build when the builder reaches it."],
          [
            <C key="a">already_queued</C>,
            <>A deployment of your production branch was already waiting to build, so your call joined it instead of creating a second one. <C>ref</C> is that deployment.</>,
          ],
        ]}
      />
      <P>
        Either way, the build behind <C>ref</C> starts after your call and checks out your
        production branch as it is at that moment, so it includes every commit pushed before you
        called. A deployment that records one particular commit is never joined, and your call
        queues its own. Pushes record the commit pushed, and <Strong>Deploy</Strong> in the
        dashboard records the branch&rsquo;s latest commit at the moment it was pressed.
      </P>
      <P>
        The deployment then moves through the states described in{" "}
        <A href="/docs/apps/deployments">Deployments</A>. Follow it in the dashboard; it is listed
        with the trigger <C>deploy hook</C>.
      </P>

      <H2>Errors</H2>
      <P>Every error uses the same envelope:</P>
      <Code lang="json" title="error">{`{
  "error": {
    "code": "rate_limited",
    "message": "This deploy hook has been called too often. Try again later.",
    "retry_after": 1680
  }
}`}</Code>
      <Table
        head={["Status", "code", "Cause", "What to do"]}
        rows={[
          [
            "404",
            <C key="1">not_found</C>,
            "The URL is wrong, the hook was revoked, or its app was deleted. These look the same on purpose, so the endpoint never confirms which hooks exist.",
            "Check the secret in your CI. If the hook was revoked, create a new one.",
          ],
          [
            "405",
            <C key="2">invalid_request</C>,
            <>The request was a <C>GET</C>.</>,
            <>Use <C>POST</C>.</>,
          ],
          [
            "409",
            <C key="3">conflict</C>,
            "The app has no production environment to deploy to.",
            "Contact support with the app name.",
          ],
          [
            "410",
            <C key="4">gone</C>,
            "The person who created the hook has left the team, so the hook was revoked. Later calls return 404.",
            "Have a current owner or admin create a new hook.",
          ],
          [
            "429",
            <C key="5">rate_limited</C>,
            <>Too many calls. <C>retry_after</C> and the <C>Retry-After</C> header give the wait in seconds.</>,
            "Wait and retry. Check for a loop in your pipeline.",
          ],
          [
            "500",
            <C key="6">internal</C>,
            "Something failed on our side. No deployment was created.",
            "Retry. If it keeps happening, contact support.",
          ],
        ]}
      />

      <H2>Limits</H2>
      <Table
        head={["Limit", "Value"]}
        rows={[
          [<>Calls per hook, including ones that return <C key="aq">already_queued</C></>, "30 per hour"],
          ["Calls from one IP address, to any hook", "60 per minute"],
          ["Active hooks per app", "10"],
        ]}
      />

      <H2>Security</H2>
      <P>
        Anyone who has the URL can deploy your app, so treat it like a password: keep it in your
        CI&rsquo;s secret store, never in your repository or in a log.
      </P>
      <P>What someone holding a hook URL can and cannot do:</P>
      <Ul>
        <Li>They can start a deployment of your production branch, within the limits above.</Li>
        <Li>
          They cannot read anything — not your code, settings, logs or environment variables.
        </Li>
        <Li>They cannot change settings, choose a branch or commit, or deploy a different app.</Li>
      </Ul>
      <H3>Revoke a hook</H3>
      <P>
        In <Strong>Settings → Deploy hooks</Strong>, choose <Strong>Revoke</Strong> on the hook.
        It stops working on its very next call; there is no cache to wait out. A revoked hook stays
        in the list, struck through, as a record of who could deploy and until when. Revoking cannot
        be undone — create a new hook instead.
      </P>
      <P>
        A hook is also revoked automatically when the person who created it leaves the team, or when
        their account is deleted. If a pipeline must outlive a particular person, have the hook
        created by an account that will stay on the team.
      </P>
    </DocPage>
  );
}
