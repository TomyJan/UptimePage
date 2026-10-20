# 本地开发

使用 Node.js 22 LTS（≥22.18）和 pnpm。版本分别声明在 `package.json` 的 `engines.node` 和 `packageManager`，依赖由 `pnpm-lock.yaml` 锁定。若本机尚未启用 pnpm，可先运行 `corepack enable`，由 Corepack 读取项目声明的版本。

```sh
pnpm install --frozen-lockfile
pnpm run dev:demo
```

打开终端输出的本地地址。演示模式只在开发服务器启用，数据是固定样例，包含故障、过期、缺失能力和历史缺口。可用 `?demoCount=200` 检查大列表，`?demoPartial=1` 检查部分失败；这些参数不进入生产实现。

`pnpm run dev` 和生产构建使用同源 API。Vite 开发服务器不启动 EdgeOne 函数，直接访问真实接口时会显示获取失败；SPA fallback 返回 HTML 也视为无效数据，不会回退到演示数据。

生产接口已放在 `edge-functions/api/v1/[[default]].ts`，提供只读的组快照和监控详情：

- `GET /api/v1/groups/:groupId`
- `GET /api/v1/groups/:groupId/monitors/:monitorId?range=24h`

EdgeOne 函数从生成的服务端配置读取连接定义，从函数环境变量读取 `apiKeyEnv` 指定的密钥。详情接口当前统一提供 24 小时范围：Peekaping 使用状态页心跳，UptimeRobot 请求响应时间采样和故障日志；证书及来源未提供的范围会明确标记，不填充模拟值。Edge Cache 按配置版本、路径和查询参数隔离，来源失败时有旧缓存才返回 `stale` 数据。

部署前至少配置 `PEEKAPING_API_KEY` 和 `UPTIMEROBOT_API_KEY`（或配置文件中对应的其他变量名），并将 `config/site.json` 的上游地址、状态页别名和 UptimeRobot 监控 ID 改为真实值。EdgeOne 的函数环境变量应使用服务端密钥配置，不能写入 JSON 或前端环境变量。

## 配置边界

默认读取 `config/site.json`。私有配置可保存为 `*.local.json`，通过 `UPTIMEPAGE_CONFIG` 指定路径。不要在 JSON 中放实际 API Key：连接配置只保存 `apiKeyEnv` 环境变量名，密钥在下一阶段的服务端运行时解析。

- `cache.kvBinding`（可选）：EdgeOne 项目绑定的 KV 变量名；不配置时只使用节点 Cache。KV 失败会自动降级，不影响实时请求。
- `site`：站点名称、Logo、导航、页脚自定义内容、刷新周期、异常优先初值，在构建时生成静态内容。页脚左侧的 UptimePage、构建短 hash、TomyJan 署名由程序固定生成；`site.footer` 只渲染在右侧。
- `groups`：大分组与子分组各有独立 `id/name/logo`。Peekaping 子组用 `slug`，UptimeRobot 子组用 `monitorIds`；`order` 可指定顺序，`monitors` 可覆盖展示信息。
- 多语言名称支持字符串或 `{ "en": "Services", "zh-CN": "服务" }`，英文必填。`all` 是自动生成的保留子组。
- 生成器输出两个独立文件：`.generated/public-config.ts` 与 `server-config.ts`。浏览器仅导入前者；私有选择规则、连接和环境变量引用不进入静态资源。
- 修改配置需重新构建。浏览器语言、时区、外观、刷新频率属于访客偏好，单独保存在 localStorage；存储不可用时仍可使用。

公开 API 契约见 `src/shared/contracts.ts`。`null` 表示缺失；`0` 是有效数值。时间统一使用 UTC ISO 8601，页面按访客时区格式化。来源标签 `sourceName` 是可选的公开展示字段，不包含上游连接地址。

## 验证

```sh
pnpm run generate
pnpm test
pnpm run typecheck
pnpm run build
pnpm run verify:public-build
pnpm run test:e2e
pnpm run format:check
```

首次运行浏览器测试：`pnpm exec playwright install chromium`。默认使用 Playwright 自带浏览器，可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定已有 Chromium。测试会自动启动开发演示服务器与生产预览服务器，分别使用 5173、4173 端口；不要让其他服务器占用这些端口。生产预览测试通过受控 HTTP 响应验证首次限流、刷新失败和 HTML fallback。

构建隔离检查使用独立临时配置和输出目录，并在 finally 中恢复生成文件，不覆盖用户私密文件。即使设置 `VITE_DEMO=true`，生产包也不包含演示数据。视觉验收截图保存在 `test-results/`，覆盖首页、详情、中英文、深浅色、桌面和手机。

## EdgeOne 与后续阶段

`edgeone.json` 通过 `nodeVersion` 选择 Node 22.21.1，并配置静态产物与 SPA fallback。安装、构建命令仅执行 pnpm，不在命令中指定版本。pnpm 版本由 `package.json` 的 `packageManager` 决定；平台版本支持见 [EdgeOne 构建指南](https://pages.edgeone.ai/document/build-guide)。本地通过不代表平台网络或运行时已经验证。

当前已完成真实来源请求、响应/事件字段映射、公开范围检查、基础 Edge Cache 和 EdgeOne 只读接口；可选 KV、平台预览和部署验证仍属于上线前步骤。当前代码不应在未配置真实来源和未完成 EdgeOne 预览验证前直接上线。

## 自动检查与依赖更新

`.github/workflows/code-check.yml` 在推送到 `master`、面向 `master` 的 PR 和手动运行时执行：生产依赖安全审计、格式、类型、单元测试、构建、私有配置隔离及浏览器回归。失败或取消时保留浏览器测试结果 7 天。CI 从 `package.json` 读取 Node 与 pnpm 版本，使用冻结锁文件安装。

Dependabot 每日检查 npm / pnpm 依赖，每周检查 GitHub Actions；React 与 React DOM 一起更新。`pnpm-workspace.yaml` 明确采用隔离依赖布局，并为迁移时已锁定的 `lucide-react@1.60.0` 保留精确发布冷却期例外，其余依赖继续使用 pnpm 默认策略。
