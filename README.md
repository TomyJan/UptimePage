# UptimePage

面向 EdgeOne Makers 的公开监控状态页，支持 Peekaping 和 UptimeRobot。本站负责展示，上游负责检查和告警。

- 多来源、两级分组、独立监控详情。
- 简体中文 / 英文、时区、深浅色、自动 / 手动刷新。
- 状态历史、响应曲线、可用率和事件；节点缓存，可选 KV。

## 部署

1. 复制 [config/default.json](config/default.json) 为 `config/site.json`，填写实际配置，提交并推送。
2. 在 EdgeOne Makers 导入仓库，在项目环境变量中设置来源 API Key。
3. 重新部署并检查真实数据。构建设置已写在 `edgeone.json`，使用 `site.json` 无需额外设置配置路径。

完整步骤见[部署指南](docs/deployment.md)，字段见[配置说明](docs/configuration.md)。没有 `site.json` 时会回退默认配置；默认地址和监控 ID 是占位值，不能直接用于生产。API Key 不写进 JSON。

详情支持 24 小时、7 天、30 天；Peekaping 使用鉴权统计接口，UptimeRobot 历史受套餐限制。证书未接入。缺失数据显示 `—`，不补造历史。上线验收进度见[验证状态](docs/production-review.md)。

## 本地演示

使用 `package.json` 声明的 Node.js 和 pnpm 版本：

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run dev:demo
```

演示使用模拟数据；生产构建调用本站 API，不包含演示代码。

## 文档

[开发与测试](docs/development.md) · [数据与接口](docs/data-api.md) · [需求与架构](docs/superpowers/specs/2026-10-20-uptimepage-foundation-design.md) · [页面规格与原型](design/README.md)

`master` 是重写版本，`legacy` 保留旧实现。许可证：[MPL-2.0](LICENSE)。
