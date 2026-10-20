# UptimePage

面向 EdgeOne Makers 的多来源监控状态展示页。

项目正在完全重写，目前完成需求与基础架构设计，并提供可点击的 UI 探索原型，尚无可运行的正式新版本。

## 设计

- [需求与基础架构](docs/superpowers/specs/2026-10-20-uptimepage-foundation-design.md)
- [UI 设计方向与交互原型](design/README.md)
- 技术栈：React、Vite、TypeScript、Tailwind CSS、EdgeOne 边缘函数。
- 数据来源：Peekaping、UptimeRobot。
- 本站只负责展示，上游负责监控检查和告警。
- JSON 配置在构建时拆分为公开内容和服务端配置；实际密钥放服务端环境变量。
- KV 仅作为可选短期缓存，不保存长期历史。

当前阶段为 UI/UX 设计，选定方向后再细化页面规格、制定实施计划。

## 分支

- `master`：从空历史开始的新版本，仅包含重写阶段的文件。
- `legacy`：保留旧版本代码和完整历史，不作为新版本的技术实现依据。

## 本地私密配置

不要提交真实 API Key、环境变量文件或私有本地配置。后续可提交使用占位值的 `.env.example`。
