# 页面设计与原型

已确认采用 A 精进方案与鸢尾配色。正式约束见[页面规格](../docs/superpowers/specs/2026-10-21-uptimepage-ui-design.md)和[需求与架构](../docs/superpowers/specs/2026-10-20-uptimepage-foundation-design.md)。

- [A 精进原型](prototypes/refined-a.html)：已确认的视觉基准，确认时提交为 `4d313b1`。
- [最初三方向](prototypes/homepage-directions.html)：保留作视觉对照。

两份 HTML 均可直接用浏览器打开，无需安装依赖。数据、证书、刷新及时间范围都是模拟；工具栏不属于正式页面，实际能力以[数据说明](../docs/data-api.md)为准。页脚等后续调整以页面规格和当前实现为准。

## 字体对比（待选）

- [A：MiSans + 当前等宽字体](prototypes/font-a.html)：正文使用 MiSans，数据保留系统等宽字体。
- [B：MiSans + 等宽数字](prototypes/font-b.html)：正文、数据均使用 MiSans，数字启用 `tabular-nums`。

这两份原型复用当前 React 页面与模拟客户端，须先运行 `pnpm run dev`，再访问 `/design/prototypes/font-a.html` 或 `/design/prototypes/font-b.html`；底部可切换首页 / 详情，导航栏可切换语言与主题。MiSans 复用 legacy 的自托管样式地址 `https://cdn.amoe.cc/web-static/public/font/misans/misans.css`。仅原型使用此字体，未改变正式页面。

## 配置编辑器（已确认）

- [浮动编辑器](prototypes/config-editor-floating.html)：右下角表单 / JSON 编辑、实时 mock 预览、自动贴边，以及配置导入导出。
- [原独立页方案](prototypes/config-editor-standalone.html)：保留的上一版布局，不覆盖、不替换。

浮动方案已实现，正式版使用既有前端配色与组件。使用方式见[配置文档](../docs/configuration.md#可视化编辑器)，交互基准见[设计说明](config-editor.md)。

## 参考与许可

状态页参考：[Kuma Mieru](https://github.com/alice39s/kuma-mieru)、[OpenAI Status](https://status.openai.com/)、[GitHub Status](https://www.githubstatus.com/)、[Vercel Status](https://www.vercel-status.com/)、[Cloudflare Status](https://www.cloudflarestatus.com/)。采用信息组织思路，未复制品牌素材。

通过 [OpenDesign](https://opendesign.cc/) 参考以下设计参数，并为状态页改编：

| 规范                                                                                                                 | 参考内容             |
| -------------------------------------------------------------------------------------------------------------------- | -------------------- |
| [Mercury](https://opendesign.cc/packs/mercury/spec.json)                                                             | 鸢尾强调色           |
| [Vercel](https://opendesign.cc/packs/vercel/spec.json)、[Linear](https://opendesign.cc/packs/linear/spec.json)       | 中性表面、层级和间距 |
| [Supabase](https://opendesign.cc/packs/supabase/spec.json)、[Raycast](https://opendesign.cc/packs/raycast/spec.json) | 圆角、阴影和反馈     |
| [Aesop](https://opendesign.cc/packs/aesop/spec.json)、[PostHog](https://opendesign.cc/packs/posthog/spec.json)       | 初始方向与配色比较   |

OpenDesign 规范按 CC BY 4.0 标注，[源码与许可说明](https://github.com/qiuyiwu1989-star/opendesign)。本项目对参数和布局作了改编；原网站商标、图片和字体不属于本项目。
