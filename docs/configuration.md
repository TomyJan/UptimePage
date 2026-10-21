# 配置

## 配置文件

复制 [config/default.json](../config/default.json) 为 `config/site.json`，填写后提交到 EO 关联的 Git 分支。修改配置需要重新构建部署。

读取顺序：`UPTIMEPAGE_CONFIG` 指定的文件 → `config/site.json` → `config/default.json`。配置完整替换，不合并；只有 `site.json` 不存在才回退默认文件，格式错误、读取失败或显式路径不存在都会使构建失败。

`site.json` 可正常提交；`*.local.json` 被忽略，只适合本地配合 `UPTIMEPAGE_CONFIG` 使用，不会随 Git 部署上传。构建脚本不自动加载 `.env`。

根结构为 `site`、`groups`、可选 `cache`。可用 `pnpm run generate` 检查格式及字段，错误会指出配置位置；此检查不连接上游。

## 网站 `site`

| 字段                     | 用途 / 默认值                                                                 |
| ------------------------ | ----------------------------------------------------------------------------- |
| `name`                   | 网站名称，必填                                                                |
| `logo`                   | Logo 路径或 HTTPS 地址，可省略                                                |
| `nav`                    | 导航链接数组，如 `[{"label":"Blog","href":"https://example.com"}]`，默认 `[]` |
| `footer`                 | 页脚右侧纯文本，默认空；不解析 HTML / Markdown                                |
| `refreshIntervalSeconds` | 默认刷新间隔，非负整数，默认 `60`；`0` 仅手动                                 |
| `pinAbnormal`            | 默认异常优先，默认 `false`                                                    |

名称、导航文字、页脚和监控描述支持普通字符串，或 `{"en":"Services","zh-CN":"服务"}`；多语言对象必须有英文。Logo 和链接可用 `/logo.svg` 这样的站内路径，本地文件放在 `public/`；外部地址使用 HTTPS。

页脚左侧固定为 `Powered by UptimePage 短hash | TomyJan`，不由 `footer` 覆盖。hash 构建时取 Git 提交；归档构建可用 `UPTIMEPAGE_COMMIT` 指定完整提交 hash，未提供提交信息时显示 `dev`。

访客的语言、时区、外观和刷新偏好保存在各自浏览器。自动语言不匹配时回退英文，时区获取失败时回退 UTC，外观跟随系统；手动偏好优先。

## 分组 `groups`

每个大分组必须有 `id`、`name`、`source`、`subgroups`，可选 `logo` 和 `monitors`。每个子分组有独立的 `id`、`name`、可选 `logo`，再按来源填写选择规则。Logo 不继承。

- 大分组 ID 全站唯一，子分组 ID 在组内唯一；只用小写字母、数字和连字符，子分组不能使用保留 ID `all`。
- 大分组各自绑定一个来源，允许配置多个同类型来源。未被任何子组选中的监控不会公开。
- 分组按配置顺序排列。默认打开第一个大分组的“全部”；“全部”按子组顺序合并，重复监控保留第一次出现的位置。
- 子组的 `order` 可列出优先显示的监控 ID；未列出的监控，Peekaping 保留上游顺序，UptimeRobot 按 `monitorIds` 顺序。UptimeRobot 显式选择时，`order` 必须来自本子组的 `monitorIds`；使用 `*` 时可填写具体 ID，不能把 `*` 作为排序 ID。
- 同一监控可加入多个子组；跨大分组的相同 ID 独立处理。

以下两段分别是 `groups[]` 的一个完整元素，完整配置见默认文件。

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

`baseUrl` 是实例地址，必须为 HTTPS，不能带凭证、查询参数或片段。`slug` 是上游公开状态页别名，不是本站子组 ID。本站只展示这些状态页列出的监控。

### UptimeRobot

```json
{
  "id": "external",
  "name": "外部服务",
  "source": { "type": "uptimerobot", "apiKeyEnv": "UPTIMEROBOT_API_KEY" },
  "subgroups": [{ "id": "tools", "name": "工具", "monitorIds": ["123456789"] }]
}
```

监控 ID 使用字符串。`"monitorIds": ["*"]` 表示公开该 API Key 能读取的全部监控，自动分页；只支持完整的 `*`，不匹配 ID 前缀。其他子组仍可用具体 ID 独立选择。新增监控也会自动公开；需要限定公开范围时请使用具体 ID。API Key 必须能读取选中的监控。

### 覆盖监控显示内容

在所属大分组中添加 `monitors`，键是上游监控 ID；只修改展示，不扩大公开范围：

```json
{
  "monitors": {
    "123456789": { "name": "主页", "logo": "/web.svg", "description": "公开网站" }
  }
}
```

上述三个覆盖字段均可省略。同一大分组各子组共用覆盖；详情链接不受改名影响。

## API Key 与公开内容

`apiKeyEnv` 只填环境变量名，例如 `PEEKAPING_API_KEY`；实际值在 EO 项目环境变量中设置，不能填进 JSON 或使用 `VITE_` 前缀。多个连接可引用不同变量名。

网站设置、组名称和 Logo 进入静态页面；连接地址、选择规则和密钥变量名只用于函数。但提交到公开仓库的配置仍可被他人阅读，接口返回的监控数据也全部公开。

## 可选 KV `cache`

默认 `"cache": {}`，不启用 KV，仍可通过节点缓存和实时请求运行。KV 仅用于跨节点复用短期成功快照，不保存长期历史。

### 开通与绑定

1. 在 Makers 控制台进入 **存储 → KV**，首次使用按页面提示开通服务。
2. 创建命名空间，例如 `uptimepage-cache`。项目对空间名称没有特殊要求，遵守控制台的命名规则即可；建议为本站单独创建一个空空间。
3. 进入 **本站项目 → KV 存储 → 绑定命名空间**，选择刚创建的空间，将 **变量名 / Variable Name** 填为 `UPTIMEPAGE_KV`。
4. 在 `config/site.json` 顶层设置 `"cache": {"kvBinding":"UPTIMEPAGE_KV"}`，提交推送并重新部署。绑定变更也应重新部署后再检查。

| 名称         | 示例               | 填在哪里                                                          |
| ------------ | ------------------ | ----------------------------------------------------------------- |
| 命名空间名称 | `uptimepage-cache` | 控制台创建空间时填写，用于识别空间                                |
| 绑定变量名   | `UPTIMEPAGE_KV`    | 项目绑定空间时填写，必须与 `cache.kvBinding` 完全一致，区分大小写 |
| 命名空间 ID  | 平台自动生成       | 不填进本站 JSON，也不填作绑定变量名                               |

绑定变量名只能使用英文字母、数字和下划线，且不能以数字开头。它是 KV 资源绑定，不是普通文本环境变量；不要在“环境变量”里把 `UPTIMEPAGE_KV` 设置为空间名称、ID 或密钥。不需要为项目另配 KV Token，也不需要修改 `edgeone.json`。

### 创建后需要做什么

- **无需初始化数据**：不用手动添加 Key、Value、表或索引；成功取数后程序自动写入 `uptimepage_` 开头的记录。
- **无需设置 TTL**：程序在记录中保存有效期，监控数据最多保留 5 分钟，Peekaping 子组成员名单复用 10 分钟；失效记录可能仍显示在控制台，但不会被继续使用。配置变更会校验版本，同一路由覆盖原记录；已删除路由留下的记录可手动清理。
- **确认是否生效**：重新部署后访问本站 API 或首页，再到空间记录列表查看是否出现上述记录。若一直没有，先核对项目绑定及变量名；页面正常不能单独证明 KV 已启用，因为绑定缺失、读写失败或超时都会自动降级。
- **停止使用**：将配置改回 `"cache": {}` 并重新部署，再按需解绑。删除缓存记录不会删除来源监控，后续成功请求会重新生成缓存。

KV 为最终一致性存储，不保证跨节点立即读到最新记录。空间容量和读写额度以当前套餐为准，具体步骤见 [Makers 官方 KV 文档](https://pages.edgeone.ai/zh/document/kv-storage)，项目缓存规则见[数据与接口](data-api.md#读取与缓存)。
