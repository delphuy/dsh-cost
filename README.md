# dsh-cost

DSH（DeepSeek Harness）费用显示插件：在 Web 界面左侧边栏底部、设置按钮上方常驻显示 DeepSeek 账户余额，悬停查看用量详情。

[English](README.en.md)

## 功能

- **余额标签**：侧边栏底部常驻显示余额
- **悬停浮窗**：余额、今日消耗、总用量（输入/输出/缓存 tokens）、会话数、更新时间，移开自动消失
- **自动刷新**：余额每 5 分钟轮询（可配置），token 用量实时跟踪
- **容错**：余额接口异常时显示 `--` 与错误状态，不影响内核启动

## 数据来源

| 指标 | 来源 |
| --- | --- |
| 账户余额 | DeepSeek 官方 API `GET /user/balance` |
| 今日消耗 | 当日零点余额基准 − 当前余额（充值自动重置基准，不会为负） |
| 总用量 | `session_projcache.json` 会话 tokenUsage 投影（lifetime）+ 在线会话实时覆盖 |
| 会话数 | 历史 + 在线会话去重计数 |

## 安装（Agent 方式）

把本仓库交给 DSH agent，让它执行：

1. 将 `dsh-cost` 目录放入 `~/.dsh/profiles/web/node_modules/dsh-cost/`
2. 编辑 `~/.dsh/profiles/web/package.json`：`dependencies` 增加 `"dsh-cost": "0.1.0"`，`dsh.profile.bundles` 加入 `"dsh-cost"`
3. 若装有旧版余额插件，从上述两处移除，避免出现重复标签
4. 重启 DSH 内核

## 配置

命名空间 `cost-badge`：

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 启用余额轮询 |
| `apiKeyRef` | `DEEPSEEK_API_KEY` | 凭证服务 API Key 引用 |
| `pollMinutes` | `5` | 轮询间隔（分钟） |

## API

`GET /api/cost/state` 返回余额、今日消耗与用量统计（JSON）。

## 文件结构

```
dsh-cost/
├── package.json       # 插件声明（dsh.bundle.patch / dsh.client.inject / exports）
├── cordis.patch.yml   # Cordis 插件注册行
├── lib/
│   ├── index.js       # Host：路由、余额轮询、用量聚合
│   └── client.js      # Browser：React 余额标签 + hover 浮窗
└── README.md
```

## 依赖

运行时：`schemastery`；peer（由内核提供）：`@deepseek-ai/cordis`、dsh-settings、dsh-host-webserver、dsh-credentials、dsh-session、dsh-session-projection、react。
