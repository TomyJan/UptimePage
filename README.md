# UptimePage

UptimePage 是一个部署在 EdgeOne Makers 上的现代状态页，支持聚合多个监控来源，清晰展示服务状态与历史数据。

UptimePage is a modern status page for EdgeOne Makers, aggregating multiple monitoring sources to clearly display service status and historical data.

目前支持 Peekaping 和 UptimeRobot；监控检查与告警由上游负责。

[在线状态页](https://status.tomys.top/) · [可视化配置编辑器](https://status.tomys.top/?configeditor=on)

- 多来源、两级分组、搜索与独立监控详情。
- 独立名称 / Logo、自动获取网站图标、自定义导航及按全局 / 分组 / 子组控制的监控网站链接。
- 24 小时 / 7 天 / 30 天历史、响应曲线、可用率、事件及来源提供的证书信息。
- 简中 / 英文、时区、深浅色、自动刷新；实例缓存、节点缓存和可选 KV。
- 可选编译的配置编辑器，表单 / JSON 双向编辑，实时模拟预览与导入导出。

历史与证书能力取决于来源套餐和保留期，缺失数据不补造。

## 功能边界

本站只负责展示，不执行监控、发送告警或长期保存历史。编辑器不在线写回配置、不自动部署，也不读取真实来源来选择监控。其他监控来源和其他部署平台尚未适配。

配置不限制分组或监控数量，但容量并非无限；Peekaping 冷加载需要按监控查询，上游延迟、配额与 EO 执行限制仍会影响耗时。具体口径与限制见[数据与接口](docs/data-api.md)。

## 部署

1. Fork 仓库，在[编辑器](https://status.tomys.top/?configeditor=on)中生成配置，或参考 [config/default.json](config/default.json)。将 JSON 放在独立配置分支或自行托管，取得 HTTPS 直链。
2. 在 EdgeOne Makers 导入代码部署分支（通常为 `master`），使用仓库根目录及 `edgeone.json` 的构建设置；添加构建环境变量 `UPTIMEPAGE_CONFIG`，值为配置 JSON 直链。
3. 在函数环境变量中设置配置的 `apiKeyEnv` 所引用的 API Key，部署后核对真实数据。

配置中只填密钥变量名，不填密钥值。默认配置含占位地址和 ID，不能直接用于生产。部署包含静态资源、云函数及边缘缓存函数，不能只上传 `dist/`。

GitHub 直链会先通过 [ghfast](https://ghfast.top) 加载，失败后直连 GitHub，两次均失败则终止构建。配置只在构建时读取，更新后需重新部署状态页。

[部署与环境变量](docs/deployment.md) · [配置字段与 KV](docs/configuration.md) · [排错](docs/troubleshooting.md)

## 本地预览

使用 `package.json` 声明的 Node.js 和 pnpm 版本：

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run dev:demo
```

演示使用模拟数据；本地编辑器和真实数据联调见[开发文档](docs/development.md)。

## 文档

- [数据、来源能力与 HTTP API](docs/data-api.md)
- [开发与测试](docs/development.md)
- [发布检查](docs/release.md)

`master` 为当前版本，`legacy` 保留旧实现。许可证：[MPL-2.0](LICENSE)；第三方归属见 [NOTICE](NOTICE)。
