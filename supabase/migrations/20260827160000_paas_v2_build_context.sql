-- Where the Docker build context starts, when a root directory is set.
--
-- Setting a root directory makes that directory the build context. That is what
-- Vercel means by it, it is right for almost every repository, and it is what
-- deploy v2 has always done.
--
-- It cannot express one real shape: a monorepo whose Dockerfile is committed in
-- a subdirectory but written to be built from the REPOSITORY root, the way
-- `docker build -f backend/Dockerfile .` does. tiangolo/full-stack-fastapi-
-- template is exactly this — its backend/Dockerfile bind-mounts a uv.lock that
-- lives one level above it, so the build fails with
--
--     failed to calculate checksum of ref …: "/uv.lock": not found
--
-- and no root directory setting can fix it, because the file is outside every
-- candidate context.
--
-- This is Vercel's "Include source files outside of the Root Directory in the
-- Build Step", under a name that says what it does here. It applies only to a
-- Dockerfile the REPOSITORY supplies: a Dockerfile we generate always expects
-- the application directory as its context, because that is where its
-- package.json is.
--
-- Default false, so no existing project changes behaviour.

alter table paas.projects
  add column if not exists build_context_repo_root boolean not null default false;

comment on column paas.projects.build_context_repo_root is
  'When a root directory is set, build the repository-supplied Dockerfile with the repository root as the Docker context instead of the root directory. No effect on generated Dockerfiles.';
