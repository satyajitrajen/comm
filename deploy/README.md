# TeamTime Communication — deployment

Production on this VM is a **hybrid** layout:

| Piece | How it runs |
|--------|-------------|
| Backend | Docker `teamtime-backend` (`docker compose`) |
| Frontend | Host systemd `teamtime-frontend` on `:3000` |
| Edge | **Host** nginx → `:3000` / `:5000` |
| Database | `/var/lib/teamtime/dev.db` (bind-mounted) |
| Uploads | `/var/lib/teamtime/uploads` → `/app/uploads` (**required**) |
| Secrets | `backend/.env` (never commit) |

## Deploy (safe — use this)

```bash
cd /home/azureadmin/communication
chmod +x scripts/deploy-prod.sh
./scripts/deploy-prod.sh
```

What it does:

1. `git fetch` + fast-forward to `origin/main` (unless `--skip-pull`)
2. Refuses to proceed if the uploads volume mount is missing
3. `prisma migrate deploy` against the live DB
4. Rebuilds **only** the backend container (`--no-deps` — does not touch host nginx)
5. Builds frontend and restarts `teamtime-frontend`
6. Smoke-checks health + `/login`

Flags:

- `--skip-pull` — deploy current working tree only
- `--skip-migrate` — skip Prisma migrate

## CI (GitHub Actions)

Workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)

- Runs on every PR and push to `main`
- Builds backend (Nest + Prisma generate) and frontend (Next.js)
- Does **not** deploy; CD is the VM script above (or a self-hosted runner calling it)

### Wire CD later (optional)

1. Install a [self-hosted runner](https://docs.github.com/en/actions/hosting-your-own-runners) on this VM
2. Add a workflow `deploy.yml` on `push` to `main` that runs `./scripts/deploy-prod.sh`
3. Grant the runner passwordless sudo for `docker` and `systemctl restart teamtime-frontend`

## Do not use for this host

- `scripts/deploy-docker.sh` — stops **host** nginx and brings up compose nginx; wrong for the current hybrid setup
- Recreating backend **without** `/var/lib/teamtime/uploads:/app/uploads` — wipes LOCAL files

## Rollback

```bash
cd /home/azureadmin/communication
git log --oneline -5
git checkout <good-sha> -- backend frontend
./scripts/deploy-prod.sh --skip-pull
```

Or restore DB from `/home/azureadmin/downloads/teamtime-*.db` if a migration went bad (stop backend first).

## nginx configs

| File | Use |
|------|-----|
| Host `/etc/nginx/conf.d/project.conf` | **Live** — `127.0.0.1:3000` / `:5000` |
| `nginx/conf.d/project.docker.conf` | Compose nginx only (not used while host nginx owns 80/443) |
