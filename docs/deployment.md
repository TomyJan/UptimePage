# EdgeOne 部署

## 1. 提交实际配置

Fork 本仓库或使用自己的 Git 仓库，复制 `config/default.json` 为 `config/site.json`。填写来源地址、Peekaping 公开状态页别名、UptimeRobot 监控 ID，再提交并推送；字段见[配置说明](configuration.md)。

`site.json` 是完整配置，无需在 EO 中粘贴 JSON 或设置配置路径。没有这个文件时才使用默认配置；默认地址和 ID 是占位值，不能用于生产。

## 2. 导入项目并设置密钥

在 EdgeOne Makers 导入仓库，根目录选仓库根目录，选择部署分支。`edgeone.json` 已声明构建设置：

| 项目             | 值                                          |
| ---------------- | ------------------------------------------- |
| 安装命令         | `pnpm install --frozen-lockfile`            |
| 构建命令         | `pnpm run build`                            |
| 输出目录         | `dist`                                      |
| Node / pnpm 版本 | 分别由 `edgeone.json` / `package.json` 声明 |

在项目环境变量中设置配置所引用的密钥，对需要的生产 / 预览环境生效，并确认函数运行时可读取。默认变量如下，只添加实际使用的来源：

| 变量名                | 变量值                               |
| --------------------- | ------------------------------------ |
| `PEEKAPING_API_KEY`   | 对应 Peekaping 实例的 API Key        |
| `UPTIMEROBOT_API_KEY` | 能读取选中监控的 UptimeRobot API Key |

变量名与 JSON 中的 `apiKeyEnv` 一致；密钥不放进 JSON 或 `VITE_*`。修改变量后重新部署。KV 非必需，启用方式见[可选 KV](configuration.md#可选-kv-cache)。

使用仓库构建部署，不能只上传 `dist/`：还需要 `cloud-functions/`、`edge-functions/` 和构建生成的服务端配置。构建后应有 `/api/v1/*` 云函数和 `/_uptimepage/cache` 边缘缓存函数。两种运行时使用相同的来源环境变量，无需额外配置缓存密钥。

API 由 Cloud Functions 聚合，避免 Edge Functions 每次最多 64 次 `fetch` 的限制。`edgeone.json` 已将云函数最长执行时间设为 120 秒；响应仍受平台 6 MB 和来源额度限制。监控数量没有人为上限，冷加载耗时随来源数量增加。运行限制见 [Cloud Functions](https://pages.edgeone.ai/zh/document/cloud-functions)。

## 3. 检查部署

先确认首页有真实数据，再直接打开一个监控详情，刷新页面并返回。核对监控数量、状态和历史是否与上游一致。

运行自动检查时，本地须使用部署的**同一提交、配置和锁文件**；若设置了 `UPTIMEPAGE_CONFIG` 或 `UPTIMEPAGE_COMMIT`，本地使用相同值。不同提交可能产生不同资源 hash。

PowerShell：

```powershell
$env:UPTIMEPAGE_PREVIEW_URL = 'https://your-preview.example.com'
pnpm run verify:deployment
```

sh：

```sh
UPTIMEPAGE_PREVIEW_URL=https://your-preview.example.com pnpm run verify:deployment
```

地址使用不带路径的 HTTPS 站点地址。命令先构建，再检查资源、每组完整精简快照及一个监控的 24 小时 / 7 天 / 30 天详情、配置版本、深层路由、公开范围、只读限制、未签名缓存请求拒绝和 `no-store`。无需在本地设置来源密钥。

非零退出码表示失败；空组的详情检查会 `SKIP`。遇到限流应等待退避后重试。自动检查不能代替来源口径、平台缓存和运行配额验证，完整清单见[验证状态](production-review.md)。

排查缓存时查看 API 响应头 `X-UptimePage-Cache`：`status` / `membership` 表示状态 / 成员缓存，`match` / `put` 表示读取 / 写入；`http-404` 表示缓存桥拒绝，`network` / `timeout` 表示连接失败 / 超时，`pending` 表示 API 返回时操作仍未完成，`oversized` 表示超过桥接请求限制。`http-200` 只代表缓存桥响应成功，仍需在 KV 核对新记录；该响应头不包含密钥、来源地址或异常原文。

404 后的后缀是拒绝阶段：`configuration` 缺少运行时配置，`signature` 验签失败，`crypto` 加密接口异常，`version` / `origin` 为部署版本 / 请求来源不匹配，`expired` 为签名过期。缓存桥本身的相同标签位于 `X-UptimePage-Cache-Bridge`；其他标签表示报文、路径、写入值或内部处理异常。

`origin-` 后的 12 位是云函数实际请求站点 origin 的 SHA-256 前 12 位，用于排查平台内部地址改写；它不取访客传入的转发头，也不直接显示内部地址。

## 排错

| 现象                              | 检查                                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 仍请求示例地址 / 查不到监控       | `site.json` 是否提交到部署分支，最新部署是否生效，是否被 `UPTIMEPAGE_CONFIG` 覆盖                               |
| 配置构建失败                      | JSON 格式、错误指出的字段；实际配置损坏不会回退默认文件                                                         |
| API 返回 HTML                     | 函数是否部署，路由是否被 SPA fallback 接管；只上传 `dist` 不够                                                  |
| 获取失败 / 502                    | 函数能否读取密钥，来源地址、状态页权限和来源版本是否正确                                                        |
| 545 / `Error return from script`  | 边缘函数执行异常；日志官方仍在规划中，先查看脱敏诊断，记录时间、响应头 `X-NWS-LOG-UUID`（若有）及可用的平台指标 |
| 429 / 限流                        | 来源额度和退避截止时间；失败 Toast 显示原因，旧数据及更新时间保留                                               |
| 验收报配置版本不符 / 缺少资源     | 本地和部署的提交、配置、锁文件及构建变量是否一致                                                                |
| 历史缺口 / 没有证书 | 来源保留时间、缺失采样和证书接口支持情况，见[数据口径](data-api.md#来源能力)                                                            |
| KV 未命中                         | 项目是否绑定命名空间、绑定变量名是否与 `cache.kvBinding` 一致、重新部署后是否生成 `uptimepage_` 记录            |

## 更新与回退

修改 `site.json` 后提交推送；开启自动部署时会随推送构建，否则手动重新部署。无需更改默认文件。修改密钥后也要重新部署。回退时回退完整部署，让静态资源和函数使用同一配置版本。
