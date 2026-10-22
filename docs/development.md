# 开发与测试

## 本地运行

使用 `package.json` 声明的 Node.js 和 pnpm 版本；首次使用可运行 `corepack enable`。

```sh
pnpm install --frozen-lockfile
pnpm run dev:demo
```

| 场景         | 运行方式                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| 页面演示     | `pnpm run dev:demo`；模拟数据随当前时间移动                                                                    |
| 配置编辑器   | 在终端设置 `UPTIMEPAGE_CONFIG_EDITOR=true`，运行 `pnpm run dev`，访问 `http://127.0.0.1:5173/?configeditor=on` |
| 真实数据联调 | 部署到 [EO 预览环境](deployment.md)；`pnpm run dev` 不启动 EdgeOne 函数                                        |
| 静态产物预览 | `pnpm run build` 后运行 `pnpm run preview`；同样不提供云函数                                                   |

演示参数：`?demoCount=200` 检查大列表，`?demoPartial=1` 检查部分失败。演示入口仅在开发环境可用，生产包不包含演示数据。

编辑器使用独立的配置、模拟客户端和查询缓存，复用正式页面；退出恢复生产客户端。开关及使用方式见[配置编辑器](configuration.md#可视化编辑器)。

## 验证

```sh
pnpm run format:check
pnpm test
pnpm run build
pnpm run verify:public-build
pnpm exec playwright install chromium
pnpm run test:e2e
pnpm run test:editor
pnpm audit --prod --audit-level=high --registry=https://registry.npmjs.org
```

- `build` 包含配置生成和类型检查；仅检查类型可用 `pnpm run typecheck`。`pnpm run format` 同时格式化代码和文档。
- `verify:public-build` 分别构建关闭 / 开启编辑器的产物，检查默认包无编辑器、两种包均不泄露实际服务端配置。
- `test:e2e` 验证演示页面和默认生产包，运行前清除终端中的编辑器开关；`test:editor` 自行启用编辑器，检查完整编辑流程、零生产监控请求和退出隔离。
- Linux 安装 Chromium 时加 `--with-deps`；已有 Chromium 可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定。截图和失败 trace 在 `test-results/`。

测试端口为 5173（演示）、4173（生产静态预览）、5174（编辑器）。测试前释放这些端口，避免复用其他开发服务。

生成、构建、产物检查和浏览器测试共用 `.generated/`，须顺序运行。单元 / 浏览器测试固定使用 `config/default.json`，结束时恢复生成配置；强制结束进程后先执行 `pnpm run generate`。浏览器测试会重建 `dist/`，发布前重新运行 `pnpm run build`。

真实部署验收使用 `UPTIMEPAGE_PREVIEW_URL`，见[部署验证](deployment.md#部署验证)。CI 不访问真实来源。

## 维护入口

| 路径                                                              | 职责                                          |
| ----------------------------------------------------------------- | --------------------------------------------- |
| `src/features/`、`src/components/`                                | 页面、交互和共用组件                          |
| `src/features/editor/`                                            | 可选编辑器、内存草稿和 mock                   |
| `src/shared/`                                                     | 前后端契约与响应校验                          |
| `src/server/`                                                     | 来源适配、公开范围、缓存和脱敏诊断            |
| `cloud-functions/api/v1/[[default]].ts`                           | 云函数 API 入口                               |
| `edge-functions/_uptimepage/cache.ts`                             | 签名缓存桥、节点缓存和 KV                     |
| `config/schema.ts`、`scripts/build-config.ts`                     | 配置校验、公私拆分和构建元数据                |
| `tests/unit/`、`tests/e2e/`、`tests/editor/`、`tests/deployment/` | 单元 / 集成、本地浏览器、编辑器和真实部署验收 |

浏览器只导入 `.generated/public-config.ts`；`.generated/server-config.ts` 仅用于函数。生成物、密钥、`.env`、`*.local.json` 不提交；部署配置使用 `config/site.json`。

新增异步内容应沿用 `MonitorCard` / `MonitorLayout` 及 `AnimatedHeight`，使加载与正常态保留同一布局容器，并遵循减少动画偏好。新增来源或调整缓存时同步[数据契约](data-api.md)，尤其是公开范围、时间口径和故障回退。

界面样式集中在 `src/styles/`，编辑器样式在 `src/features/editor/editor.css`。统一使用自托管 MiSans 和 `tabular-nums`；字体样式地址位于 `index.html`。新增组件沿用现有颜色、字体与动效变量，兼容 320 px 窄屏、键盘操作和深浅色。

监控状态与取数状态分别处理；请求失败不改写监控状态或成功更新时间。缺失数据使用 `null`，不能用零值、当前状态或模拟采样补齐；公开范围必须由服务端检查，详情缓存不能绕过授权。

CI 在 `master` 推送、PR 和手动触发时执行格式、类型、单测、构建隔离、浏览器回归和依赖审计；失败产物保留 7 天。Dependabot 每日检查 pnpm 依赖、每周检查 Actions，React / React DOM 成组更新。配置见 `.github/`。
