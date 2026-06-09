# Deployment

LifeRL is designed as a central server that all devices access. For phone and
laptop sync, run one FastAPI/Next instance and connect devices to that server.

## Local Development

```sh
bun install
python3 -m pip install -r requirements.txt
bun run dev
```

Open:

```txt
http://localhost:5173
```

FastAPI runs on:

```txt
http://localhost:5174
```

## Environment

Common variables:

```sh
HOST=0.0.0.0
PORT=5173
LIFERL_API_PORT=5174
API_INTERNAL_URL=http://127.0.0.1:5174
NEXT_PUBLIC_API_BASE_URL=
LIFERL_DB_PATH=/srv/liferl/liferl.db
LIFERL_RECORDS_PATH=/srv/liferl/liferl.md
```

`API_INTERNAL_URL` is used by Next rewrites. `NEXT_PUBLIC_API_BASE_URL` should
usually stay empty when the browser talks to the same origin and Next proxies
`/api/*`.

For a separate API origin, set `NEXT_PUBLIC_API_BASE_URL` and configure
`LIFERL_CORS_ORIGINS` on the backend.

## Service CLI

Create or update config:

```sh
bun run service setup --db /srv/liferl/liferl.db --records /srv/liferl/liferl.md --host 0.0.0.0 --port 5173 --api-port 5174 --yes
```

Run foreground production server:

```sh
bun run service run
```

Run in background:

```sh
bun run service:start
bun run service:status
bun run service:logs
bun run service:stop
```

## systemd User Service

Install and start:

```sh
bun run service:systemd:install
```

Inspect the generated unit first:

```sh
bun run service:systemd:print
```

Remove:

```sh
bun run service:systemd:uninstall
```

## VPS With Tailscale

Recommended deployment is a private VPS behind Tailscale.

```sh
git clone https://github.com/joey00072/liferl.git
cd liferl
bun install
python3 -m pip install -r requirements.txt
bun run service setup --db /srv/liferl/liferl.db --records /srv/liferl/liferl.md --host 0.0.0.0 --port 5173 --api-port 5174 --yes
bun run service:systemd:install
```

Open from devices:

```txt
http://<vps-tailscale-name>:5173
```

Keep the public firewall closed for ports `5173` and `5174`. Expose the app only
over Tailscale or another trusted private network.

## PWA Install

Desktop:

1. Open the app URL.
2. Use the browser install action in the address bar.

Phone:

1. Open the app URL in the mobile browser.
2. Use Add to Home Screen.

The installed PWA still talks to the central server URL.

## Operational Checks

Health:

```sh
curl http://127.0.0.1:5174/api/health
```

State:

```sh
curl "http://127.0.0.1:5174/api/state?date=2026-06-06"
```

Logs:

```sh
bun run service:logs
```

## Upgrades

Before upgrading:

1. Stop the service.
2. Back up `.liferl/liferl.db`.
3. Back up `liferl.md`.
4. Pull changes and reinstall dependencies if needed.
5. Run `bun run build`.
6. Start the service.

Current SQLite schema migrations are simple and versioned by `schema_meta`.
During active development, incompatible schema changes may recreate app tables,
so keep backups before pulling major storage changes.
