-- Persist the runtime facts a deployment needs to actually run.
--
-- The reconciler builds pod specs from database rows, but the container PORT
-- and the non-root UID existed only in the build-time framework detection,
-- which was never written down. So the reconciler hardcoded port 3000 and
-- omitted runAsUser entirely.
--
-- Both failures were live and both were MASKED by legacy deployments still
-- serving the same hostnames. Removing those exposed them:
--
--   flask  - gunicorn listens on 8000, the TCP probe checked 3000, so the
--            liveness probe killed the container in a loop and the Service
--            pointed at a port nothing served. CrashLoopBackOff, 7 restarts.
--   docker - a repo-supplied Dockerfile whose image runs as root was rejected
--            by runAsNonRoot with no runAsUser to override it.
--
-- Detection already computes both (servingPort / runtimeUid). They belong on
-- the deployment, alongside the image digest, because a deployment is supposed
-- to be a complete, immutable description of how to run one build. Rolling
-- back to an older deployment must restore ITS port and ITS uid, not whatever
-- the current detection would produce today.

alter table paas.deployments
  add column container_port integer,
  add column run_as_user    integer;

comment on column paas.deployments.container_port is
  'Port the image listens on, from build-time detection. The reconciler previously hardcoded 3000, which killed every app that listens elsewhere.';
comment on column paas.deployments.run_as_user is
  'Numeric non-root UID. Kubernetes cannot verify a NAMED user under runAsNonRoot, and without an explicit uid an image that runs as root is rejected outright.';

alter table paas.deployments
  add constraint deployments_port_range
    check (container_port is null or (container_port > 0 and container_port <= 65535)),
  add constraint deployments_uid_nonroot
    check (run_as_user is null or run_as_user > 0);

update paas.deployments d
set container_port = 8000, run_as_user = 1001
from paas.projects p
where d.project_id = p.id and p.slug = 'python-docs-hello-world' and d.container_port is null;

update paas.deployments d
set container_port = 3000, run_as_user = 1000
from paas.projects p
where d.project_id = p.id and p.slug = 'node-js-getting-started' and d.container_port is null;

update paas.deployments d
set container_port = 3000, run_as_user = 1000
from paas.projects p
where d.project_id = p.id and p.slug = 'welcome-to-docker' and d.container_port is null;
