# 配置

## 配置文件

配置为完整 JSON，包含 `site`、`groups` 和可选 `cache`。使用[可视化配置编辑器](https://status.tomys.top/?configeditor=on)生成，或参考 [config/default.json](../config/default.json)。将文件放在独立配置分支或自行托管，在 EO 构建环境变量 `UPTIMEPAGE_CONFIG` 中填写可匿名读取的 HTTPS JSON 直链，见[部署步骤](deployment.md#配置与构建)。

`UPTIMEPAGE_CONFIG` 也接受本地文件路径。配置完整替换，不合并；显式指定的直链或文件读取、解析、校验失败会终止构建。只有未设置变量时，才依次读取仓库的 `config/site.json`、`config/default.json`；仅 `site.json` 不存在时回退默认文件。

GitHub 地址（`raw.githubusercontent.com`、`gist.githubusercontent.com` 或 `github.com`）先经 [ghfast](https://ghfast.top) 加载，失败后直连；其他地址直接加载。请求超时、HTTP 错误、非 JSON 或无效配置均触发回退，每次请求最多 10 秒，跳转仅接受 HTTPS；均失败则报错，不使用默认配置。

配置只在构建时读取，修改托管文件后需重新部署。使用 GitHub 配置提交 hash 的直链可以固定版本。`*.local.json` 被 Git 忽略，适合本地预览；构建脚本不自动加载 `.env`。`pnpm run generate` 会读取并校验配置（直链需要联网），但不查询监控来源。字段以 [config/schema.ts](../config/schema.ts) 为准，未知字段会被拒绝。

## 监控图标

监控默认自动获取网站图标，无需配置；`groups[].monitors[id].logo` 手动覆盖优先。站点、分组和子组的 Logo 仍独立配置。

浏览器先显示名称文字占位，图片成功后淡入，加载失败保留文字。自动图标由 EO 服务端获取并转发，与 `showLinks` 无关，不会在公开图标地址中包含监控域名或 URL。获取顺序、缓存与限制见[数据与接口](data-api.md#监控图标)。

## 可视化编辑器

[打开在线编辑器](https://status.tomys.top/?configeditor=on)。支持完整表单、直接编辑 JSON、复制 / 粘贴、导入 / 导出；JSON 工具位于 JSON 卡片中，文件导入上限 4 MB。已有配置需自行导入，编辑器默认从示例开始。

有效修改立即更新模拟页面；无效输入保留最后一次有效预览并禁止导出。切换文案语言会同步切换网页语言。它不读取部署的服务端配置、来源密钥或真实监控，也不验证来源连通性和真实公开范围。草稿仅在当前页面内存中，刷新或退出前需导出。

编辑面板位于右下角，失去悬停和输入焦点后自动贴边，悬停、点击或键盘聚焦可展开，也可固定展开。表单与 JSON 共用草稿；导入、复制、粘贴和格式化工具在 JSON 面板中。

将导出的 `site.json` 上传到配置直链对应位置，重新部署状态页后生效。只想生成配置，可直接使用上述在线入口；要在自己的站点提供编辑器，在构建环境设置 `UPTIMEPAGE_CONFIG_EDITOR=true`，重新部署后访问 `/?configeditor=on`。默认不编译，移除变量或设为 `false` 后重新部署即可移除。编辑器与状态页一同部署，无后台写入、登录或主页入口。

## 网站 `site`

| 字段                     | 含义 / 默认值                                                                   |
| ------------------------ | ------------------------------------------------------------------------------- |
| `name`                   | 必填，网站名称                                                                  |
| `logo`                   | Logo 路径或 HTTPS 地址，默认 `null`                                             |
| `nav`                    | 导航数组，默认 `[]`；每项含 `label`、`href`、可选 `newTab`（默认 `false`）      |
| `footer`                 | 页脚右侧内容，默认空；支持 `[文字](https://example.com)` 链接，其余按纯文本显示 |
| `refreshIntervalSeconds` | 非负整数，默认 `60`；`0` 为仅手动刷新                                           |
| `pinAbnormal`            | 是否默认将异常条目置顶，默认 `false`                                            |
| `showLinks`              | 是否展示监控网站链接，默认 `false`，分组与子分组可覆盖                          |
| `umami`                  | 可选 Umami 统计配置，默认 `null`，见下文                                        |

名称、导航文字、页脚和监控描述支持字符串或双语对象，例如 `{"en":"Services","zh-CN":"服务"}`；双语对象必须有英文。Logo 和导航地址支持 `/logo.svg` 这样的站内路径或 HTTPS URL，本地资源放在 `public/`；站内路径相对于状态页站点，不是配置文件地址。

```json
{
  "nav": [
    { "label": "首页", "href": "https://vov.moe", "newTab": true },
    { "label": "博客", "href": "https://blog.tomys.top", "newTab": true }
  ]
}
```

以上是 `site` 的局部示例。页脚左侧固定为 `Powered by UptimePage 短hash | TomyJan` 及对应链接，不由 `footer` 覆盖；hash 构建时从 Git 注入，也可用 `UPTIMEPAGE_COMMIT` 指定。未指定且无法从 Git 读取时显示 `dev`。

自定义导航在桌面直接显示，手机端收进导航菜单；`newTab` 行为一致。

访客语言、时区、外观和刷新偏好保存在浏览器，手动选择优先。自动语言不支持时回退英文，时区获取失败时回退 UTC，外观跟随系统。

### 监控链接

`site.showLinks` 设置全局默认值，`groups[].showLinks` 和 `groups[].subgroups[].showLinks` 可填 `true` / `false`，省略则继承上一级；子分组优先。例如仅公开一个子组的链接，在该子组配置 `"showLinks": true` 即可。编辑器中对应“显示监控链接”，分组和子组可选“继承 / 显示 / 隐藏”。

链接来自 Peekaping 监控项 `config` JSON 字符串中的 `url`，或 UptimeRobot 监控项的 `url`。只接受无凭证的 HTTP(S) 地址；未提供或不合法时不显示跳转按钮。首页与详情的按钮均在名称旁，新标签页打开。“全部”和直接进入的详情，只要任一所属子组允许便显示；从具体子组进入详情会保留该子组的设置。

完全关闭的监控不会通过 API 返回链接。若同一监控已在其他子组允许展示，链接本身就是公开数据；子组的隐藏选项只控制该视图是否显示跳转按钮，不影响自动图标。

### Umami

在 `site.umami` 配置统计脚本地址和 Website ID，更新配置文件后重新构建部署；不使用环境变量。两项都会进入浏览器，不能填写管理端密钥或访问令牌。

```json
{
  "umami": {
    "scriptUrl": "https://analytics.example.com/script.js",
    "websiteId": "94db1cb1-74f4-4a40-ad6c-962362670409"
  }
}
```

以上是 `site` 的局部示例。`scriptUrl` 支持 HTTPS URL 或 `/analytics/script.js` 这样的同源绝对路径；`websiteId` 使用 Umami 站点设置提供的 UUID。删除此项或设为 `null` 即关闭。配置编辑器的网站设置中也可填写。

生产构建中异步加载一次，包括配置编辑会话；使用 Umami 原生的页面与 SPA 路由统计。编辑时仍使用已部署的统计配置，草稿修改不会切换统计脚本。开发环境不统计；脚本被拦截或不可用不影响页面。

## 分组 `groups`

至少配置一个大分组。每组必填 `id`、`name`、`source`、`subgroups`，可选 `logo`、`showLinks`、`monitors`；子组有独立的 `id`、`name`、`logo`、`showLinks` 和来源选择规则，Logo 不继承，链接显示按层级继承。

- 大分组 ID 全站唯一，子组 ID 在组内唯一；格式为小写字母 / 数字组成的段，以单个连字符分隔。子组不能使用保留 ID `all`。
- 每组绑定一个来源连接，允许多个同类型来源；未被任何子组选中的监控不公开。相同监控可属于多个子组，跨大分组独立处理。
- 分组按配置顺序显示。默认首个大分组的“全部”，按子组顺序合并并去重；允许空子组或空子组数组。
- 子组可用 `order` 将指定监控 ID 排在前面。未列出项，Peekaping 沿用上游顺序，UptimeRobot 显式选择沿用 `monitorIds` 顺序。`order` 只影响排序，不扩大选择范围。

开启异常优先时，故障、重试中、未知依次提前，同类条目保持原顺序；维护和暂停不提前。访客可在页面中切换，不改变配置文件。

以下示例各为 `groups[]` 的一个完整元素。

### Peekaping

```json
{
  "id": "core",
  "name": "自有服务",
  "source": {
    "type": "peekaping",
    "baseUrl": "https://monitor.example.com",
    "apiKeyEnv": "PEEKAPING_API_KEY"
  },
  "subgroups": [{ "id": "web", "name": "网站", "slug": "default" }]
}
```

`baseUrl` 必须为不含凭证、查询参数或片段的 HTTPS 实例地址。`slug` 是上游公开状态页别名；状态页 API **只获取监控 ID 作为公开范围**，实际监控数据使用服务端 API Key 查询。成员名单缓存 10 分钟，来源状态页撤销成员最迟在缓存到期后生效，见[缓存规则](data-api.md#读取与缓存)。

### UptimeRobot

```json
{
  "id": "external",
  "name": "外部服务",
  "source": { "type": "uptimerobot", "apiKeyEnv": "UPTIMEROBOT_API_KEY" },
  "subgroups": [{ "id": "tools", "name": "工具", "monitorIds": ["123456789"] }]
}
```

`monitorIds` 使用字符串数组；`["*"]` 选择该 API Key 可读取的全部监控，自动分页，也会公开后续新增的监控。只支持完整的 `*`，不做前缀匹配；`[]` 为留空。

显式选择时，`order` 中的 ID 必须包含在本子组的 `monitorIds` 中。使用 `*` 时可用具体 ID 排序，但 `order` 不能包含 `*`。

### 监控显示覆盖

在所属大分组的 `monitors` 中以上游监控 ID 为键，覆盖公开名称、Logo 或描述；三个字段均可省略。只影响显示，不扩大公开范围，同组各子组共用覆盖。

```json
{
  "monitors": {
    "123456789": {
      "name": { "en": "Homepage", "zh-CN": "主页" },
      "logo": "/web.svg",
      "description": "公开网站"
    }
  }
}
```

## 密钥与公开内容

`apiKeyEnv` 只填写环境变量名，格式为大写字母 / 下划线开头，后续可含数字，例如 `PEEKAPING_API_KEY`。实际值在 EO 函数环境变量中设置；多个连接可引用不同变量名。不要把密钥值写入 JSON 或 `VITE_*`。

网站设置和分组名称 / Logo 进入静态产物；来源地址、选择规则和密钥变量名只用于函数。浏览器接口只返回公开展示字段；监控目标链接默认不返回，仅在 `showLinks` 允许时公开。公开托管的配置文件本身仍然公开，不能在其中填写密钥值。

## 可选 KV

默认 `"cache": {}`，使用实例缓存、可用的节点缓存和实时取数。KV 用于跨节点 / 实例复用短期成功快照，不保存长期历史。

1. 在 Makers 创建 KV 命名空间，例如 `uptimepage-cache`。空间名称无项目专属要求，遵守平台规则即可；建议本站使用独立空间。
2. 将空间绑定到本站项目，绑定变量名例如 `UPTIMEPAGE_KV`。
3. 在配置中设置 `"cache": {"kvBinding":"UPTIMEPAGE_KV"}`，更新托管文件并重新部署。

`cache.kvBinding` 与绑定变量名必须一致，区分大小写；使用字母 / 下划线开头，后续可含数字。命名空间名称、自动生成的 ID 均不填入此字段；绑定是资源，不是在普通环境变量里填写空间名称，也不需要 KV Token 或修改 `edgeone.json`。

程序自动写入 `uptimepage_` 开头的记录，无需初始化 Key 或设置平台 TTL。状态 / 详情成功快照最多复用 5 分钟，成员名单 10 分钟；过期记录即使仍存在也不会继续使用。配置变更会校验版本，已删除路由的残留记录可手动清理。

绑定缺失、读写失败或超时会自动降级。页面正常不能单独证明 KV 生效；重新部署并访问 API 后，在命名空间核对是否出现新记录。KV 为最终一致性存储，节点缓存能力也取决于平台环境；未启用 KV 时，冷实例遇到来源故障可能没有旧快照可回退。

停用时改回 `"cache": {}`，重新部署后再解绑。平台开通和额度见 [Makers KV 文档](https://pages.edgeone.ai/zh/document/kv-storage)。
