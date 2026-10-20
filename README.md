# UptimePage

面向 EdgeOne Makers 的多来源监控状态展示页。

第一阶段正式前端已实现：多分组首页、监控详情、中英文、深浅色、刷新及完整交互。可在本地运行演示；真实来源适配、缓存 / KV 和 EdgeOne 平台验证将在第二阶段完成。

## 设计

- [需求与基础架构](docs/superpowers/specs/2026-10-20-uptimepage-foundation-design.md)
- [UI 设计方向与交互原型](design/README.md)
- [已确认的页面设计](docs/superpowers/specs/2026-10-21-uptimepage-ui-design.md)
- [第一阶段实现计划](docs/superpowers/plans/2026-10-21-uptimepage-frontend.md)：正式前端、配置隔离与交互还原。
- 技术栈：React、Vite、TypeScript、Tailwind CSS、EdgeOne 边缘函数。
- 数据来源：Peekaping、UptimeRobot。
- 本站只负责展示，上游负责监控检查和告警。
- JSON 配置在构建时拆分为公开内容和服务端配置；实际密钥放服务端环境变量。
- KV 仅作为可选短期缓存，不保存长期历史。

本地预览：`npm ci` 后运行 `npm run dev:demo`。配置、验证和能力边界见[开发说明](docs/development.md)。

## 分支

- `master`：从空历史开始的新版本，仅包含重写阶段的文件。
- `legacy`：保留旧版本代码和完整历史，不作为新版本的技术实现依据。

## 本地私密配置

不要提交真实 API Key、环境变量文件或私有本地配置。后续可提交使用占位值的 `.env.example`。
