# 配置

默认读取 [config/site.json](../config/site.json)。修改后重新构建、部署。

## 网站

`site` 在构建时生成静态页面内容。

| 字段 | 用途 |
| --- | --- |
| `name` | 网站名称 |
| `logo` | Logo 的本地路径或 HTTPS 地址，可省略 |
| `nav` | 导航链接，如 `[{"label":"Blog","href":"https://example.com"}]` |
| `footer` | 页脚右侧纯文本，不解析 HTML / Markdown |
| `refreshIntervalSeconds` | 默认刷新间隔，默认 `60`，`0` 仅手动 |
| `pinAbnormal` | 是否默认异常优先，默认 `false` |

文字支持通用字符串或 `{"en":"Services","zh-CN":"服务"}`，多语言对象必须有英文。导航、Logo 支持 `/logo.svg` 这样的本地路径，文件放在 `public/`；外部地址使用 HTTPS。

页脚左侧固定为 `Powered by UptimePage 短hash | TomyJan`，不能通过 `footer` 覆盖。hash 在构建时从 Git 注入，源码归档构建可设置 `UPTIMEPAGE_COMMIT`；没有提交信息时显示 `dev`。

## 分组

每个 `groups[]` 是独立大分组，绑定一个来源；同类型来源可以配置多次。大分组和子分组都有自己的 `id/name/logo`，Logo 不相互继承。

- ID 只用小写字母、数字和连字符。大分组 ID 全站唯一，子分组 ID 组内唯一；`all` 保留给自动生成的“全部”。
- 分组按配置顺序显示，首次选择第一个大分组的“全部”。
- 同一监控可以出现在多个子分组，“全部”按 ID 去重；不同大分组的相同 ID 独立处理。
- `order` 可指定子组中的监控顺序；未列出的监控跟在后面。UptimeRobot 的 `order` 只能包含本子组选中的 ID。
- `monitors` 是大分组内按上游 ID 定义的展示覆盖，支持 `name/logo/description`；不会因此增加公开监控。

```json
{
  "id": "core",
  "name": { "en": "Our services", "zh-CN": "自有服务" },
  "source": {
    "type": "peekaping",
    "baseUrl": "https://monitor.example.com",
    "apiKeyEnv": "PEEKAPING_API_KEY"
  },
  "subgroups": [
    { "id": "web", "name": "Web", "slug": "web", "order": ["public-monitor-id"] }
  ],
  "monitors": {
    "public-monitor-id": { "name": "Homepage", "description": "Public website", "logo": "/web.svg" }
  }
}
```

这是 `groups[]` 的一个元素，完整根结构见示例配置。

### Peekaping

每个大分组填写 `baseUrl` 和 `apiKeyEnv`。地址必须为 HTTPS，不能带用户名、密码、查询参数或片段。

子分组的 `slug` 是 Peekaping 状态页别名，不是本站 ID。本站只展示这些状态页列出的监控；API Key 保存在 EdgeOne 服务端。当前使用状态页返回的最近心跳，不补取长期历史或 TLS 信息。

### UptimeRobot

`source` 填写 `{"type":"uptimerobot","apiKeyEnv":"UPTIMEROBOT_API_KEY"}`。子分组选中监控 ID：

```json
{ "id": "tools", "name": "Tools", "monitorIds": ["123456789", "987654321"] }
```

ID 使用字符串。密钥必须能读取选中监控。本站通过服务端 v2 `getMonitors` 请求数据，详情历史能力取决于上游套餐。

## 密钥与本地配置

JSON 只填 `apiKeyEnv` 变量名，不能填实际密钥。变量名和值在 EdgeOne 的服务端函数环境中设置，不能使用 `VITE_` 前缀公开给浏览器。变量参考见 [.env.example](../.env.example)，构建脚本不会自动加载 `.env` 文件。

本地私有配置可保存为 `config/site.local.json`，通过 `UPTIMEPAGE_CONFIG` 指定。Git 部署不会上传被忽略的文件：平台使用的配置文件必须在构建环境中实际存在；个人配置可放在私有仓库。

公开名称、Logo、导航和网站设置进入前端静态产物；连接地址、环境变量引用和选择规则只进入函数配置。所有监控响应都是公开数据，描述中不要填写私密内容。

## 可选 KV

默认 `"cache": {}`，不依赖 KV。

使用时创建 EdgeOne KV 命名空间并绑定到项目，再在根配置填写 `"cache": {"kvBinding":"UPTIMEPAGE_KV"}`。名称必须与平台绑定一致；它不是文本环境变量。KV 故障时继续使用节点缓存或实时来源。

## 检查配置

```sh
pnpm run generate
```

错误会指出配置路径。构建校验不访问上游；地址、别名、密钥和监控 ID 是否有效要在预览环境验证。
