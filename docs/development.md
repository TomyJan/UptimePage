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

EdgeOne 函数从生成的服务端配置读取连接定义，从函数环境变量读取 `apiKeyEnv` 指定的密钥。详情接口当前只接受 `24h`，不将它冒充 `7d` 或 `30d`；证书暂未接入。

- Peekaping 使用状态页接口最近 100 条心跳及来源计算的 24 小时可用率；历史不保证覆盖完整一天，状态页未提供的间隔显示为缺失。
- UptimeRobot 首页请求 30 分钟聚合响应采样和故障日志，列表延迟是最近一组采样的均值。打开详情后才请求单个监控的原始响应采样和日志；保留实际历史缺口，响应采样不当作连续正常区间。实际可获取的历史还受上游套餐限制。
- 节点缓存按配置版本、组与详情路径隔离，只缓存成功结果。新鲜期 30 秒，旧数据最长使用至快照生成后 5 分钟。无关查询参数不产生新缓存键。
- 详情返回前检查公开名单，Peekaping 名单更新失败时拒绝详情请求；UptimeRobot 仍受配置白名单约束。来源失败返回 `unavailable` / `rate-limited`，不会伪装成监控已移除的 404。
- 对浏览器和 CDN 返回 `no-store`，缓存由函数显式管理，避免独立详情缓存绕过名单检查。
- 限流退避时间随错误、旧缓存及部分成功结果传递到页面，自动刷新按该时间推迟。

部署前至少配置 `PEEKAPING_API_KEY` 和 `UPTIMEROBOT_API_KEY`（或配置文件中对应的其他变量名），并将 `config/site.json` 的上游地址、状态页别名和 UptimeRobot 监控 ID 改为真实值。EdgeOne 的函数环境变量应使用服务端密钥配置，不能写入 JSON 或前端环境变量。

## 配置边界

默认读取 `config/site.json`。私有配置可保存为 `*.local.json`，通过 `UPTIMEPAGE_CONFIG` 指定路径。不要在 JSON 中放实际 API Key：连接配置只保存 `apiKeyEnv` 环境变量名，密钥在服务端运行时解析。Peekaping 地址必须为 HTTPS，不能带账号密码、查询参数或片段。

- `cache.kvBinding`（可选）：EdgeOne 项目绑定的 KV 变量名；不配置时只使用节点 Cache。KV 失败会自动降级，不影响实时请求。
- `site`：站点名称、Logo、导航、页脚自定义内容、刷新周期、异常优先初值，在构建时生成静态内容。页脚左侧的 UptimePage、构建短 hash、TomyJan 署名由程序固定生成；`site.footer` 只渲染在右侧。
- `groups`：大分组与子分组各有独立 `id/name/logo`。Peekaping 子组用 `slug`，UptimeRobot 子组用 `monitorIds`；`order` 可指定顺序，`monitors` 可覆盖展示信息。
- 多语言名称支持字符串或 `{ "en": "Services", "zh-CN": "服务" }`，英文必填。`all` 是自动生成的保留子组。
- 生成器输出两个独立文件：`.generated/public-config.ts` 与 `server-config.ts`。浏览器仅导入前者；私有选择规则、连接和环境变量引用不进入静态资源。
- 修改配置需重新构建。浏览器语言、时区、外观、刷新频率属于访客偏好，单独保存在 localStorage；存储不可用时仍可使用。

构建默认读取 Git 的完整提交 ID，页脚仅显示前 7 位，链接指向完整提交。源码归档没有 Git 元数据时显示 `dev` 并链接到项目历史；可用构建环境变量 `UPTIMEPAGE_COMMIT` 指定提交 hash，不接受任意 URL 或文本。

KV 使用 SHA-256 键控制长度，保存带版本和截止时间的响应信封。每个路由在不同配置版本间复用存储槽位，读取时仍核对完整版本；旧部署覆盖只会造成缓存未命中，不会串用数据。EdgeOne KV 没有原生 TTL，超过截止时间的数据不再使用；删除过的分组或详情键可在控制台清理。可选缓存读写最多等待 1 秒，不因存储故障阻断实时来源。

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

当前已完成真实来源请求、响应/事件字段映射、公开范围检查、节点 Cache、可选 KV 和 EdgeOne 只读接口。平台预览和真实来源联调仍属于上线前步骤；本地测试使用上游格式的受控响应，不能替代真实密钥、上游套餐和平台运行时验证。审查记录见[生产审查](production-review.md)。

## 自动检查与依赖更新

`.github/workflows/code-check.yml` 在推送到 `master`、面向 `master` 的 PR 和手动运行时执行：生产依赖安全审计、格式、类型、单元测试、构建、私有配置隔离及浏览器回归。失败或取消时保留浏览器测试结果 7 天。CI 从 `package.json` 读取 Node 与 pnpm 版本，使用冻结锁文件安装。

Dependabot 每日检查 npm / pnpm 依赖，每周检查 GitHub Actions；React 与 React DOM 一起更新。`pnpm-workspace.yaml` 明确采用隔离依赖布局，并为迁移时已锁定的 `lucide-react@1.60.0` 保留精确发布冷却期例外，其余依赖继续使用 pnpm 默认策略。
