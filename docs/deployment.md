# EdgeOne 部署

## 配置与构建

项目仅支持 EdgeOne Makers。将完整配置提交为 `config/site.json`；可使用[可视化配置编辑器](https://status.tomys.top/?configeditor=on)生成文件，字段和公开范围见[配置说明](configuration.md)。

在 Makers 导入 Git 仓库，选择部署分支，项目根目录使用仓库根目录。构建设置已由 [edgeone.json](../edgeone.json) 声明：

| 设置     | 值                                                                          |
| -------- | --------------------------------------------------------------------------- |
| 安装命令 | `pnpm install --frozen-lockfile`                                            |
| 构建命令 | `pnpm run build`                                                            |
| 输出目录 | `dist`                                                                      |
| Node.js  | `edgeone.json` 的 `nodeVersion`；本地兼容范围见 `package.json` 的 `engines` |
| pnpm     | `package.json` 的 `packageManager`                                          |

部署需同时包含 `dist/`、`cloud-functions/`、`edge-functions/` 和构建生成的配置，不能只上传静态产物。公开 API 由云函数聚合，边缘函数负责缓存桥；云函数执行上限配置为 120 秒，响应仍受平台大小限制和上游额度约束。

## 环境变量

| 变量                       | 作用域     | 用途                                                      |
| -------------------------- | ---------- | --------------------------------------------------------- |
| `PEEKAPING_API_KEY`        | 函数运行时 | Peekaping API Key，变量名可通过 `source.apiKeyEnv` 自定义 |
| `UPTIMEROBOT_API_KEY`      | 函数运行时 | 能读取所选监控的 UptimeRobot API Key，同样可自定义变量名  |
| `UPTIMEPAGE_CONFIG_EDITOR` | 构建       | 精确设为 `true` 才编译编辑器，默认不编译                  |
| `UPTIMEPAGE_CONFIG`        | 构建       | 可选配置文件路径，默认优先读取 `config/site.json`         |
| `UPTIMEPAGE_COMMIT`        | 构建       | 可选 Git 提交 hash；无法从 Git 获取提交信息时使用         |

只设置实际使用的来源密钥，确保相应生产 / 预览环境的云函数和边缘函数均可读取。密钥不写入 JSON，不使用 `VITE_` 前缀。更改配置或环境变量后重新部署。

KV 非必需。如需跨实例缓存，创建命名空间并绑定变量，再设置 `cache.kvBinding`，见 [KV 配置](configuration.md#可选-kv)。它是资源绑定，不是普通文本环境变量，无需额外缓存密钥。

启用编辑器后，通过本站的 `/?configeditor=on` 进入；不带参数仍是正常状态页，主页不提供编辑入口。编辑器只在浏览器内编辑、预览和导出文件，不在线修改部署配置。

## 部署验证

首页应一次加载当前大分组的全部卡片；核对公开监控数量，并直接打开详情、刷新和返回，确认深层路由有效。数据缺失、限流和缓存诊断见[排错](troubleshooting.md)。

自动验收须使用与部署一致的提交、配置、锁文件及构建变量，包括编辑器开关；否则静态资源 hash 或配置版本可能不匹配。在终端设置 `UPTIMEPAGE_PREVIEW_URL` 为部署的 HTTPS origin，例如 `https://status.example.com`，不带路径或查询参数，再运行：

```sh
pnpm run verify:deployment
pnpm run verify:browser
```

HTTP 验收先构建，再检查静态资源、配置版本、整组快照、三种时间范围详情、深层路由、公开范围和缓存桥保护；无需本地来源密钥。非零退出码表示失败，空组的详情检查会跳过。

浏览器验收覆盖真实部署的手机布局、中英文、深浅色、菜单和刷新，并在测试浏览器内模拟 545、超时及限流，检查错误反馈和旧数据保留；不修改部署函数或 KV。首次运行需安装 Chromium，见[开发与测试](development.md)。这些模拟不代替独立预览环境的函数 / KV 故障验证，发布前按[检查清单](production-review.md)核对。

## 更新与回退

配置修改提交到部署分支，随自动部署或手动构建生效。回退完整部署，使静态资源与函数使用同一配置版本。来源配额、平台运行限制及 KV 额度以实际环境为准。

平台文档：[Cloud Functions](https://pages.edgeone.ai/zh/document/cloud-functions) · [KV](https://pages.edgeone.ai/zh/document/kv-storage)
