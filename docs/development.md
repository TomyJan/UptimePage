# 开发与测试

使用 `package.json` 声明的 Node.js 和 pnpm 版本。首次使用可运行 `corepack enable`。

```sh
pnpm install --frozen-lockfile
pnpm run dev:demo
```

演示数据随当前时间移动；`?demoCount=200` 检查大列表，`?demoPartial=1` 检查部分失败。生产包不包含演示入口。

`pnpm run dev` 使用真实同源 API，但 Vite 不启动 EdgeOne 函数；接口不存在时显示获取失败。真实数据联调在 [EO 预览环境](deployment.md)进行。

## 验证命令

```sh
pnpm run format:check
pnpm test
pnpm run build
pnpm run verify:public-build
pnpm run test:e2e
pnpm audit --prod --audit-level=high --registry=https://registry.npmjs.org
```

`build` 已包含类型检查；仅检查类型可用 `pnpm run typecheck`。格式化使用 `pnpm run format`。

首次浏览器测试前运行 `pnpm exec playwright install chromium`；Linux CI 使用 `pnpm exec playwright install --with-deps chromium`。已有 Chromium 可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定。

测试使用 5173（开发演示）和 4173（生产静态预览），应保持端口可用；截图及失败 trace 位于 `test-results/`。生成、构建、产物隔离和浏览器测试共用 `.generated/`，请顺序执行，测试期间不要修改源码或配置。

单元和浏览器测试固定使用 `config/default.json`，不依赖实际站点的分组名；结束后恢复原生成配置，测试失败也会恢复。生产构建仍按[配置优先级](configuration.md#配置文件)读取实际配置。浏览器测试会构建演示测试所需的静态产物，发布前运行 `pnpm run build` 生成实际站点产物。

正常取消测试会先结束子进程、还原配置；强制结束进程或断电无法保证恢复，之后先运行 `pnpm run generate`。

## 代码入口

| 路径                                          | 职责                        |
| --------------------------------------------- | --------------------------- |
| `src/features/`                               | 页面和交互                  |
| `src/shared/`                                 | 前后端契约与响应校验        |
| `src/server/`                                 | 来源适配、公开范围、缓存    |
| `cloud-functions/api/v1/[[default]].ts`        | EO 云函数 API 入口          |
| `edge-functions/_uptimepage/cache.ts`        | 签名缓存桥、节点缓存与 KV  |
| `config/schema.ts`、`scripts/build-config.ts` | 配置校验与公私拆分          |
| `scripts/verify-deployment.ts`                | HTTP 部署验收               |
| `tests/unit/`、`tests/e2e/`                   | 单元 / 集成测试、浏览器回归 |

浏览器只能导入 `.generated/public-config.ts`；服务端配置在 `.generated/server-config.ts`。不要提交生成物、密钥、`.env` 或 `*.local.json`；实际部署配置使用可提交的 `config/site.json`。

加载态与正常态共用 `MonitorCard` / `MonitorLayout`，切换内容时保留卡片和 `AnimatedHeight` 容器。新增异步内容也应放入同一容器内，避免整体替换导致高度跳变；减少动画偏好会关闭过渡。分组数量仅观察已有查询缓存，不预取未访问分组。

CI 在 `master` 推送、PR 和手动触发时执行上述检查，浏览器失败产物保留 7 天。Dependabot 每日检查 pnpm 依赖、每周检查 Actions；React / React DOM 成组更新。配置见 `.github/`。
