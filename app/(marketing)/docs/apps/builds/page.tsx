import { Code } from "@/components/docs/code";
import { docsMetadata } from "@/components/docs/metadata";
import { A, C, Callout, DocPage, H2, H3, Li, P, Strong, Table, Ul } from "@/components/docs/primitives";

export const metadata = docsMetadata({
  title: "Build configuration — App Platform — AhuraSense Docs",
  description:
    "How AhuraSense builds your repository: framework detection, your own Dockerfile, ports, Node versions, package managers, root directories and monorepos.",
  path: "/docs/apps/builds",
});

const HREF = "/docs/apps/builds";

export default function BuildsPage() {
  return (
    <DocPage
      href={HREF}
      eyebrow="App Platform"
      title="Build configuration"
      lede="We read your repository, work out what it is, and build a container image for it. Most repositories need no configuration; when yours does, a Dockerfile gives you full control."
    >
      <H2>How your app is detected</H2>
      <P>
        Detection looks at the files in your app&rsquo;s root directory. The first match wins, in
        this order:
      </P>
      <Table
        head={["Order", "If the root contains", "Built as"]}
        rows={[
          ["1", <C key="1">Dockerfile</C>, <>Your Dockerfile, exactly as written. See <A key="1l" href="#your-own-dockerfile">below</A>.</>],
          ["2", <><C key="2a">hugo.toml</C>, <C key="2b">hugo.yaml</C> or <C key="2c">hugo.json</C></>, "Hugo, built with hugo --minify and served as a static site"],
          ["3", <C key="3">composer.json</C>, "PHP: Laravel, Symfony, or plain PHP"],
          ["4", <C key="4">package.json</C>, <>A Node framework — see <A key="4l" href="#node-frameworks">Node frameworks</A></>],
          ["5", <><C key="5a">requirements.txt</C>, <C key="5b">pyproject.toml</C> or <C key="5c">Pipfile</C></>, "Python: Django, FastAPI, Flask, or a script"],
          ["6", <C key="6">Cargo.toml</C>, "Rust"],
          ["7", <C key="7">go.mod</C>, "Go"],
          ["8", <C key="8">Gemfile</C>, "Ruby, or Rails"],
          ["9", <><C key="9a">pom.xml</C> or <C key="9b">build.gradle</C></>, "Java, with Maven or Gradle"],
          ["10", <C key="10">index.html</C>, "A static site, served as it is"],
        ]}
      />
      <P>
        If nothing matches, the deployment fails with <C>framework_undetected</C>. Add a{" "}
        <C>Dockerfile</C> to build anything else.
      </P>

      <H3 id="node-frameworks">Node frameworks</H3>
      <P>
        For a <C>package.json</C>, the framework is read from your dependencies, in this order. The
        build step runs your <C>build</C> script, if you have one.
      </P>
      <Table
        head={["Dependency", "Framework", "Runs as"]}
        rows={[
          [<C key="a">next</C>, "Next.js", <>A server, with <C key="a1">next start</C>. See below for output modes.</>],
          [<><C key="b">nuxt</C></>, "Nuxt", "A server"],
          [<C key="c">@remix-run/node</C>, "Remix", "A server"],
          [<C key="d">@sveltejs/kit</C>, "SvelteKit", "A server"],
          [<C key="e">gatsby</C>, "Gatsby", "A static site"],
          [<C key="f">@docusaurus/core</C>, "Docusaurus", "A static site"],
          [<C key="g">astro</C>, "Astro", <>A server if <C key="g1">output</C> is <C key="g2">server</C> or <C key="g3">hybrid</C>, otherwise a static site</>],
          [<C key="h">@angular/core</C>, "Angular", "A static site"],
          [<C key="i">vite</C>, "Vite (React or Vue)", "A static site"],
          [<C key="j">react-scripts</C>, "Create React App", "A static site"],
          [<><C key="k">express</C>, <C key="k2">fastify</C>, <C key="k3">koa</C>, <C key="k4">@nestjs/core</C></>, "Node server", <>Your <C key="k5">start:prod</C> or <C key="k6">start</C> script</>],
          ["anything else, with a start script", "Node", <>Your <C key="l">start</C> script</>],
        ]}
      />
      <H3>Next.js output modes</H3>
      <Ul>
        <Li>
          <Strong>Default:</Strong> runs <C>next start</C>.
        </Li>
        <Li>
          <C>output: &apos;standalone&apos;</C>: runs the generated <C>server.js</C>, with{" "}
          <C>.next/static</C> and <C>public</C> copied alongside it. Smaller and faster to start.
        </Li>
        <Li>
          <C>output: &apos;export&apos;</C>: served as a static site from <C>out/</C>. There is no
          server.
        </Li>
      </Ul>

      <H2>The port your app listens on</H2>
      <P>
        Your app receives its port in the <C>PORT</C> environment variable. Listen on it, on all
        interfaces (<C>0.0.0.0</C>), not only <C>localhost</C>.
      </P>
      <Table
        head={["Runtime", "PORT"]}
        rows={[
          ["Node, Ruby", "3000"],
          ["Python", "8000"],
          ["Go, Rust, Java, PHP, static sites", "8080"],
          [
            "Your own Dockerfile",
            <>The last numeric <C key="ex">EXPOSE</C> line, or 3000 if there is none</>,
          ],
        ]}
      />
      <P>
        A deployment is ready when something accepts connections on that port. If nothing does
        within four minutes, it fails with <C>rollout_failed</C>.
      </P>

      <H2>Node.js</H2>
      <H3>Version</H3>
      <P>
        Supported major versions are 18, 20, 22 and 24. The default is 22. Set{" "}
        <C>engines.node</C> in <C>package.json</C> to choose another; ranges such as{" "}
        <C>&gt;=20</C> and <C>^18</C> are understood, and the newest supported version that
        satisfies yours is used. A <C>.nvmrc</C> is read only when <C>engines.node</C> is absent.
      </P>
      <Code lang="json" title="package.json">{`{
  "engines": { "node": "20.x" }
}`}</Code>
      <H3>Package manager</H3>
      <P>Chosen from your lockfile:</P>
      <Table
        head={["Lockfile", "Install command"]}
        rows={[
          [<C key="1">pnpm-lock.yaml</C>, <C key="1c">pnpm install --frozen-lockfile</C>],
          [<C key="2">yarn.lock</C>, <C key="2c">yarn install --immutable</C>],
          [<><C key="3">bun.lock</C> or <C key="3b">bun.lockb</C></>, <C key="3c">bun install --frozen-lockfile</C>],
          [<C key="4">package-lock.json</C>, <C key="4c">npm ci</C>],
          ["none", <C key="5c">npm install</C>],
        ]}
      />
      <P>
        Development dependencies are installed, so your build tools are available. Workspaces and
        monorepos are supported; see <A href="#root-directory">Root directory</A>.
      </P>

      <H2>Other runtimes</H2>
      <Table
        head={["Runtime", "Version", "What we run"]}
        rows={[
          [
            "Python",
            "3.12",
            <>Installs <C key="p1">requirements.txt</C>, or the project from <C key="p2">pyproject.toml</C>. Django runs under gunicorn, FastAPI under uvicorn, Flask under gunicorn; otherwise <C key="p3">python main.py</C>. One of <C key="p4">manage.py</C>, <C key="p5">app.py</C>, <C key="p6">main.py</C>, <C key="p7">wsgi.py</C>, <C key="p8">asgi.py</C>, <C key="p9">application.py</C>, <C key="p10">server.py</C> or <C key="p11">run.py</C> must be in the root directory.</>,
          ],
          ["Go", "1.23", "Builds the first main package in the module and runs it."],
          ["Rust", "stable", <>Runs <C key="r1">cargo build --release --locked</C> and starts the binary it produces.</>],
          ["Ruby", "3.3", <>Rails runs <C key="ru1">rails server</C>; otherwise <C key="ru2">ruby app.rb</C>.</>],
          ["PHP", "8.3", <>Apache, serving <C key="ph1">public/</C> if <C key="ph2">public/index.php</C> exists, otherwise the root. Dependencies installed with Composer.</>],
          ["Java", "21", "Builds with Maven or Gradle, skipping tests, and runs the jar."],
        ]}
      />
      <P>
        These are the defaults we generate. To use a different version or command, bring your own
        Dockerfile.
      </P>

      <H2 id="your-own-dockerfile">Your own Dockerfile</H2>
      <P>
        If the root directory contains a file named exactly <C>Dockerfile</C>, it is built as
        written and nothing is detected. This is how to deploy any language, version or start
        command we do not generate.
      </P>
      <Callout kind="warn" title="Your container runs as a non-root user">
        Containers run as user ID 1001, with no added Linux capabilities, whatever{" "}
        <C>USER</C> your Dockerfile sets. Make sure the files your app writes to are writable by
        that user, and listen on a port above 1024 — use <C>PORT</C>.
      </Callout>
      <P>
        Environment variables reach your Dockerfile build in two ways; see{" "}
        <A href="/docs/apps/environment-variables#your-own-dockerfile">Environment variables</A>.
      </P>

      <H2 id="root-directory">Root directory</H2>
      <P>
        For a monorepo, set <Strong>Settings → Source → Root directory</Strong> to the folder that
        contains the app, such as <C>apps/web</C>. Detection, the build and the start command all
        run from there. The whole repository is still fetched, so the build can use shared code
        from other folders when your tooling supports it.
      </P>
      <P>
        If the app brings its own Dockerfile and needs files from outside its folder — a shared
        package, a lockfile at the repository root — turn on{" "}
        <Strong>Include files outside &lt;your root directory&gt;</Strong> under{" "}
        <Strong>Settings → Build</Strong>. The build then runs from the top of the repository,
        using the Dockerfile in your root directory. It has no effect on Dockerfiles we generate.
      </P>

      <H2>Build resources</H2>
      <P>
        Each build runs on its own machine with 2 vCPUs and 4 GB of memory, which is discarded when
        the build ends. Nothing is shared between builds, so every build installs dependencies from
        scratch. A build that runs longer than 20 minutes is stopped and fails with{" "}
        <C>build_timeout</C>.
      </P>
    </DocPage>
  );
}
