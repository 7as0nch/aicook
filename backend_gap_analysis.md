# Backend Gap Analysis

## 1. 本轮已补齐的基础能力

当前仓库已经落地了下面这些后端基础：

- 用户名 + 密码注册 / 登录
- `households.share_code`
- `household_members`
- `kitchen_tags`
- `recipe_tags`
- 多厨房切换 token 上下文
- 按分享码预览厨房菜谱
- 按选择复制导入菜谱到目标厨房
- 首页厨房标签读取与按标签筛选
- AI 输入框真实录音转写链路

同时，`GetRecipeDetail` 已按当前 `household_id` 做隔离，不再是“知道 recipe id 就能直接跨厨房看详情”。

## 2. 这轮之后仍然存在的缺口

### 2.1 菜谱写接口仍然不完整

目前依然缺少完整的：

- `CreateRecipe`
- `UpdateRecipe`
- `DeleteRecipe`
- 批量维护菜谱标签 / 厨房标签绑定的正式接口

现在分享导入可以复制菜谱，但手工新建和编辑仍主要依赖现有草稿/导入链路，工作台还没有完整的落库编辑 API。

### 2.2 标签模型仍是轻量版

虽然已经新增了：

- `kitchen_tags`
- `recipe_tags`

但当前版本还是偏轻量实现：

- 菜谱标签实际筛选仍然大量依赖 `recipes.scenario_tags` / `flavor_tags`
- 还没有补 `recipe_tag_bindings` 这类标准多对多表
- 还没有补重命名 / 删除 / 解绑标签接口
- 首页标签聚合暂未做“标签下菜谱数”统计

如果后面要支持复杂分类、标签权限、批量整理，建议补标准绑定表。

### 2.3 分享导入仍是 v1

当前分享链路已经能跑通，但仍有后续增强空间：

- 只有“复制导入”，还没有导入冲突检测
- 还没有“按更新时间增量同步”
- 还没有导入记录表或导入审计日志
- 还没有针对分享码的失效时间、停用、轮换策略

目前 `recipes.source_household_id` 和 `forked_from_recipe_id` 已经能提供最基础的追溯能力。

### 2.4 认证体系还缺更完整的账户能力

当前已支持用户名密码，但下面这些还没有：

- 手机号验证码登录
- 找回密码 / 修改密码
- JWT 刷新 token
- 细粒度角色权限（当前 `household_members.role` 只打了基础）
- 管理员踢人 / 邀请成员

## 3. 仍缺的业务表结构

### 3.1 餐计划

前端的计划页仍主要使用本地持久化，后端缺：

- `meal_plans`
- `meal_plan_items`
- AI 生成周计划的正式持久化结构

### 3.2 购物清单

购物页仍主要是前端 Zustand 持久化，后端缺：

- `shopping_lists`
- `shopping_list_items`
- `shopping_trip_history`

### 3.3 偏好与家庭画像

虽然 `households.preferences` 已存在，但仍缺：

- 独立的偏好编辑接口
- 结构化过敏源 / 饮食目标 / 口味偏好模型
- 与 AI 推荐、周计划的联动策略

## 4. 推理服务相关缺口

当前前后端已经能通过 `backend -> inference-service` 调 OCR / ASR，但本地联调仍有明显缺口：

- `inference-service` 没有完整纳入统一 compose
- PaddleOCR / FunASR 模型依赖没有统一安装脚本
- 本地开发环境的 CPU / 内存建议没有标准文档化到 README 主入口
- 缺少推理服务不可用时的统一降级策略

补充说明见根目录 `inference-service-local.md`。

## 5. 安全与权限方面仍需继续收口

虽然详情接口已经补了租户隔离，但还建议继续检查这些点：

- `KnowledgeBase` / `KnowledgeDocument` 是否都严格校验当前厨房
- `MediaAsset` 读取是否都校验所属厨房
- 分享码预览是否需要隐藏更多厨房信息
- 所有新接口是否统一要求 token，而不是仅依赖前端传参

## 6. 下一阶段建议优先级

1. 补正式菜谱 CRUD 与标签绑定接口，让“新增菜谱工作台”可完整保存和编辑
2. 落餐计划 / 购物清单后端持久化，替换前端本地状态
3. 收口推理服务本地一键启动与降级策略
4. 继续细化成员角色、邀请和权限校验