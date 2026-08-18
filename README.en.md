# dsh-cost

A cost badge plugin for the DSH (DeepSeek Harness) web GUI: a persistent DeepSeek account-balance label in the sidebar footer, right above the Settings button, with a hover popover for usage details.

[中文](README.md)

## Features

- **Balance label**: always visible in the sidebar footer, next to the Settings button
- **Hover popover**: balance, today's spend, total tokens (input/output/cache), session count, last update; auto-hides on mouse leave
- **Auto refresh**: balance polled every 5 minutes (configurable); token usage tracked live
- **Fail-soft**: shows `--` and an error state when the balance API fails; never breaks kernel boot

![](https://gitee.com/delphuy/image/raw/main/2026/08/18/1787053717320-a838a268-739d-4304-bc4c-b3831aae0873.png)

![](https://gitee.com/delphuy/image/raw/main/2026/08/18/1787053782310-1f5f792c-3486-4e93-b15d-a526a2508884.png)

## Data sources

| Metric | Source |
| --- | --- |
| Balance | DeepSeek official API `GET /user/balance` |
| Today's spend | midnight baseline − current balance (top-ups reset the baseline, never negative) |
| Total tokens | `session_projcache.json` session tokenUsage projections (lifetime) + live overrides for open sessions |
| Sessions | historical + live, deduplicated |

## Install

Copy the following to your DSH agent:

```
帮我从 https://github.com/delphuy/dsh-cost.git 下载 dsh-cost 插件并安装
```
