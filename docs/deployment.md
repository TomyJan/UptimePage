# EdgeOne 部署

## 配置与构建

项目仅支持 EdgeOne Makers。

1. Fork 仓库，使用[可视化配置编辑器](https://status.tomys.top/?configeditor=on)生成完整 JSON，字段见[配置说明](configuration.md)。
2. 将 JSON 上传到可匿名读取的 HTTPS 地址。可在 Fork 中新建 `config` 分支存放 `site.json`，也可自行托管；代码部署分支无需提交实际配置。
3. 在 Makers 导入代码分支（通常为 `master`），根目录选仓库根目录，添加构建环境变量 `UPTIMEPAGE_CONFIG`，填写 JSON 直链。例如配置文件位于 `config` 分支时：

   ```text
   https://raw.githubusercontent.com/<用户名>/UptimePage/config/site.json
   ```

4. 在函数环境变量中设置配置引用的来源 API Key，按下表构建并部署。

使用文件原始内容地址，不填 GitHub 的 `blob` 网页地址。GitHub 直链会自动先请求 `https://ghfast.top/<原始直链>`，失败后请求原始地址；其他托管地址直接读取。每次请求超时为 10 秒，HTTP 错误、非 JSON 或配置校验失败均算失败；所有尝试失败则终止构建，不改用仓库中的配置。

构建设置已由 [edgeone.json](../edgeone.json) 声明：

| 设置     | 值                                                                          |
| -------- | --------------------------------------------------------------------------- |
| 安装命令 | `pnpm install --frozen-lockfile`                                            |
| 构建命令 | `pnpm run build`                                                            |
| 输出目录 | `dist`                                                                      |
| Node.js  | `edgeone.json` 的 `nodeVersion`；本地兼容范围见 `package.json` 的 `engines` |
| pnpm     | `package.json` 的 `packageManager`                                          |

Makers 需从仓库构建并部署 `dist/`、`cloud-functions/`、`edge-functions/` 及构建生成的配置，不能只上传静态产物。公开 API 由云函数聚合，边缘函数负责缓存桥；云函数执行上限为 120 秒，实际容量受平台限制和上游额度约束。

## 环境变量

| 变量                       | 作用域     | 用途                                                             |
| -------------------------- | ---------- | ---------------------------------------------------------------- |
| `PEEKAPING_API_KEY`        | 函数运行时 | Peekaping API Key，变量名可通过 `source.apiKeyEnv` 自定义        |
| `UPTIMEROBOT_API_KEY`      | 函数运行时 | 能读取所选监控的 UptimeRobot API Key，同样可自定义变量名         |
| `UPTIMEPAGE_CONFIG_EDITOR` | 构建       | 精确设为 `true` 才编译编辑器，默认不编译                         |
| `UPTIMEPAGE_CONFIG`        | 构建       | 配置 JSON 的 HTTPS 直链；也支持本地文件路径                      |
| `UPTIMEPAGE_COMMIT`        | 构建       | 可选覆盖构建提交 hash；未设置时从 Git 读取，均不可用时显示 `dev` |

只设置实际使用的来源密钥，确保相应生产 / 预览环境的云函数和边缘函数均可读取。密钥不写入 JSON，不使用 `VITE_` 前缀。更改配置或环境变量后重新部署。

KV 非必需。如需跨实例缓存，创建命名空间并绑定变量，再设置 `cache.kvBinding`，见 [KV 配置](configuration.md#可选-kv)。它是资源绑定，不是普通文本环境变量，无需额外缓存密钥。

启用编辑器后，通过本站的 `/?configeditor=on` 进入；不带参数仍是正常状态页，主页不提供编辑入口。编辑器只在浏览器内编辑、预览和导出文件，不在线修改部署配置。

Umami 使用 JSON 中的 `site.umami` 配置，无需新增环境变量，见[统计配置](configuration.md#umami)。

## 部署验证

首页应一次加载当前大分组的全部卡片；核对公开监控数量，并直接打开详情、刷新和返回，确认深层路由有效。数据缺失、限流和缓存诊断见[排错](troubleshooting.md)。

自动验收须使用与部署一致的提交、配置、锁文件及构建变量，包括编辑器开关；否则静态资源 hash 或配置版本可能不匹配。在终端设置 `UPTIMEPAGE_PREVIEW_URL` 为部署的 HTTPS origin，例如 `https://status.example.com`，不带路径或查询参数，再运行：

```sh
pnpm run verify:deployment
pnpm run verify:browser
```

HTTP 验收先构建，再检查静态资源、配置版本、整组快照、三种时间范围详情、深层路由、公开范围和缓存桥保护；无需本地来源密钥。非零退出码表示失败，空组的详情检查会跳过。

浏览器验收覆盖手机布局、中英文、深浅色、菜单和刷新，并在浏览器内模拟 545、超时及限流，不修改部署函数或 KV。首次运行需安装 Chromium，见[开发与测试](development.md)。函数与 KV 的故障降级需在独立预览环境验证，见[发布检查](release.md)。

## 更新与回退

更新配置分支或托管文件后，重新部署状态页才会生效；现有部署不会在运行时重读直链。需要固定配置版本时，可将 GitHub 直链中的分支名换为配置文件的提交 hash。

回退完整部署，使静态资源与函数使用同一配置版本。若从源码重新构建旧版本，还需使用对应的配置文件版本。来源配额、平台运行限制及 KV 额度以实际环境为准。

平台文档：[Cloud Functions](https://pages.edgeone.ai/zh/document/cloud-functions) · [KV](https://pages.edgeone.ai/zh/document/kv-storage)
