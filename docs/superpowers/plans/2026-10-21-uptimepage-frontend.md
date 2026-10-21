# UptimePage 正式前端（第一阶段）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 executing-plans 逐任务实现此计划。步骤使用复选框跟踪进度。本计划建议在当前会话原生执行，保持当前 `master` 的原子化提交习惯。

**目标：** 将已确认的 A 原型变为可运行、可构建的 React 前端，完成配置边界、数据契约和页面交互，为真实接口接入提供稳定基础。

**架构：** 网站设置在构建时生成静态公开模块，连接和选择规则独立生成服务端模块。页面只依赖统一数据契约与同源 API 客户端；本地演示通过单独的开发客户端注入数据，不在生产构建中携带模拟数据。交互按页面与职责拆为组件，不保留原型的全局可变变量与 DOM 字符串拼接。

**技术栈：** React、Vite、TypeScript、Tailwind CSS、React Router、TanStack Query、Zod、Radix、Lucide；Vitest、Testing Library 和 Playwright。使用 pnpm 和冻结锁文件；具体版本以 `package.json`、`pnpm-lock.yaml`、`edgeone.json` 为准。本计划是第一阶段实施记录，当前运行方式见[开发说明](../../development.md)。

**规格：** [基础架构](../specs/2026-10-20-uptimepage-foundation-design.md)、[已确认页面设计](../specs/2026-10-21-uptimepage-ui-design.md)、[HTML 视觉基准](../../../design/prototypes/refined-a.html)（确认提交 `4d313b1`）。

后续配置调整：原示例已移到 `config/default.json`，`config/site.json` 改为可提交的实际配置，不存在才回退默认文件；仍支持 `UPTIMEPAGE_CONFIG` 显式指定。以下保留第一阶段实施记录，当前用法见[配置说明](../../configuration.md)。

## 全局约束

- 完全重写，不读取或参考 `legacy` 分支的技术实现。
- 只面向 EdgeOne Makers；前端静态产物，运行时数据由本站只读接口提供。
- 首发来源为 Peekaping 和 UptimeRobot；本阶段不调用真实来源，不要求提供实际密钥。
- 不增加管理页、配置编辑器、访客登录、监控调度、告警或长期历史库。
- 来源、分组和监控数量没有配置层面的固定上限。
- 浏览器首选语言匹配简中或英文，无法匹配回退英文；时区回退 UTC，主题跟随系统，手动偏好可恢复自动。
- 保持鸢尾主题、固定绿色历史、现有页面布局与动效；只补规格列出的加载、错误和缺失能力场景。
- 生产构建不包含密钥、服务端连接配置、私有选择规则或演示数据；不添加设计工具栏。
- 本阶段的演示验证不代表真实来源或 EdgeOne 环境已经通过验证。

## 审查重点（Review Focus）

1. 配置含私有连接、环境变量引用或选择规则：这些值不能进入浏览器模块、资源或 sourcemap；任务 1、7 检查。
2. 未知 / 过期 / 缺失数据：不能显示成当前正常、0 ms、0% 或覆盖完整一天；任务 1、4、5 检查。
3. 同一个上游 ID 出现在不同大分组，或同组多个子分组：缓存键不能串组，“全部”只在组内去重；任务 3、4 检查。
4. 快速切组、切范围、刷新、返回以及请求乱序：最后一次选择决定页面，旧请求不能覆盖新结果；任务 3、5、6 检查。
5. 多条通知与短屏 / 键盘操作：保留最新、没有旧消息补回或焦点悬空，回顶不遮住通知；任务 6、7 检查。

## 文件与职责

| 文件 / 目录 | 职责 |
| --- | --- |
| `config/site.json`、`config/schema.ts` | 可提交的无密钥示例配置、构建校验与公私拆分 |
| `scripts/build-config.ts`、`.generated/` | 生成独立公开 / 服务端配置及配置版本，生成物不提交 |
| `src/shared/contracts.ts`、`src/shared/config.ts` | 页面 API 数据契约、公开配置类型；不引用服务端模块 |
| `src/app/`、`src/styles/` | 应用入口、路由、Provider、主题与动效变量 |
| `src/features/preferences/` | 语言、时区、外观及刷新偏好 |
| `src/features/status/` | 分组、摘要、列表、搜索、历史与可用率 |
| `src/features/monitor/` | 详情指标、曲线、事件与信息 |
| `src/features/refresh/` | 单一刷新调度和一体按钮 |
| `src/features/toasts/`、`src/features/scroll/` | 通知替换、导航滚动、回顶 |
| `src/components/` | 语义化行卡、菜单、提示和状态基础组件 |
| `src/data/`、`src/demo/` | 同源客户端、查询键；仅开发模式的演示客户端与固定样例 |
| `tests/unit/`、`tests/e2e/` | 纯逻辑 / 组件行为验证，整页交互与视觉验收 |
| `edgeone.json` | 静态输出及 SPA fallback；正式函数留到第二阶段 |

## 接口约定

以下为本阶段要实现的确切边界；第二阶段实现相同的 HTTP 契约，不能反向让页面依赖上游响应。

```ts
type Locale = 'zh-CN' | 'en';
type LocalizedText = string | { en: string; 'zh-CN'?: string };
type MonitorState = 'operational' | 'down' | 'pending' | 'maintenance' | 'paused' | 'unknown';
type Freshness = 'fresh' | 'stale' | 'unavailable';
type HistoryState = MonitorState | 'partial' | 'no-data';
type Range = '24h' | '7d' | '30d';
type ApiErrorCode = 'not-found' | 'unavailable' | 'rate-limited' | 'invalid-response';
type Capability = 'available' | 'unsupported' | 'unavailable';
interface Metric {
  value: number | null; // 0 是有效值，null 才是缺失
  from: string | null; until: string | null; // UTC ISO 8601
  basis: 'provider' | 'observed-samples';
}
interface HistoryBucket { from: string; until: string; state: HistoryState; responseMs: number | null }
interface MonitorSummary {
  id: string; groupId: string; subgroupIds: string[];
  name: LocalizedText; logo: string | null; description: LocalizedText | null;
  state: MonitorState; freshness: Freshness; observedAt: string | null;
  responseMs: number | null; uptime24h: Metric;
  history: HistoryBucket[]; // 未覆盖时间不补成 operational
}
interface GroupSnapshot {
  groupId: string; fetchedAt: string; configVersion: string;
  freshness: Freshness; monitors: MonitorSummary[];
  subgroups: { id: string; monitorIds: string[]; freshness: Freshness }[]; // 保留各子组自己的顺序
  subgroupErrors: { subgroupId: string; code: ApiErrorCode }[];
}
interface MonitorDetail {
  monitor: MonitorSummary; fetchedAt: string; configVersion: string; range: Range;
  averageResponse24h: Metric; certificateExpiresAt: string | null;
  supportedRanges: Range[];
  capabilities: { history: Capability; response: Capability; events: Capability; certificate: Capability };
  response: { at: string; valueMs: number | null }[];
  events: { id: string; from: string; until: string | null; state: MonitorState }[];
  type: string | null; intervalSeconds: number | null;
}
interface ApiClient {
  getGroup(groupId: string, signal: AbortSignal): Promise<GroupSnapshot>;
  getMonitor(groupId: string, monitorId: string, range: Range, signal: AbortSignal): Promise<MonitorDetail>;
}
```

- 同源端点：`GET /api/v1/groups/:groupId` 和 `GET /api/v1/groups/:groupId/monitors/:monitorId?range=24h|7d|30d`。成功返回契约对象；失败返回 `{error:{code:ApiErrorCode,retryAt:string|null}}`。只读接口不接受浏览器提交的上游 URL 或凭证。
- `ApiClientError` 只暴露 `code`、`retryAt`，不向页面透传上游错误。401 / 403 / 404 对详情统一按不可用处理并移除旧缓存；429 按 `retryAt` 暂缓自动请求。
- 查询键分别为 `['group', configVersion, groupId]`、`['monitor', configVersion, groupId, monitorId, range]`，不以名称或单独上游 ID 为键。
- 配置根为 `{site, groups}`；`site` 包含 `name/logo/nav/footer/refreshIntervalSeconds/pinAbnormal`。`footer` 仅是右侧自定义内容，左侧固定署名和构建短 hash 由构建时注入。每个组包含 `id/name/logo/source/subgroups/monitors`；`source.type` 为 `peekaping`（`baseUrl,apiKeyEnv`）或 `uptimerobot`（`apiKeyEnv`），子分组选择器分别为状态页 `slug` 或 `monitorIds`。
- `monitors` 为按上游 ID 索引的展示覆盖 `{name?,logo?,description?}`；子分组可配置 `order: string[]`。静态公开模块只包含站点设置、组和子组的 ID / 名称 / Logo、配置版本；选择器、上游 ID 清单、覆盖规则、连接和密钥引用仅进入服务端模块。
- 组 ID 和子组 ID 用非空小写字母 / 数字 / 连字符，子组 `all` 为保留值；上游 ID 当作不透明字符串，不要求数字或 MongoDB 格式。多语言对象必须提供英文回退。Logo 只允许本地资源路径或 HTTPS URL。
- 默认配置路径 `config/site.json`，可用 `UPTIMEPAGE_CONFIG` 指向被忽略的 `*.local.json`。实际密钥在边缘运行时解析，不在构建时读取。

## 任务 1：配置编译和统一契约

**文件：** 创建 `package.json`、锁文件、`tsconfig.json`、`vitest.config.ts`、`config/site.json`、`config/schema.ts`、`scripts/build-config.ts`、`src/shared/config.ts`、`src/shared/contracts.ts`、`tests/unit/config.test.ts`、`tests/unit/contracts.test.ts`；修改 `.gitignore` 忽略 `.generated/`。

- [x] **步骤 1：建立最小 TypeScript / Vitest 工具配置并写失败测试。** `splitConfig_doesNotExposeServerFields` 使用 `private.example.test`、`PRIVATE_PEEK_KEY` 和私有 slug 作为哨兵，断言公开结果均不包含；`validateConfig_reportsPath` 覆盖重复组 ID、重复子组 ID、保留 `all`、错误引用、非法 Logo 和根 `groups` 为空；重复跨子组监控合法。契约测试验证 `responseMs:0` 与 `null` 保持区别。
- [x] **步骤 2：运行 `pnpm test tests/unit/config.test.ts tests/unit/contracts.test.ts`，确认因实现缺失失败。** 配置错误必须包含 JSON 路径，不是联网错误。
- [x] **步骤 3：实现 `parseConfig(input:unknown):SiteConfig`、`splitConfig(config:SiteConfig):{publicConfig:PublicConfig;serverConfig:ServerConfig}` 和上面的契约。** 构建脚本用 Node 内置 TS 擦除运行、`node:crypto` 生成规范化配置的 SHA-256 版本，不取实际密钥，不联网，写入两个不同生成文件；不创建同时导出公私配置的 barrel。
- [x] **步骤 4：运行上述测试、`pnpm run generate` 和 `pnpm run typecheck`，确认通过且示例可编译。** pnpm 脚本提供 `generate/typecheck/test`；后续任务补 `dev:demo/build/preview/test:e2e`。
- [x] **步骤 5：提交 `feat(配置): 添加配置校验与公开数据契约`。**

## 任务 2：可运行的应用外壳与访客偏好

**文件：** 创建 `index.html`、`vite.config.ts`、`src/main.tsx`、`src/app/App.tsx`、`src/app/providers.tsx`、`src/styles/tokens.css`、`src/styles/global.css`、`src/features/preferences/{store.ts,locale.ts,PreferencesMenu.tsx}`、`src/components/{Dropdown.tsx,StatusBadge.tsx}`、`tests/unit/preferences.test.ts`、`tests/e2e/shell.spec.ts`、`playwright.config.ts`。

- [x] **步骤 1：写失败测试。** `resolveLocale(['fr-FR','zh-Hant','en-US'])` 回退英文，`['zh-CN','en']` 取简中，`['zh-SG']` 取简中；繁中不误当简中。无 Intl 时区 / 非法持久化时区回退 UTC；localStorage 不可用、JSON 损坏不能使页面崩溃。E2E 验证三个菜单的键盘选择、Esc 和焦点恢复。
- [x] **步骤 2：运行 `pnpm test tests/unit/preferences.test.ts`，确认规则尚未实现时失败。**
- [x] **步骤 3：实现 `resolveLocale(languages:readonly string[]):Locale`、`resolveTimeZone(preference:string|null):string` 和偏好 Store。** 使用 `navigator.languages` 顺序；`zh`、`zh-CN`、`zh-SG`、`zh-Hans` 及其地区变体匹配简中；英文含地区变体均匹配英文。主题首屏初始化避免闪色，`auto` 监听浏览器变化。用 Radix 做自绘菜单；从原型提取 Token，不引入原型工具栏。Router 配置首页、详情和不可用页，展示静态导航 / 页脚。
- [x] **步骤 4：运行单元测试、`pnpm run test:e2e -- tests/e2e/shell.spec.ts`、`pnpm run build`，确认页面可运行、菜单无原生 select / title。** `build` 按 `generate → typecheck → vite build` 执行；构建中不导入服务端配置。
- [x] **步骤 5：提交 `feat(界面): 建立应用外壳与访客偏好`。**

## 任务 3：同源客户端、开发数据与刷新调度

**文件：** 创建 `src/data/{client.ts,queries.ts}`、`src/demo/{client.ts,fixtures.ts}`、`scripts/dev-demo.mjs`、`src/features/refresh/{useRefresh.ts,RefreshControl.tsx}`、`tests/unit/{client.test.ts,refresh.test.tsx}`、`tests/e2e/refresh.spec.ts`；修改 `src/app/providers.tsx`。

- [x] **步骤 1：写失败测试。** 按契约编码 ID；相同监控 ID 不同组的查询键不同；切组取消旧请求，迟到响应不串组。使用假时钟检查 60 秒自动、手动完成重置、后台暂停 / 恢复补一次、0 关闭、429 暂缓，以及失败不伪造新的成功更新时间。
- [x] **步骤 2：运行 `pnpm test tests/unit/client.test.ts tests/unit/refresh.test.tsx`，确认失败来自未实现行为。**
- [x] **步骤 3：实现 `createHttpClient(basePath:'/api/v1'):ApiClient`、上述查询键与 `useRefresh`。** 用 fetch + AbortSignal 和契约校验；刷新由一个调度器驱动，TanStack 自带重复轮询 / 自动聚焦重取关闭，当前查询并发合并。开发入口仅在 `import.meta.env.DEV && import.meta.env.VITE_DEMO==='true'` 动态加载 `src/demo/client.ts`。演示时间固定，模拟正常、缺失、部分失败、过期、限流与乱序，数据中加入唯一哨兵 `UPTIMEPAGE_DEMO_ONLY`。
- [x] **步骤 4：运行上述单元测试和 `pnpm run test:e2e -- tests/e2e/refresh.spec.ts`。** `pnpm run dev:demo` 通过跨平台 `scripts/dev-demo.mjs` 设置标志并启动 Vite，无需真实密钥。只自动刷新当前组或当前详情；刷新频率菜单及倒计时符合页面规格。
- [x] **步骤 5：提交 `feat(数据): 添加页面客户端与统一刷新调度`。**

## 任务 4：首页、分组和历史组件

**文件：** 创建 `src/features/status/{StatusPage.tsx,GroupTabs.tsx,StatusSummary.tsx,MonitorList.tsx,selectors.ts,HistoryBars.tsx}`、`src/components/{MonitorCard.tsx,DataTooltip.tsx}`、`tests/unit/{selectors.test.ts,history.test.tsx}`、`tests/e2e/home.spec.ts`。

- [x] **步骤 1：写失败测试。** 首组 / 全部默认、同组去重且首次位置保留、跨组不合并、名称覆盖一致、不同子组的独立顺序、稳定异常排序；空查询、空子组、部分失败分别反馈。过期正常不计当前正常，未覆盖历史不得变绿；0% 和缺失的显示不同。
- [x] **步骤 2：运行 `pnpm test tests/unit/selectors.test.ts tests/unit/history.test.tsx`，确认失败。**
- [x] **步骤 3：实现 `selectMonitors(snapshot:GroupSnapshot,subgroupId:string,query:string,pinAbnormal:boolean):MonitorSummary[]` 和页面组件。** “全部”使用 `snapshot.monitors` 的服务端合并顺序，子组使用 `snapshot.subgroups[].monitorIds` 的独立顺序；前端只做选择、搜索与稳定排序。历史组件按 UTC 区间绘制，保留缺口；自定义提示立即出现、随条块更新，可键盘和触屏操作。行卡采用独立的详情链接与历史控件，禁止可交互元素嵌套在链接内。
- [x] **步骤 4：运行上述测试和 `pnpm run test:e2e -- tests/e2e/home.spec.ts`。** 固定样例对照原型；切换 200 条样例不截断数据，320 px 不横向溢出；两类分组显示各自的名称和 Logo。
- [x] **步骤 5：提交 `feat(首页): 实现分组与监控行卡`。**

## 任务 5：详情、真实口径的曲线和缺失能力

**文件：** 创建 `src/features/monitor/{MonitorPage.tsx,MetricGrid.tsx,ResponseChart.tsx,chartGeometry.ts,MonitorEvents.tsx,MonitorFacts.tsx}`、`tests/unit/chartGeometry.test.ts`、`tests/e2e/detail.spec.ts`；修改应用路由和列表返回状态。

- [x] **步骤 1：写失败测试。** `buildResponsePaths(points,width)` 不跨 null / 时间缺口连线，插值不越相邻采样极值，首尾坐标在裁切内；详情 ID 改名仍稳定，返回保持组 / 子组 / 搜索；不支持范围禁用，404 清掉旧详情而不是继续展示旧卡片。
- [x] **步骤 2：运行 `pnpm test tests/unit/chartGeometry.test.ts`，确认失败。**
- [x] **步骤 3：实现详情及 `buildResponsePaths`。** 原生 SVG + 单调三次插值 + ResizeObserver，不引入大型图表库；按能力与覆盖范围渲染指标、事件、历史和证书。裁切揭示仅在首次进入 / 切范围播放，刷新与换主题保持曲线节点与进度。
- [x] **步骤 4：运行单元测试和 `pnpm run test:e2e -- tests/e2e/detail.spec.ts`。** 覆盖直接访问、刷新页面、返回、未知 ID、快速切范围、中英文、UTC / 非 UTC 及 320 px；检查时间只在服务信息中出现一次。
- [x] **步骤 5：提交 `feat(详情): 实现监控详情与响应趋势`。**

## 任务 6：滚动导航、通知替换与完整动效

**文件：** 创建 `src/features/scroll/{useScrollChrome.ts,BackToTop.tsx}`、`src/features/toasts/{store.ts,ToastViewport.tsx}`、`src/app/transitions.ts`、`tests/unit/toasts.test.ts`、`tests/e2e/motion.spec.ts`；修改导航、页面切换、刷新结果提示。

- [x] **步骤 1：写失败测试。** 连续 12 条仅保留最新可容纳的消息；关闭后旧消息不补回；计时、悬停 / 焦点暂停和挤出后的清理独立。E2E 检查下翻收导航、上翻展开与显示回顶，停止后保留，继续下翻 / 到顶隐藏；按钮层级高于通知且不重叠。
- [x] **步骤 2：运行 `pnpm test tests/unit/toasts.test.ts`，确认失败。**
- [x] **步骤 3：按页面规格实现 Store、滚动状态与动效。** 复用原型已验证的行为，不直接搬用全局 DOM 脚本。滚动以 rAF 合并，方向反转承接实际动画位置；Toast 使用 Portal、实际卡片高度与独立退出层，外层无背景或滚动条。React 路由使用局部页面过渡，过渡 API 不支持时淡入退化；清理 ResizeObserver、动画和计时器。
- [x] **步骤 4：运行单元测试和 `pnpm run test:e2e -- tests/e2e/motion.spec.ts`。** 覆盖快速连续菜单 / 子组 / 路由切换、通知爆发、聚焦消息被挤出、短横屏、减少动态效果和无 View Transition API；自动刷新不发 Toast。
- [x] **步骤 5：提交 `feat(交互): 完善滚动导航通知与页面动效`。**

## 任务 7：构建隔离与第一阶段验收

**文件：** 创建 `edgeone.json`、`scripts/verify-public-build.ts`、`tests/e2e/visual.spec.ts`、`docs/development.md`；修改 `README.md`、`.gitignore` 和 pnpm 验证脚本。

- [x] **步骤 1：编写构建检查。** 使用临时私有测试配置生成生产包；断言 `dist/` 的 HTML、JS、CSS、JSON、sourcemap 均没有任务 1 的哨兵、服务端配置字段和 `UPTIMEPAGE_DEMO_ONLY`。测试配置恢复在 finally 中完成，不覆盖用户本地文件。
- [x] **步骤 2：实现 `verify-public-build.ts` 与 `edgeone.json`。** 使用 `nodeVersion` 指定 Node，安装命令 `pnpm install --frozen-lockfile`，构建命令 `pnpm run build`，输出 `dist`；pnpm 版本来自 `package.json`。SPA 使用 `{"source":"/*","destination":"/index.html"}`，API 返回 HTML 时客户端必须判为无效响应。平台实际网络、函数优先级与缓存仍需预览验证。
- [x] **步骤 3：运行 `pnpm run typecheck`、`pnpm run test`、`pnpm run build`、`pnpm run verify:public-build`、`pnpm run test:e2e`。** 用 Playwright 固定时钟与样例，比较 1440 / 768 / 390 px × 中英文 × 深浅色；另外检查 320 px 和 568 × 320 横屏无页面 / 弹层溢出。截图前等待实际动画结束，不只推进 JS 假时钟。
- [x] **步骤 4：人工对照确认提交 `4d313b1` 的原型截图。** 检查层级、留白、圆角、阴影、固定绿色、曲线右端、菜单、提示、Toast 和回顶，排除布局与交互退化。文档写明 `dev:demo`、无真实接口时的行为和当前能力边界。
- [x] **步骤 5：提交 `chore(工程): 完成前端构建隔离与验收`。** 本阶段不推送、不部署；更新完成记录后进入第二阶段计划。

## 后续阶段与已核对事项

- 第二阶段才实现 `edge-functions/api/v1/`：固定来源连接、服务端公开名单、Peekaping 状态页名单 + 受限详情补取、UptimeRobot 分页 / ID 选择、节点缓存和可选 KV；随后用真实接口替换开发客户端。
- Peekaping 已核对源码提交 `9569fc0d192a5a120ccb1d75aca7ad19f9c1fd53`：认证请求头为 `X-API-Key`；有 `monitors/batch`、`heartbeats`、`stats/uptime`、`stats/points` 和 `tls`。公开状态页返回的 100 条心跳不能当全天历史；目标部署版本仍需对照验证。
- UptimeRobot 官方入口仍给出 v2 `getMonitors` 的 POST / `api_key` 示例，同时已推荐 v3；v2 / v3 详细文档本轮返回 403。第二阶段先取得可验证的详细契约再选择适配版本，不把参数、套餐历史能力和配额写成已验证事实，也不因此要求用户现在提供密钥。
- EdgeOne 使用 `edge-functions/` 文件路由、Web API、`context.env`、全局 Cache / KV 绑定与 SPA fallback。版本由配置字段选择，不使用命令引导特定版本。CPU、包体和网络限制需按上线时的官方文档及套餐在平台预览验收。
- KV 文档的示例使用绑定变量，不直接假设 `env.KV`；第二阶段封装平台绑定并校验真实运行方式。快照有效期在应用数据内记录，不假设未核实的 TTL 参数。
- 第二阶段需单独确定请求预算、缓存新鲜期 / 旧快照保留期、动态公开名单失效规则及来源版本兼容策略。本阶段的 60 秒浏览器默认不替代这些决定。

参考：[EdgeOne 函数](https://pages.edgeone.ai/zh/document/edge-functions)、[配置与 SPA fallback](https://pages.edgeone.ai/zh/document/edgeone-json)、[KV](https://pages.edgeone.ai/zh/document/kv-storage)、[Peekaping 固定版本源码](https://github.com/0xfurai/peekaping/tree/9569fc0d192a5a120ccb1d75aca7ad19f9c1fd53/apps/server/internal/modules)、[UptimeRobot API](https://uptimerobot.com/api/)。

## 计划自审记录

- 覆盖：首页、详情、配置隔离、偏好、刷新、缺失数据、菜单 / 提示、曲线、Toast、滚动与回顶均有任务和验收；真实来源、缓存 / KV 及平台部署明确留在第二阶段，没有当成本阶段已完成。
- 接口：统一使用 `groupId + monitorId` 和 `configVersion`；同名监控不会串组，`null` 与零值区别一致。UTC 时间与本地格式化职责分开。
- 依赖：先契约 / 配置，再外壳 / 客户端、页面和动效，最后产物隔离；每个任务结束都有独立可验证的交付物。
- 本文件中的运行命令是执行阶段的验收步骤，本轮尚未安装生产依赖或声称这些测试已通过。

关键断言示例（完整样例在相应任务的测试文件中建立）：

```ts
expect(JSON.stringify(splitConfig(privateFixture).publicConfig)).not.toContain('PRIVATE_PEEK_KEY');
expect(resolveLocale(['fr-FR', 'en-US'])).toBe('en');
expect(resolveLocale(['zh-SG', 'en-US'])).toBe('zh-CN');
expect(summaryFromStaleFixture.normalCount).toBe(0);
expect(latestToastMessages).toEqual(['消息 8', '消息 9', '消息 10', '消息 11', '消息 12']);
expect(await page.locator('#back-top').getAttribute('aria-hidden')).toBe('true'); // 已回顶
expect(publicBuildText).not.toContain('UPTIMEPAGE_DEMO_ONLY');
```
