# EdgeOne 聚合运行时调整计划

> 使用 executing-plans 在本会话执行，结束后进行独立审查。

**目标：** 首页保留一次请求，在 EdgeOne 单次 64 次 fetch 限制下完整获取大量监控。

**架构：** 公开 API 迁至 EdgeOne Cloud Functions，继续复用鉴权、取数和契约。Edge Functions 只处理缓存，通过带有效期的 HMAC 请求连接云函数，保留节点缓存和可选 KV。前端仍为静态产物，不新增用户密钥配置。

**技术栈：** TypeScript、Web Crypto、现有 React / Vite 与 EdgeOne。

**规格：** `docs/superpowers/specs/2026-10-20-uptimepage-foundation-design.md`；浏览器一次加载为本轮明确要求。

## 约束与审查重点

- 状态页只取公开成员 ID；实际值必须鉴权查询。名单校验先于详情缓存。
- 缓存桥只接受同部署签名，拒绝过期、篡改、跨版本和外域缓存键；不透传秘密与异常正文。
- KV 故障、未绑定、缓存桥超时均不能阻止取数；保留原有 10 分钟名单和 30 秒 / 5 分钟状态口径。
- 不修改生产凭据或实际配置；cloud 子组按用户要求留空，不再核实 ID。
- 不人为限制监控项数；仍受平台执行时长、响应体和来源额度约束。

## 任务

### 1. 受限平台回归与缓存桥

文件：`src/server/cache-bridge.ts`、`src/server/memory-cache.ts`、`edge-functions/_uptimepage/cache.ts`、对应单元测试。

- [x] 先验证旧边缘入口在 64 次 fetch 后无法返回全部 50 项。
- [x] 添加缓存读写、无 KV / 故障回退、签名篡改 / 过期 / 跨版本 / 错误路径的失败测试。
- [x] 实现有界内存缓存与缓存桥；认证使用已有来源凭据派生，不新增配置。
- [x] 定向测试通过。缓存桥和新入口相互依赖，合成一次可部署的原子提交。

### 2. 云函数入口与完整数据验证

文件：`cloud-functions/api/v1/[[default]].ts`、`src/server/cloud-runtime.ts`、`tests/unit/server/*entry*.test.ts`、`tsconfig.json`、`package.json`。

- [x] 先验证新入口可在独立缓存函数每次最多 64 次 fetch 的条件下返回 50 / 200 项、保留一次浏览器请求与公开字段隔离。
- [x] 迁移入口；内存优先读取状态，成员优先读取远端 KV；缓存失败降级。
- [x] 单测、类型、构建、公开隔离和浏览器回归通过；独立审查发现的回退预算问题已修复并复核。

### 3. 平台验收与文档

文件：`README.md`、`docs/deployment.md`、`docs/data-api.md`、`docs/development.md`、基础设计及验收状态。

- [x] 更新实际部署目录、运行限制和缓存流程，不添加冗长背景。
- [ ] 部署后验证完整双来源快照与长周期；核实 KV 记录和可用平台指标。
- [ ] 验收已知故障、手机与偏好菜单；缺少独立测试环境的部分明确记录，不能写成通过。

Ruling: 本轮用户已授权独立完成规划、修复和部署，不重复请求实现方式或推送确认；先在隔离 worktree 验证，再集成 master。
