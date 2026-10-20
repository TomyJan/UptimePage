# UptimePage 生产数据链路实现计划

> **面向 AI 代理的工作者：** 使用 executing-plans 逐任务实现本计划。每个任务独立验证并原子化提交。

**目标：** 为现有静态前端接入可在 EdgeOne Makers 运行的只读数据接口，安全支持 Peekaping 与 UptimeRobot，并提供节点缓存和可选 KV 降级。

**架构：** EdgeOne 函数只接受受限的组、监控和范围参数，读取构建生成的服务端配置与环境变量，调用来源适配器后转换为现有 `src/shared/contracts.ts` 契约。公开配置版本参与缓存键；缓存只保存短期成功快照，失败时明确标记旧数据。

**技术栈：** TypeScript、Web Fetch API、Zod、EdgeOne Functions；继续使用 pnpm、现有契约和现有测试工具。

**规格：** `docs/superpowers/specs/2026-10-20-uptimepage-foundation-design.md`、`docs/superpowers/plans/2026-10-21-uptimepage-frontend.md`。

## 全局约束

- API Key 只从 EdgeOne 服务端环境变量读取，不能进入浏览器资源或日志。
- 浏览器不能指定上游 URL、任意路径、凭证或未公开的监控。
- Peekaping 每个大分组使用一个 API Key，子分组使用状态页别名限制公开监控。
- UptimeRobot 子分组使用配置中的监控 ID 列表；分页必须完整处理。
- 上游请求失败与监控故障分开表达；缺失值保持 `null`。
- 缓存按配置版本、来源、大分组、监控和查询范围隔离；KV 为可选降级。
- EdgeOne 平台预览必须验证函数路由、环境变量、缓存、深层路由和跨源限制。

## 审查重点

1. 恶意组 ID、监控 ID、范围和上游 URL不能越过配置公开范围。
2. 401/403、限流、上游超时、部分失败不能被伪装成监控故障或正常状态。
3. Peekaping 状态页名单失效时不能因详情缓存扩大公开集合。
4. UptimeRobot 分页、重复监控和跨组同 ID 不能漏项或串缓存。
5. 新配置版本不能复用旧缓存中的已移除监控；KV 故障必须继续使用节点缓存或实时请求。

## 文件与职责

| 文件 / 目录                         | 职责                                         |
| ----------------------------------- | -------------------------------------------- |
| `src/server/config.ts`              | 读取生成的服务端配置、环境变量和公开范围索引 |
| `src/server/sources/types.ts`       | 来源适配器输入、分页和统一中间结构           |
| `src/server/sources/peekaping.ts`   | Peekaping 状态页与监控详情请求、名单过滤     |
| `src/server/sources/uptimerobot.ts` | UptimeRobot 表单 API、分页和监控选择         |
| `src/server/contract.ts`            | 统一快照、详情和错误响应构造                 |
| `src/server/cache.ts`               | Cache API 与可选 KV 的短期快照封装           |
| `functions/api/v1/**`               | EdgeOne HTTP 路由和参数校验                  |
| `tests/unit/server/**`              | 配置、来源、缓存和安全边界测试               |
| `tests/e2e/production-api.spec.ts`  | 生产预览 HTTP 路由与降级验证                 |
| `edgeone.json`                      | 函数入口、静态输出和 SPA fallback 配置       |

## 任务

### 任务 1：服务端配置与公开范围解析

- [x] 为服务端配置建立严格类型和公开监控索引。
- [x] 先写测试覆盖环境变量缺失、重复选择、跨组同 ID 和配置版本。
- [x] 提交 `feat(服务端): 建立配置与公开范围边界`。

### 任务 2：来源适配器

- [x] 先写 Peekaping 与 UptimeRobot 的真实请求、分页、超时和字段映射测试。
- [x] UptimeRobot 详情请求响应时间采样与故障日志，并映射到统一历史契约。
- [x] 实现统一来源请求和字段映射，所有上游错误映射到公共错误码。
- [x] 提交 `feat(来源): 添加 Peekaping 与 UptimeRobot 请求客户端` 和 `feat(来源): 统一监控数据并组装分组快照`。

### 任务 3：缓存与 EdgeOne 路由

- [x] 实现节点 Cache API 和配置版本隔离的短期快照策略。
- [x] 实现组快照与监控详情路由，严格检查公开范围和查询范围。
- [x] 提交 `feat(接口): 添加 EdgeOne 只读监控接口` 和 `feat(缓存): 添加配置版本隔离的边缘缓存`。
- [x] 接入可选 KV，并验证 KV 故障时的降级路径。

### 任务 4：平台预览与上线门禁

- [ ] 更新 EdgeOne 配置、环境变量说明和生产预览测试。
- [ ] 验证无 KV、KV 故障、上游限流、深层路由和公私配置隔离。
- [ ] 提交 `chore(部署): 完成 EdgeOne 预览验证`。

本次生产审查已修复来源字段、历史语义、名单与缓存降级，并完成本地单元及浏览器回归。首页使用上游聚合采样，原始详情按需获取。实际 EdgeOne 预览和真实来源联调尚未执行，以上平台任务保持未完成；具体边界见[生产审查记录](../../production-review.md)。
