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
- 子组的 `order` 可列出优先显示的监控 ID；未列出的监控，Peekaping 保留上游顺序，UptimeRobot 按 `monitorIds` 顺序。UptimeRobot 的 `order` 必须来自本子组的 `monitorIds`。
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

监控 ID 使用字符串。API Key 必须能读取选中的监控。

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

默认 `"cache": {}`，不依赖 KV。启用时在 EO 创建 KV 命名空间并绑定项目，然后填写 `"cache": {"kvBinding":"UPTIMEPAGE_KV"}`。绑定名必须一致，它不是普通文本环境变量。

KV 只存短期快照，故障会降级到节点缓存或实时取数；数据口径和缓存期限见[数据与接口](data-api.md)。
