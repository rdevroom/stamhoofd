# Migration Image Chains

`yarn stam migrations` runs database migrations inside local MySQL containers and saves the result of every step as a local Docker/Podman image.

This makes migrations easier to debug:

- You can inspect the database exactly as it looked after each migration.
- A failed migration still leaves behind an image with the failed database state and logs.
- A rerun can start from the image before the selected migration instead of replaying everything from scratch.

## Docker/Podman Basics

You only need a few container concepts to understand this tool.

| Concept | Meaning In This Tool |
| --- | --- |
| Image | A saved snapshot that can be used to start a container. Example: `stamhoofd-migrations/dev:base`. |
| Container | A running MySQL process created from an image. The manager starts temporary containers while applying migrations. |
| Commit | Saving a container's current filesystem as a new image. This is how every migration becomes a new image layer. |
| Tag | A Docker/Podman alias for one image. Examples: `mysql:8.4`, `localhost/stamhoofd-migrations/manual:base`, or `localhost/stamhoofd-migrations/manual:latest`. |
| Label | Small metadata attached to an image. The manager uses labels to find and group migration chains. |
| Volume | External storage mounted into a container. The manager avoids MySQL's default volume path so committed images actually contain database files. |

Docker and Podman do similar things. This tool prefers Podman when available, otherwise Docker. The command examples use `yarn stam`; if you are editing the CLI itself, use `yarn stam-dev` so the CLI is rebuilt first.

## The Big Picture

The migration manager creates a chain of images. The base image is the starting database. Every migration adds one new image.

```txt
                 optional dump file
                         |
                         v
empty database ---> [ base image ] ---> [ migration 1 image ] ---> [ migration 2 image ] ---> [ migration 3 image ] ---> ...
```

Each arrow means: start a temporary MySQL container from the previous image, run one migration, then commit the result as the next image.

## Command Overview

```bash
yarn stam migrations create-base --database stamhoofd-development --tag stamhoofd-migrations/dev:base
yarn stam migrations create-base --dump ~/Downloads/stamhoofd-development.dump --database stamhoofd-development --tag stamhoofd-migrations/dev:base
yarn stam migrations apply --base stamhoofd-migrations/dev:base --tag-prefix stamhoofd-migrations/dev --database stamhoofd-development
yarn stam migrations list
yarn stam migrations inspect --image stamhoofd-migrations/dev:0001-1593773929-create-initial-tables
yarn stam migrations inspect --image stamhoofd-migrations/dev:0001-1593773929-create-initial-tables --catalog --labels
yarn stam migrations inspect --image stamhoofd-migrations/dev:0001-1593773929-create-initial-tables --json
yarn stam migrations inspect --image stamhoofd-migrations/dev:0001-1593773929-create-initial-tables --logs
yarn stam migrations rerun --chain <chain-id>
yarn stam migrations cleanup --chain <chain-id> --dry-run
yarn stam migrations diff --from <image> --to <image> --database stamhoofd-development
yarn stam migrations diff --data --from <image> --to <image> --database stamhoofd-development
yarn stam migrations export --image <image> --all --output .stamhoofd/migrations-exports/export.sql
```

Most commands are interactive in a terminal. When required flags are missing, the CLI asks for values and remembers non-sensitive choices per workspace in the user cache directory. In non-interactive scripts, required flags must be passed explicitly.

The migration database inside new images is always named `stamhoofd-migrations`. Older images keep their stored manifest database name, and image-based commands use that stored value.

Tags and chains are related but not the same. A tag points to one Docker/Podman image. A chain id is Stamhoofd metadata that groups the base image and later migration images from one run. Tags can be deleted independently from images; the chain id remains available as long as labelled images still exist locally.

## Step 1: Create A Base Image

The base image is the starting point for the chain. It can be empty or imported from a dump.

### Empty Base

Use this when you want to test the complete migration history from nothing:

```bash
yarn stam migrations create-base --database stamhoofd-development --tag stamhoofd-migrations/dev:base
```

This creates an empty database and records `emptyBase: true` in the image manifest.

### Dump Base

Use this when you want a real-world starting point:

```bash
yarn stam migrations create-base --dump ~/Downloads/stamhoofd-development.dump --database stamhoofd-development --tag stamhoofd-migrations/dev:base
```

Supported dump extensions are `.dump` and `.sql`. Compressed dumps are intentionally not supported.

The manager stores the dump SHA-256 in image labels and in the manifest. If the dump already contains entries in the `migrations` table, the single-migration runner skips those migrations and still commits observable success layers.

### Base Creation Diagram

```txt
run create-base
      |
      v
pick Podman or Docker
      |
      v
start temporary MySQL container
      |
      v
use --datadir=/stamhoofd-mysql-data
      |
      v
create target database
      |
      v
dump provided?
      |
      +-- no  --> keep database empty ------+
      |                                      |
      +-- yes --> import .dump or .sql -----+
                                             |
                                             v
                                   write manifest.json
                                             |
                                             v
                                      stop MySQL
                                             |
                                             v
                                commit container as base image
                                             |
                                             v
                                remove temporary container
```

## Step 2: Apply Migrations

`apply` discovers all migrations in the normal backend order:

1. `backend/shared/models/src/migrations`
2. `backend/shared/email/migrations`
3. `backend/app/api/src/migrations`

It then runs exactly one migration per image layer:

```bash
yarn stam migrations apply --base stamhoofd-migrations/dev:base --tag-prefix stamhoofd-migrations/dev --database stamhoofd-development
```

For every migration, the manager:

1. Starts a temporary MySQL container from the previous image.
2. Runs the backend single-migration process against that container.
3. Writes metadata and logs into `/stamhoofd-migrations`.
4. Stops MySQL.
5. Commits the container as the next image.
6. Removes the temporary container.

```txt
Manager                Podman/Docker              MySQL container              Backend runner
   |                        |                            |                            |
   | start container        |                            |                            |
   |----------------------->|                            |                            |
   |                        | create from previous image |                            |
   |                        |--------------------------->|                            |
   | wait for SELECT 1      |                            |                            |
   |---------------------------------------------------->|                            |
   | run one migration with DB port override             |                            |
   |----------------------------------------------------------------------------->|
   |                        |                            | apply or skip migration     |
   |                        |                            |<---------------------------|
   | receive stdout, stderr, exit status                 |                            |
   |<-----------------------------------------------------------------------------|
   | write manifest and logs                             |                            |
   |---------------------------------------------------->|                            |
   | stop MySQL cleanly                                  |                            |
   |---------------------------------------------------->|                            |
   | commit container as next image                      |                            |
   |----------------------->|                            |                            |
   | remove temporary container                          |                            |
   |----------------------->|                            |                            |
```

## Why The Custom MySQL Data Directory Matters

The official MySQL image stores data in `/var/lib/mysql`. That path is declared as a Docker volume. Volumes are external storage, and Docker/Podman do not include volume data when committing a container as an image.

If the manager used the default MySQL data directory, the committed image would not contain the database.

That is why every MySQL container is started with:

```txt
--datadir=/stamhoofd-mysql-data
```

```txt
Wrong for this use case:

    /var/lib/mysql  (Docker/Podman volume)
          |
          | commit container
          v
    image does NOT contain database files

Correct for this use case:

    /stamhoofd-mysql-data  (normal container filesystem)
          |
          | commit container
          v
    image DOES contain database files
```

## Metadata And Logs

Every committed image gets small labels so the manager can find and group chains quickly.

Labels include:

- `be.stamhoofd.migrations=true`
- chain id
- role: `base` or `migration`
- status: `base`, `success`, or `failed`
- database name
- parent image
- migration filename, index, and SHA-256
- catalog SHA-256
- dump SHA-256 when a dump was used
- start and finish timestamps

Every image also stores full metadata and logs inside the image:

```txt
/stamhoofd-migrations/manifest.json
/stamhoofd-migrations/logs/<migration>.log
```

Use `inspect` to read the labels and manifest:

```bash
yarn stam migrations inspect --image <image>
```

By default, `inspect` prints a concise summary. Add flags when you need more detail:

- `--json`: print the complete metadata and manifest JSON.
- `--catalog`: include the stored migration catalog entries.
- `--labels`: include image labels.
- `--logs`: print the stored migration log.
- `--logs-lines <n>`: control the failed-log preview length.

## Listing Chains

Use `list` to see all locally created migration chains:

```bash
yarn stam migrations list
```

The list command looks for images with `be.stamhoofd.migrations=true`, groups them by chain id, and prints a compact overview with the chain status, friendly latest migration name, image count, relative update time, and suggested next step.

```txt
local Docker/Podman images
          |
          v
keep images with be.stamhoofd.migrations=true
          |
          v
group by chain id
          |
          v
sort migration layers by index
          |
          v
print chain status
```

## Failure Handling

If a migration fails, the manager still commits the container as a failed image. This is intentional. It preserves the exact database state and logs at the failure point.

By default, `apply` stops after the first failure. Use `--continue-on-failure` only when later results are still useful even though they start from a failed predecessor.

```txt
[ base image ] ---> [ migration 1: success ] ---> [ migration 2: failed image ] ---> default: stop chain
                                                           |
                                                           | with --continue-on-failure
                                                           v
                                                [ migration 3: attempted from failed image ]
```

## Reruns And Resuming

Use `rerun` to start from a specific migration without rerunning earlier successful layers:

```bash
yarn stam migrations rerun --chain <chain-id> --from 1734429094-registration-trial-until.sql --tag-prefix stamhoofd-migrations/dev-rerun --database stamhoofd-development --build skip
```

The resolver finds the image immediately before the selected migration and starts a new chain from that image. This also works for resuming after an interrupted command if the predecessor image was already committed.

In a terminal, `rerun` can infer the failed migration and ask for any missing chain, tag prefix, or database values:

```bash
yarn stam migrations rerun --chain <chain-id>
```

```txt
Original chain:

    [ base ] ---> [ 0001 success ] ---> [ 0002 success ] ---> [ 0003 failed or needs rerun ]
                                               |
                                               |
                                               +------ start new rerun chain here
                                                       without rerunning 0001 or 0002

New rerun chain:

    [ image after 0002 ] ---> [ 0003 rerun ] ---> [ 0004 ] ---> ...
```

## Changed Migration Files

Reruns compare the current migration catalog with the catalog stored in the previous chain. If relevant migration files changed, rerun fails by default.

Use this only when intentionally rebuilding with changed migration contents:

```bash
yarn stam migrations rerun --chain <chain-id> --from <migration-file> --tag-prefix <new-prefix> --database stamhoofd-development --allow-changed-files
```

When changed files are allowed, the new chain records the changed file metadata in the manifest.

## Build Modes

`apply` and `rerun` accept:

- `--build auto`: build required outputs when they are missing.
- `--build skip`: assume compiled outputs are ready.
- `--build force`: rebuild required packages before running.

When `--build skip` is used, the CLI checks TypeScript migration sources against compiled JavaScript output. If output is missing or older than the source, an interactive terminal can switch to `--build force`; non-interactive runs stop instead of silently using stale code.

Manual migration-chain testing is often faster with `--build skip` after running:

```bash
yarn --cwd shared/migrations-manager -s build
yarn --cwd backend/app/api -s build
yarn --cwd shared/cli -s build
```

## Practical Tips

- Use unique tag prefixes, such as `stamhoofd-migrations/my-test` or `stamhoofd-migrations/issue-123`.
- Reusing a tag prefix fails if one of the generated image tags already exists. Choose a new `--tag-prefix` for every experimental apply or rerun.
- Full chains can take a long time because every migration starts MySQL and commits an image.
- Full chains can use a lot of disk space because every migration creates a local image.
- Use `--build skip` only after you know the compiled backend and CLI outputs are current.
- Prefer an empty base when you want to validate the full migration history.
- Prefer a dump base when you want to reproduce a real database state.
- Use `yarn stam` for normal command usage. Use `yarn stam-dev` while editing `shared/cli` so the local CLI is rebuilt before it runs.

## Cleanup

Migration chains can create many local images. Cleanup removes only images labelled with `be.stamhoofd.migrations=true` and selected by exact chain id or tag prefix.

```bash
yarn stam migrations cleanup
yarn stam migrations cleanup --chain <chain-id> --dry-run
yarn stam migrations cleanup --tag-prefix stamhoofd-migrations/dev --yes
```

The default terminal flow asks which chains to remove, previews the selected images, and asks for confirmation. Non-interactive destructive cleanup requires `--chain` or `--tag-prefix` together with `--yes`.

## Diff

Schema diff compares two migration images with `mysqldump --no-data`, saves a unified diff, and prints a preview:

```bash
yarn stam migrations diff --from <image> --to <image> --database stamhoofd-development
```

Data diff is intentionally conservative and prints row-count summaries by table:

```bash
yarn stam migrations diff --data --from <image> --to <image> --database stamhoofd-development
```

Diff artifacts are saved in `.stamhoofd/migrations-diffs/` unless `--output` is provided.

## Export

Use `export` to dump SQL from a migration image:

```bash
yarn stam migrations export
yarn stam migrations export --image <image> --all --output .stamhoofd/migrations-exports/export.sql
yarn stam migrations export --image <image> --table members --output members.sql
```

In a terminal, the command asks for a chain, image, whether to export all tables or selected tables, and where to save the SQL file.
