# Nullify

A DNS filtering resolver with a local dashboard. The resolver answers on UDP
`:53`, serves DNS-over-HTTPS on `:443/dns-query`, and exposes a JSON API plus
the web dashboard on one HTTP listener.

## Dashboard

The dashboard is a React app in `web/`. It is built into `ui/dist` and embedded
in the Go binary, so the running server needs no extra files.

```sh
cd web
npm install
npm run build
```

Rebuild after changing anything under `web/src`; `go build` fails without
`ui/dist`.

Start the resolver (root is required to bind ports 53 and 443):

```sh
sudo ./dns-blocker
```

Then open <http://127.0.0.1:8080>.

For UI work with hot reload:

```sh
cd web && npm run dev     # proxies /dashboard/api to 127.0.0.1:8080
```

## Configuration

| Variable      | Default          | Purpose                                   |
| ------------- | ---------------- | ----------------------------------------- |
| `DNS_API_KEY` | required         | Key for the `/api/*` JSON routes           |
| `API_ADDR`    | `127.0.0.1:8080` | Dashboard + API listen address             |
| `RULES_DB`    | `rules.db`       | SQLite file holding manual block/allow rules |

## API

`/api/log`, `/api/stats`, `/api/rules`, `/api/system` require an `X-API-Key`
header. The dashboard calls `/dashboard/api/*` on the same origin so the key
never reaches the browser; that is why the listener binds to loopback by
default. If you set `API_ADDR` to a public interface, put the dashboard behind
something that authenticates access.

Manual rules are stored in SQLite and applied to DNS immediately. Allow rules
take precedence over downloaded blocklists, and manual rules survive the 24h
blocklist reload.
