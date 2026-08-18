# dsh-cost

> DSH（DeepSeek Harness）费用显示插件 · Cost badge plugin for the DSH web GUI

在 Web 界面左侧边栏底部、**设置按钮上方**常驻显示 DeepSeek 账户余额；鼠标悬停弹出用量详情浮窗，移开后自动消失。

A persistent DeepSeek account-balance label in the sidebar footer of the DSH web GUI — right above the Settings button. Hover to see usage details in a popover; it disappears when you move the mouse away.

## 功能 Features

- **余额标签**：常驻显示在侧边栏底部操作栏（设置按钮上方），始终可见
  **Balance badge** — an always-visible label in the sidebar footer action row, directly above the Settings button
- **悬停浮窗**：显示余额、今日消耗、总用量（输入/输出/缓存 tokens）、会话数、更新时间
  **Hover popover** — balance, today's spend, total tokens (input/output/cache), session count and last-updated time
- **移开消失**：鼠标移出浮窗自动关闭
  **Auto-hide** — the popover closes when the mouse leaves
- **自动刷新**：余额每 5 分钟轮询（可配置），token 用量实时跟踪
  **Auto refresh** — balance polled every 5 minutes (configurable); token usage tracked live
- **容错**：余额接口异常时显示 `--` 与错误状态，不影响内核启动
  **Fail-soft** — on API errors the badge shows `--` and an error state, never breaking kernel boot

## 数据来源 Data sources

| 指标 Metric | 来源 Source |
| --- | --- |
| 账户余额 Balance | DeepSeek 官方 API `GET https://api.deepseek.com/user/balance` |
| 今日消耗 Today's spend | 当日零点余额基准 − 当前余额（充值自动重置基准，不会出现负数）<br>balance baseline at local midnight − current balance (top-ups reset the baseline, never negative) |
| 总用量 Total tokens | `~/.dsh/storages/session_projcache.json` 全部会话 `tokenUsage` 投影（lifetime）+ 在线会话实时覆盖<br>persisted projection cache across all sessions + live overrides for open sessions |
| 会话数 Session count | 历史会话 + 在线会话去重计数<br>historical + live sessions, deduplicated |

## 安装 Installation（Agent 方式 · no npm publish）

本插件不发布到 npm（无 scope）。推荐把本仓库交给 DSH agent，让它按以下步骤安装：

> 对 agent 说：**"安装 dsh-cost 插件，仓库在 <本仓库路径>"**，或让它执行下面的步骤。

1. 将 `dsh-cost` 包目录放入 profile 的 `node_modules`：
   `~/.dsh/profiles/web/node_modules/dsh-cost/`
2. 编辑 `~/.dsh/profiles/web/package.json`：
   - `dependencies` 增加：`"dsh-cost": "0.1.0"`
   - `dsh.profile.bundles` 列表加入：`"dsh-cost"`
3. 若之前装过旧版 `@linxin666/dsh-cost-badge`，请从 `dependencies` 与 `bundles` 中移除，避免同时出现两个余额标签。
4. 重启 DSH 内核（桌面版退出重开；源码版重启 `pnpm dsh web`）。

手动安装即按上述步骤自行执行。

## 配置 Configuration

在 DSH 设置界面的 `cost-badge` 命名空间下可配置：

| 配置项 Option | 默认值 Default | 说明 Description |
| --- | --- | --- |
| `enabled` | `true` | 是否启用余额轮询 Enable balance polling |
| `apiKeyRef` | `DEEPSEEK_API_KEY` | 凭证服务中的 API Key 引用名 Credentials-service API key reference |
| `pollMinutes` | `5` | 余额轮询间隔（分钟）Poll interval in minutes |

## API

插件注册了同源 HTTP 路由 `GET /api/cost/state`，返回：

```json
{
  "ok": true,
  "balance": 93.33,
  "balanceCurrency": "CNY",
  "balanceAt": 1787049688061,
  "balanceError": null,
  "todaySpend": 1.83,
  "dayDate": "2026-08-18",
  "totals": {
    "inputTokens": 5225503,
    "outputTokens": 513441,
    "cacheReadTokens": 78152320,
    "cacheWriteTokens": 0,
    "sessions": 5
  }
}
```

## 技术架构 Architecture

```
┌─ Host (lib/index.js) ─────────────────────────────────┐
│  • 注册 HTTP 路由 /api/cost/state                       │
│  • 定时轮询 DeepSeek 余额 API                           │
│  • 合并 projcache (lifetime) + live sessions (realtime) │
│  • 状态持久化到 ~/.dsh/cost-badge.json                  │
└────────────────────────────────────────────────────────┘
         │ HTTP (same-origin)
         ▼
┌─ Client (lib/client.js) ───────────────────────────────┐
│  • 注入 sidebar.footer.action slot（设置按钮上方）        │
│  • 30s 轮询 /api/cost/state                             │
│  • React 组件：余额标签 + hover popover                  │
└────────────────────────────────────────────────────────┘
```

## 文件结构 File structure

```
dsh-cost/
├── package.json       # 插件声明（dsh.bundle.patch / dsh.client.inject / exports）
├── cordis.patch.yml   # Cordis 插件注册行（insert id: cost-badge）
├── lib/
│   ├── index.js       # Host 半：路由、余额轮询、用量聚合
│   └── client.js      # Browser 半：React 组件、slot 注入
└── README.md          # 本文件
```

## 依赖 Dependencies

运行时依赖：`schemastery`。Peer dependencies（由 DSH 内核提供）：`@deepseek-ai/cordis`、`dsh-settings`、`dsh-host-webserver`、`dsh-credentials`、`dsh-session`、`dsh-session-projection`、`react`。

## 容错 Fault tolerance

所有外部调用均有 try-catch 保护：

- 余额 API 不可用 → 记录 `balanceError`，标签显示 `--`，浮窗显示错误原因
- projcache 文件损坏/缺失 → 回退为仅实时会话数据
- token-meter 投影缺失 → totals 保持为 0，不崩溃
- 凭证服务无 API Key → 记录 `no-api-key` 错误
