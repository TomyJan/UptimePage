# 本地开发

需要 Node.js ≥22.12，推荐 22.21.0。使用 npm 和已提交的锁文件。

```sh
npm ci
npm run dev:demo
```

打开终端输出的本地地址。演示模式只在开发服务器启用，数据是固定样例，包含故障、过期、缺失能力和历史缺口。可用 `?demoCount=200` 检查大列表，`?demoPartial=1` 检查部分失败；这些参数不进入生产实现。

`npm run dev` 和生产构建使用同源 API。当前阶段还没有边缘函数，页面会显示获取失败；SPA fallback 返回 HTML 也视为无效数据，不会回退到演示数据。

## 配置边界

默认读取 `config/site.json`。私有配置可保存为 `*.local.json`，通过 `UPTIMEPAGE_CONFIG` 指定路径。不要在 JSON 中放实际 API Key：连接配置只保存 `apiKeyEnv` 环境变量名，密钥在下一阶段的服务端运行时解析。

- `site`：站点名称、Logo、导航、页脚、刷新周期、异常优先初值，在构建时生成静态内容。
- `groups`：大分组与子分组各有独立 `id/name/logo`。Peekaping 子组用 `slug`，UptimeRobot 子组用 `monitorIds`；`order` 可指定顺序，`monitors` 可覆盖展示信息。
- 多语言名称支持字符串或 `{ "en": "Services", "zh-CN": "服务" }`，英文必填。`all` 是自动生成的保留子组。
- 生成器输出两个独立文件：`.generated/public-config.ts` 与 `server-config.ts`。浏览器仅导入前者；私有选择规则、连接和环境变量引用不进入静态资源。
- 修改配置需重新构建。浏览器语言、时区、外观、刷新频率属于访客偏好，单独保存在 localStorage；存储不可用时仍可使用。

公开 API 契约见 `src/shared/contracts.ts`。`null` 表示缺失；`0` 是有效数值。时间统一使用 UTC ISO 8601，页面按访客时区格式化。来源标签 `sourceName` 是可选的公开展示字段，不包含上游连接地址。

## 验证

```sh
npm run test
npm run typecheck
npm run build
npm run verify:public-build
npm run test:e2e
npm run format:check
```

首次运行浏览器测试：`npx playwright install chromium`。默认使用 Playwright 自带浏览器，可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定已有 Chromium。测试会自动启动开发演示服务器与生产预览服务器，分别使用 5173、4173 端口；不要让其他服务器占用这些端口。生产预览测试通过受控 HTTP 响应验证首次限流、刷新失败和 HTML fallback。

构建隔离检查使用独立临时配置和输出目录，并在 finally 中恢复生成文件，不覆盖用户私密文件。即使设置 `VITE_DEMO=true`，生产包也不包含演示数据。视觉验收截图保存在 `test-results/`，覆盖首页、详情、中英文、深浅色、桌面和手机。

## EdgeOne 与后续阶段

`edgeone.json` 配置静态产物和 SPA fallback。构建命令显式引导 Node 22.21.0，避免平台文档中的旧版 Node 不满足工具要求。本地引导成功不代表平台网络、安装权限或运行时已经验证。

当前完成前端与构建边界。真实 Peekaping / UptimeRobot 适配、公开名单检查、缓存、可选 KV、平台预览和部署属于后续阶段。当前代码不应作为已经接好真实来源的成品上线。
