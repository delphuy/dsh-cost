# dsh-cost

DSH（DeepSeek Harness）费用显示插件：在 Web 界面左侧边栏底部、设置按钮上方常驻显示 DeepSeek 账户余额，悬停查看用量详情。

[English](README.en.md)

## 功能

- **余额标签**：侧边栏底部常驻显示余额
- **悬停浮窗**：余额、今日消耗、总用量（输入/输出/缓存 tokens）、会话数、更新时间，移开自动消失
- **自动刷新**：余额每 5 分钟轮询（可配置），token 用量实时跟踪
- **容错**：余额接口异常时显示 `--` 与错误状态，不影响内核启动

![](https://gitee.com/delphuy/image/raw/main/2026/08/18/1787053717320-a838a268-739d-4304-bc4c-b3831aae0873.png)

![](https://gitee.com/delphuy/image/raw/main/2026/08/18/1787053689546-c7ef8d3c-58e2-4f33-9cde-cfcbbe731d9b.png)

## 数据来源

| 指标 | 来源 |
| --- | --- |
| 账户余额 | DeepSeek 官方 API `GET /user/balance` |
| 今日消耗 | 当日零点余额基准 − 当前余额（充值自动重置基准，不会为负） |
| 总用量 | `session_projcache.json` 会话 tokenUsage 投影（lifetime）+ 在线会话实时覆盖 |
| 会话数 | 历史 + 在线会话去重计数 |

## 安装

将如下的内容，复制给 dsh 即可：

```
帮我从 https://github.com/delphuy/dsh-cost.git 下载 dsh-cost 插件并安装
```
