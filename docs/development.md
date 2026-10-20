# 开发与测试

使用 `package.json` 声明的 Node.js 和 pnpm 版本。首次启用 pnpm 可运行 `corepack enable`。

```sh
pnpm install --frozen-lockfile
pnpm run dev:demo
```

演示样例的相对时间随当前时钟移动；形状和状态固定。`?demoCount=200` 检查大列表，`?demoPartial=1` 检查部分失败。单元测试保留固定参考时间。演示入口不进入生产包。

`pnpm run dev` 使用真实同源 API，但 Vite 不启动 EdgeOne 函数；没有函数时显示获取失败，不会回退到演示。真实数据在 EdgeOne 预览环境联调，见[部署指南](deployment.md)。

## 检查命令

```sh
pnpm run format:check
pnpm test
pnpm run typecheck
pnpm run build
pnpm run verify:public-build
pnpm run test:e2e
pnpm audit --prod --audit-level=high --registry=https://registry.npmjs.org
```

首次浏览器测试前运行 `pnpm exec playwright install chromium`；Linux CI 使用 `pnpm exec playwright install --with-deps chromium`。也可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定本机已有 Chromium。

浏览器测试使用 5173（开发演示）和 4173（生产静态预览），不要让其他服务器占用端口。测试包含中英文、深浅色、手机、动效、刷新失败与浏览器过期；截图和失败 trace 保存在 `test-results/`。

生成器、构建、产物隔离与浏览器测试都会处理 `.generated/`，请顺序执行。公开产物检查使用临时私有哨兵配置，并在 `finally` 恢复生成文件；同时验证 `VITE_DEMO=true` 也不会把演示代码打包进生产。

## 代码入口

| 目录 | 内容 |
| --- | --- |
| `src/features/` | 页面、偏好、刷新和通知 |
| `src/shared/` | 前后端共用类型和响应校验 |
| `src/server/` | 来源适配、公开范围和缓存 |
| `edge-functions/api/v1/[[default]].ts` | EdgeOne 函数入口 |
| `config/`、`scripts/build-config.ts` | 配置校验与公私拆分 |
| `scripts/verify-deployment.ts` | 线上 / 预览 HTTP 验收 |
| `tests/unit/server/edge-entry.test.ts` | 真实入口、环境变量和可选存储的本地集成测试 |

浏览器只导入 `.generated/public-config.ts`；服务端连接、选择规则和变量引用在 `.generated/server-config.ts`，不能从前端导入。不要提交 `.env`、`*.local.json`、生成物或真实密钥。

## 自动检查

GitHub Actions 对 `master` 推送、PR 和手动触发运行格式、类型、单元测试、构建、产物隔离、浏览器回归和生产依赖审计。失败或取消时保留浏览器产物 7 天。

Dependabot 每日检查 pnpm 依赖、每周检查 Actions；React 和 React DOM 一起更新。版本在 `package.json` / `edgeone.json` 中声明，命令不指定版本。锁文件迁移时的发布冷却期例外见 `pnpm-workspace.yaml`。

配置见[配置指南](configuration.md)，数据口径见[数据与接口](data-api.md)，完整审查结果见[审查记录](production-review.md)。
