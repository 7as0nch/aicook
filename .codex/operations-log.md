# Operations Log

- 2026-04-16: 读取仓库结构、前后端活跃入口与 AI 助手现状，确认根目录无真实 `AGENTS.md`。
- 2026-04-16: 后端已补充计划、清单、库存、单菜谱分享模型、Repo、Usecase、HTTP Handler 与 wire 注入。
- 2026-04-16: 下一步继续补齐 `deploy/sql/base.sql` 与前端活跃页面接线。

## 2026-04-17 前端类型清理与首包瘦身
- 修复 AIAssistant、Profile、RecipeDetail、RecipeEdit、RecipeShareImport 的活跃 TypeScript 报错。
- 为 UiRecipe 补充 summary 字段，并将旧的 src/features、src/components/layout、src/components/selection 从 tsconfig 排除。
- 将 routes.tsx 改为页面级懒加载，AIAssistant 改为独立懒加载。
- 在 vite.config.ts 增加 vendor 拆包策略，降低首页入口体积。
- 使用 pnpm exec tsc --noEmit 与 pnpm build 做本地验证。
