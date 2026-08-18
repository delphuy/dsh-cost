# dsh-cost

A cost badge plugin for the DSH (DeepSeek Harness) web GUI: a persistent DeepSeek account-balance label in the sidebar footer, right above the Settings button, with a hover popover for usage details.

[中文](README.md)

## Features

- **Balance label**: always visible in the sidebar footer, next to the Settings button
- **Hover popover**: balance, today's spend, total tokens (input/output/cache), session count, last update; auto-hides on mouse leave
- **Auto refresh**: balance polled every 5 minutes (configurable); token usage tracked live
- **Fail-soft**: shows `--` and an error state when the balance API fails; never breaks kernel boot

## Data sources

| Metric | Source |
| --- | --- |
| Balance | DeepSeek official API `GET /user/balance` |
| Today's spend | midnight baseline − current balance (top-ups reset the baseline, never negative) |
| Total tokens | `session_projcache.json` session tokenUsage projections (lifetime) + live overrides for open sessions |
| Sessions | historical + live, deduplicated |

## Install (agent)

Hand this repo to a DSH agent and ask it to:

1. Copy the `dsh-cost` package into `~/.dsh/profiles/web/node_modules/dsh-cost/`
2. Edit `~/.dsh/profiles/web/package.json`: add `"dsh-cost": "0.1.0"` to `dependencies` and `"dsh-cost"` to `dsh.profile.bundles`
3. Remove any older balance-badge plugin from both lists to avoid duplicate labels
4. Restart the DSH kernel

## Configuration

Namespace `cost-badge`:

| Option | Default | Description |
| --- | --- | --- |
| `enabled` | `true` | enable balance polling |
| `apiKeyRef` | `DEEPSEEK_API_KEY` | credentials-service API key reference |
| `pollMinutes` | `5` | poll interval (minutes) |

## API

`GET /api/cost/state` returns balance, today's spend and token totals (JSON).

## Layout

```
dsh-cost/
├── package.json       # plugin declaration (dsh.bundle.patch / dsh.client.inject / exports)
├── cordis.patch.yml   # Cordis plugin registration
├── lib/
│   ├── index.js       # Host: route, balance polling, usage aggregation
│   └── client.js      # Browser: React badge + hover popover
└── README.md
```

## Dependencies

Runtime: `schemastery`. Peer (provided by the kernel): `@deepseek-ai/cordis`, dsh-settings, dsh-host-webserver, dsh-credentials, dsh-session, dsh-session-projection, react.
