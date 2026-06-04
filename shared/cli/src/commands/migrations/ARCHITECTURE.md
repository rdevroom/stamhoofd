# Migration Commands Architecture

This document explains how `yarn stam migrations` is implemented and how the CLI, migrations manager package, backend single-migration runner, and container runtime work together.

## Goals

The migration commands make database migrations observable and repeatable by building local MySQL image chains:

1. Start from an empty database or an imported dump.
2. Commit that starting point as a base image.
3. Run each migration in its own container.
4. Commit every migration result as its own image layer.
5. Preserve success/failure metadata and logs inside each image.
6. Let reruns start from a predecessor image instead of replaying earlier successful migrations.

The implementation is local-only. It uses Docker or Podman CLI commands and does not push or pull application migration images from registries. It may pull the configured MySQL base image when missing.

## Package Boundaries

The implementation is split across three areas.

### `shared/cli/src/commands/migrations`

This folder contains thin oclif command entrypoints:

- `create-base.ts`
- `apply.ts`
- `list.ts`
- `inspect.ts`
- `rerun.ts`

Commands parse flags, create a CLI context when needed, pass backend environment values, and call the library API from `@stamhoofd/migrations-manager`.

The commands should stay thin. Docker, image metadata, migration catalog, and MySQL orchestration belong in the manager package.

### `shared/migrations-manager`

This is the reusable implementation package. It exposes:

- `createBaseImage(options)`
- `runMigrationChain(options)`
- `listMigrationImages(options)`
- `inspectMigrationImage(options)`
- `resolveRerunStart(options)`
- catalog helpers and runtime types

The package does not depend on `@stamhoofd/cli`. It accepts generic options such as root directory, database name, tag prefix, environment variables, runtime, and build mode.

### `backend/app/api/single-migration.ts`

This is the backend process entrypoint that runs exactly one migration. It loads the normal backend environment, applies explicit database overrides from the manager, and delegates to `src/migrations-runner/run-single.ts`.

The existing all-migrations entrypoint, `backend/app/api/migrations.ts`, remains unchanged.

## Main Data Flow

### Creating A Base Image

`migrations create-base` calls `createBaseImage`.

The manager:

1. Resolves the container runtime, preferring Podman over Docker.
2. Creates a chain id unless one was provided.
3. Starts `mysql:8.4` with `MYSQL_ROOT_PASSWORD=root`.
4. Forces MySQL to use `--datadir=/stamhoofd-mysql-data`.
5. Waits until MySQL accepts connections.
6. Creates the requested database.
7. If `--dump` was passed, copies the dump into the container and imports it.
8. Writes `/stamhoofd-migrations/manifest.json`.
9. Stops MySQL cleanly.
10. Commits the container as the requested base image tag.
11. Removes the temporary container.

The non-default datadir is essential. The official MySQL image declares `/var/lib/mysql` as a volume, and Docker/Podman commits do not include mounted volume data. Database files must live in the writable container filesystem so committed images preserve them.

### Applying A Migration Chain

`migrations apply` calls `runMigrationChain`.

The manager:

1. Builds required packages based on `--build auto|skip|force`.
2. Discovers the current migration catalog.
3. Freezes that catalog in memory for the chain run.
4. Selects all migrations or the slice starting at `startFrom`.
5. For every selected migration:
   - generates a deterministic local image tag,
   - starts a MySQL container from the previous image,
   - publishes a random host port for MySQL,
   - runs the backend single-migration process against that port,
   - captures stdout/stderr as the migration log,
   - writes manifest and log files into the container,
   - stops MySQL,
   - commits the container as a success or failed migration image,
   - removes the temporary container,
   - stops the chain after a failed migration unless `--continue-on-failure` is set.

The same primitive is used for first runs and reruns. A rerun only changes the starting image and starting migration.

## Migration Catalog

The catalog is implemented in `shared/migrations-manager/src/catalog.ts`.

It discovers migrations in the same order as the existing backend migration command:

1. `backend/shared/models/src/migrations`
2. `backend/shared/email/migrations`
3. `backend/app/api/src/migrations`

For every migration, the catalog records:

- index
- id
- normalized filename
- source path
- package: `models`, `email`, or `api`
- SHA-256 hash

Filename normalization matches `@simonbackx/simple-database`: `.ts` becomes `.js`, while `.sql` stays `.sql`.

The catalog snapshot also stores:

- snapshot version
- creation time
- root directory
- git revision, when available
- full catalog hash

Reruns compare the current catalog with the previous chain catalog. Changed migration files fail by default unless `--allow-changed-files` is explicitly set.

## Backend Single-Migration Runner

The backend runner is implemented in `backend/app/api/src/migrations-runner/run-single.ts`.

It performs the backend-specific setup required before running a migration:

1. Sets the JSON encoding version with `Column.setJSONVersion(Version)`.
2. Forces UTC timezone.
3. Reloads database configuration.
4. Creates the target database if needed.
5. Runs the setup migration that creates the `migrations` table.
6. Checks whether the target migration is already recorded in `migrations`.
7. If already executed, logs a skip message and exits successfully.
8. Otherwise loads exactly one migration with `Migration.getMigration(file)`.
9. Runs `migration.up()`.
10. Records the normalized migration filename in the `migrations` table.
11. Reloads the database to avoid connection state leakage.

Skipping already-executed migrations is important for dump-based base images. A dump may already contain a schema and migration history; replaying early schema migrations would fail with existing-table errors.

## Environment Overrides

`backendEnv.load({ service: 'api' })` normally resolves the local development database from the selected environment. For migration image containers, the manager needs the backend process to connect to the temporary MySQL container instead.

The manager passes both standard DB variables and explicit migration override variables:

- `DB_HOST`
- `DB_PORT`
- `DB_DATABASE`
- `DB_USER`
- `DB_PASS`
- `MIGRATION_DB_HOST`
- `MIGRATION_DB_PORT`
- `MIGRATION_DB_DATABASE`
- `MIGRATION_DB_USER`
- `MIGRATION_DB_PASS`

`backend/app/api/single-migration.ts` applies the `MIGRATION_DB_*` values after backend environment loading, because environment loading writes DB values itself.

## Container Runtime Abstraction

The runtime abstraction lives in `shared/migrations-manager/src/runtime.ts`.

It uses CLI commands rather than Dockerode:

- Podman is preferred when available and usable.
- Docker is used when Podman is not available.
- Commands are spawned directly and stdout/stderr/status are captured.

The runtime wraps:

- `run`
- `exec`
- `stop`
- `rm`
- `commit`
- `image inspect`
- `images --filter label=...`
- `logs`
- `cp`

Docker and Podman output image summaries differently. The runtime normalizes both Docker-style fields like `Repository`, `Tag`, `ID`, and Podman-style fields like `repository`, `tag`, `Id`. It also supports Docker labels as comma-separated strings and Podman labels as JSON objects.

## MySQL Image Management

`shared/migrations-manager/src/mysql-image-database.ts` owns MySQL container operations.

It can:

- start MySQL from an image,
- wait until it accepts connections,
- create databases,
- import plain `.dump` and `.sql` dumps,
- write manifests and logs into the container filesystem,
- stop MySQL cleanly before commit.

Containers that need to be committed are not started with `--rm`; they are removed explicitly after commit.

## Metadata And Labels

Label generation is implemented in `shared/migrations-manager/src/labels.ts`.

Labels are intentionally small and queryable. They power `migrations list` and chain grouping.

Common labels include:

- `be.stamhoofd.migrations=true`
- `be.stamhoofd.migrations.chain=<chain-id>`
- `be.stamhoofd.migrations.role=base|migration`
- `be.stamhoofd.migrations.status=base|success|failed`
- `be.stamhoofd.migrations.database=<database>`
- `be.stamhoofd.migrations.parent-image=<image>`
- `be.stamhoofd.migrations.migration=<normalized-file>`
- `be.stamhoofd.migrations.migration-index=<index>`
- `be.stamhoofd.migrations.migration-sha256=<hash>`
- `be.stamhoofd.migrations.catalog-sha256=<hash>`
- `be.stamhoofd.migrations.dump-sha256=<hash>`
- `be.stamhoofd.migrations.started-at=<iso>`
- `be.stamhoofd.migrations.finished-at=<iso>`

Full metadata is stored inside the image at:

```txt
/stamhoofd-migrations/manifest.json
/stamhoofd-migrations/logs/<migration>.log
```

The manifest includes larger structures such as the full catalog snapshot, changed files, previous catalog hash, error details, and runtime metadata.

## Listing And Inspecting Images

`listMigrationImages` reads local images with the migration label, groups them by chain id, sorts migration layers by migration index, and reports:

- base image
- latest successful migration
- failed migration, if any
- chain status

`inspectMigrationImage` reads image labels with `image inspect`, creates a temporary stopped container from the image, copies `/stamhoofd-migrations/manifest.json` to a temporary host file, parses it, and removes the temporary container.

## Rerun Resolution

`resolveRerunStart` finds the correct starting image for a rerun.

Given a chain id and migration filename, it:

1. Lists migration images.
2. Finds the selected chain.
3. Reads the stored catalog from the latest available image manifest.
4. Finds the selected migration index in that catalog.
5. Resolves the predecessor image: base for index `0`, otherwise the successful migration image at `index - 1`.
6. Returns `baseImage`, `startFrom`, `previousChainId`, and `previousCatalog` for `runMigrationChain`.

This also supports resuming after an interrupted command if the predecessor image exists but the selected migration image does not yet exist.

## Failure Behavior

If the backend process exits non-zero or throws, the manager marks the migration result as failed but still writes the manifest/log and commits the container.

This preserves:

- database state at the failure point,
- migration log output,
- error summary,
- catalog and migration metadata.

By default the chain stops after the first failure. With `--continue-on-failure`, later migrations are attempted from the failed image.

## Build Modes

The manager exposes `build: 'auto' | 'skip' | 'force'`.

- `auto` builds if expected outputs are missing.
- `skip` assumes compiled outputs already exist.
- `force` rebuilds required packages.

The required build set includes the migrations manager package, backend shared packages, and `backend/app/api`, because the backend single-migration process must run compiled migration files.

## Important Invariants

- Never use MySQL's default `/var/lib/mysql` datadir for committed migration images.
- Every committed image must have migration labels.
- Every committed image should contain `/stamhoofd-migrations/manifest.json`.
- Migration filenames must be normalized the same way as `@simonbackx/simple-database`.
- `runMigrationChain` should use one migration execution primitive for initial runs and reruns.
- Reruns must not rerun earlier successful migrations.
- Changed migration files must fail by default unless explicitly allowed.
