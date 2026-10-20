# UptimePage

面向 EdgeOne Makers 的监控状态页，支持 Peekaping 和 UptimeRobot。只展示数据，检查和告警由上游负责。

- 多来源、两级分组、独立监控详情。
- 简体中文 / 英文，浏览器语言与时区偏好，深浅色。
- 响应趋势、历史、事件、自动 / 手动刷新。
- 服务端限制公开范围，节点缓存，可选 KV。

## 本地预览

使用 `package.json` 声明的 Node.js 和 pnpm 版本。

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run dev:demo
```

这是演示数据。生产构建使用真实同源接口，不包含演示数据。

## 使用

1. 修改 [config/site.json](config/site.json)，填写分组、来源地址、状态页别名和监控 ID。
2. 按[部署指南](docs/deployment.md)导入 EdgeOne 项目，设置服务端密钥。
3. 部署到预览环境，运行 `pnpm run verify:deployment` 并完成平台检查。

详细说明：[配置](docs/configuration.md) · [开发和测试](docs/development.md) · [数据与接口](docs/data-api.md) · [审查记录](docs/production-review.md)。

当前提供 24 小时详情。Peekaping 历史受状态页最近心跳限制，证书尚未接入；缺失信息显示 `—`。代码已完成本地验证，真实来源与 EdgeOne 平台仍需按部署指南验收。

## 分支与设计

`master` 为完全重写的新版本；`legacy` 保留旧代码与历史。

[需求与架构](docs/superpowers/specs/2026-10-20-uptimepage-foundation-design.md) · [页面规格](docs/superpowers/specs/2026-10-21-uptimepage-ui-design.md) · [设计原型](design/README.md)

许可证：[MPL-2.0](LICENSE)。
