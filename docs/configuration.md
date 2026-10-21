# 配置

## 配置文件

配置为完整 JSON，包含 `site`、`groups` 和可选 `cache`。使用[可视化配置编辑器](https://status.tomys.top/?configeditor=on)生成，或参考 [config/default.json](../config/default.json)，保存为 `config/site.json` 并提交。修改后需要重新构建部署。

构建读取顺序：`UPTIMEPAGE_CONFIG` 指定文件 → `config/site.json` → `config/default.json`。完整替换，不合并；只有 `site.json` 不存在才回退默认文件。显式路径不存在、配置损坏或读取失败会终止构建。

`site.json` 可提交，公开仓库中的内容也会公开；`*.local.json` 被 Git 忽略，仅适合本地通过 `UPTIMEPAGE_CONFIG` 指定。构建脚本不自动加载 `.env`。运行 `pnpm run generate` 校验配置，它不连接上游；字段和约束以 [config/schema.ts](../config/schema.ts) 为准，未知字段会被拒绝。

## 可视化编辑器

[打开在线编辑器](https://status.tomys.top/?configeditor=on)。支持完整表单、直接编辑 JSON、复制 / 粘贴、导入 / 导出；JSON 工具位于 JSON 卡片中，文件导入上限 4 MB。已有配置需自行导入，编辑器默认从示例开始。

有效修改立即更新模拟页面；无效输入保留最后一次有效预览并禁止导出。它不读取部署的服务端配置、来源密钥或真实监控，也不验证来源连通性和真实公开范围。草稿仅在当前页面内存中，刷新或退出前需导出。

导出的 `site.json` 提交到自己的仓库并重新部署后才生效。只想生成配置，可直接使用上述在线入口；要在自己的站点提供编辑器，在构建环境设置 `UPTIMEPAGE_CONFIG_EDITOR=true`，重新部署后访问 `/?configeditor=on`。默认不编译，移除变量或设为 `false` 后重新部署即可移除。编辑器与状态页一同部署，无后台写入、登录或主页入口。

## 网站 `site`

| 字段                     | 含义 / 默认值                                                                   |
| ------------------------ | ------------------------------------------------------------------------------- |
| `name`                   | 必填，网站名称                                                                  |
| `logo`                   | Logo 路径或 HTTPS 地址，默认 `null`                                             |
| `nav`                    | 导航数组，默认 `[]`；每项含 `label`、`href`、可选 `newTab`（默认 `false`）      |
| `footer`                 | 页脚右侧内容，默认空；支持 `[文字](https://example.com)` 链接，其余按纯文本显示 |
| `refreshIntervalSeconds` | 非负整数，默认 `60`；`0` 为仅手动刷新                                           |
| `pinAbnormal`            | 默认异常优先，默认 `false`                                                      |

名称、导航文字、页脚和监控描述支持字符串或双语对象，例如 `{"en":"Services","zh-CN":"服务"}`；双语对象必须有英文。Logo 和导航地址支持 `/logo.svg` 这样的站内路径或 HTTPS URL，本地资源放在 `public/`。

```json
{
  "nav": [
    { "label": "首页", "href": "https://vov.moe", "newTab": true },
    { "label": "博客", "href": "https://blog.tomys.top", "newTab": true }
  ]
}
```

以上是 `site` 的局部示例。页脚左侧固定为 `Powered by UptimePage 短hash | TomyJan` 及对应链接，不由 `footer` 覆盖；hash 构建时从 Git 注入，也可用 `UPTIMEPAGE_COMMIT` 指定。未指定且无法从 Git 读取时显示 `dev`。

访客语言、时区、外观和刷新偏好保存在浏览器，手动选择优先。自动语言不支持时回退英文，时区获取失败时回退 UTC，外观跟随系统。

## 分组 `groups`

至少配置一个大分组。每组必填 `id`、`name`、`source`、`subgroups`，可选 `logo`、`monitors`；子组有独立的 `id`、`name`、`logo` 和来源选择规则，Logo 不继承。

- 大分组 ID 全站唯一，子组 ID 在组内唯一；格式为小写字母 / 数字组成的段，以单个连字符分隔。子组不能使用保留 ID `all`。
- 每组绑定一个来源连接，允许多个同类型来源；未被任何子组选中的监控不公开。相同监控可属于多个子组，跨大分组独立处理。
- 分组按配置顺序显示。默认首个大分组的“全部”，按子组顺序合并并去重；允许空子组或空子组数组。
- 子组可用 `order` 将指定监控 ID 排在前面。未列出项，Peekaping 沿用上游顺序，UptimeRobot 显式选择沿用 `monitorIds` 顺序。`order` 只影响排序，不扩大选择范围。

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

网站设置和分组名称 / Logo 进入静态产物；来源地址、选择规则和密钥变量名只用于函数。浏览器接口只返回公开展示字段，不透传上游目标地址和私有配置。提交到公开仓库的配置文件本身仍然公开。

## 可选 KV

默认 `"cache": {}`，使用实例缓存、可用的节点缓存和实时取数。KV 用于跨节点 / 实例复用短期成功快照，不保存长期历史。

1. 在 Makers 创建 KV 命名空间，例如 `uptimepage-cache`。空间名称无项目专属要求，遵守平台规则即可；建议本站使用独立空间。
2. 将空间绑定到本站项目，绑定变量名例如 `UPTIMEPAGE_KV`。
3. 在配置中设置 `"cache": {"kvBinding":"UPTIMEPAGE_KV"}`，提交并重新部署。

`cache.kvBinding` 与绑定变量名必须一致，区分大小写；使用字母 / 下划线开头，后续可含数字。命名空间名称、自动生成的 ID 均不填入此字段；绑定是资源，不是在普通环境变量里填写空间名称，也不需要 KV Token 或修改 `edgeone.json`。

程序自动写入 `uptimepage_` 开头的记录，无需初始化 Key 或设置平台 TTL。状态 / 详情成功快照最多复用 5 分钟，成员名单 10 分钟；过期记录即使仍存在也不会继续使用。配置变更会校验版本，已删除路由的残留记录可手动清理。

绑定缺失、读写失败或超时会自动降级。页面正常不能单独证明 KV 生效；重新部署并访问 API 后，在命名空间核对是否出现新记录。KV 为最终一致性存储，节点缓存能力也取决于平台环境；未启用 KV 时，冷实例遇到来源故障可能没有旧快照可回退。

停用时改回 `"cache": {}`，重新部署后再解绑。平台开通和额度见 [Makers KV 文档](https://pages.edgeone.ai/zh/document/kv-storage)。
