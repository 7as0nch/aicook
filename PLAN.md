# AICook 首版计划（加入图片识别、语音输入、全局引用问 AI）

## 摘要
- 首版 MVP 在原有“菜谱库 + HowToCook 导入 + 做菜模式 + 知识库”基础上，新增 3 个高频入口：教程图片建菜谱、按住说话转文字、全局双击/选中文本后快速引用问 AI。
- 后端继续保持单体 Kratos 为主，但增加一个独立 `inference-service` 承载语音识别与 OCR/视觉解析，避免把 Python 推理框架塞进 Go 主服务导致维护复杂。
- AI 编排保持“双轨”：默认 `Eino ADK`，复杂确定性流程用 `Graph`，统一从 `AIRuntime` 切换，不让业务层直接耦合编排实现。
- 语音识别默认采用 `FunASR`，图片教程解析默认采用 `PaddleOCR 3.x / PP-StructureV3`，图片转菜谱结果统一进入 `draft/review`，不直接发布。

## 关键变更
### 1. 服务与分层
- 保持 `backend` 为主业务服务，职责只做协议、领域规则、任务编排、数据持久化。
- 新增 `inference-service`：
  - `speech` 模块：FunASR 推理，提供音频转文字接口。
  - `vision` 模块：PaddleOCR 文档/图片解析，输出 OCR 文本、结构块、置信度。
- `backend/internal` 领域新增：
  - `media`：上传、对象存储、媒体元数据。
  - `importer`：扩展图片导入能力。
  - `voice`：语音输入编排与文本落地。
  - `ai`：引用问答、图片建菜谱、知识检索统一入口。
- 层次保持 `service / biz / data` 三层，不引入额外 facade/manager；跨服务调用只保留一层 client 适配。

### 2. Eino 编排策略
- 固定使用 `cloudwego/eino v0.8.4` 作为稳定基线，默认走 ADK。
- `CookingAssistant`、`QuoteAssistant`、`KnowledgeAssistant` 走 `ADK`。
- `ImageRecipeImportFlow`、`KnowledgeIndexFlow` 走 `Graph`。
- `AIRuntime` 提供统一入口：
  - `mode=adk`：适合会话型问答、工具调用、上下文绑定。
  - `mode=graph`：适合图像解析、知识入库、固定流水线任务。
- `AIMessage` 请求模型统一支持：
  - `text`
  - `attachments`
  - `quote_context`
  - `scene`

### 3. 图片识别建菜谱
- 首版支持上传单张或多张“教程截图/拍照图”，目标是快速生成菜谱草稿。
- 流程固定为：
  - 前端上传图片到后端。
  - 后端存 MinIO，记录 `media_assets`。
  - 创建 `import_job(input_type=image_tutorial)`。
  - `inference-service` 用 PaddleOCR 解析图片文本与结构。
  - `ImageRecipeImportFlow(Graph)` 将 OCR 结果、图片元数据、多模态模型分析结果整理成 `Recipe draft`。
  - 用户进入预览页确认标题、封面、原料、步骤、定时器、来源，再发布。
- 若 OCR 置信度低或版面复杂，允许回退到多模态模型辅助理解，但结构化输出仍由统一 Graph 负责。
- 新增接口：
  - `POST /api/v1/media/images`
  - `POST /api/v1/imports/image-recipes`
  - `GET /api/v1/imports/{id}`

### 4. 语音输入
- 首版交互默认“按住说话”，兼容桌面端和移动端。
- 优先接入位置：
  - 首页搜索框
  - AI 对话框
  - 菜谱编辑页标题/说明/步骤输入
- 流程固定为：
  - 前端使用 `MediaRecorder` 录音。
  - 松手后上传音频到后端。
  - 后端转发给 `inference-service/speech`。
  - FunASR 返回识别文本、时间戳、置信度。
  - 前端将文本插入当前输入框，用户可二次编辑再提交。
- 首版不做全站实时流式听写，避免首轮把协议复杂度拉高；后续可在同一服务上增加 websocket 流式模式。
- 新增接口：
  - `POST /api/v1/media/audio`
  - `POST /api/v1/media/transcriptions`

### 5. 全局双击/选中快速引用问 AI
- 前端实现全局 `SelectionProvider`，统一监听：
  - 桌面端 `mouseup/selectionchange`
  - 移动端长按选择后的 selection 变化
  - 输入框/textarea 的选区变化
- 用户在页面任意可选文本上双击或拖选后，出现浮动操作条：
  - `引用问 AI`
  - `加入知识库草稿`
  - `创建菜谱草稿`
- `引用问 AI` 默认把以下信息一起发给 AI：
  - `selected_text`
  - `selection_source`（页面路由、模块类型、recipe_id/step_no/document_id）
  - `surrounding_text`
  - 当前会话 `scene`
- 不直接新开一套 AI 协议，统一扩展现有消息接口：
  - `POST /api/v1/ai/sessions/{id}/messages`
  - 新增 `quote_context` 字段
- 首版要求全站通用，但对按钮、拖拽控件、代码块等交互冲突区域做白名单/黑名单控制，避免误触。

### 6. 数据与部署
- 新增表建议：
  - `media_assets`
  - `knowledge_bases`
  - `knowledge_documents`
  - `knowledge_chunks`
  - `knowledge_index_jobs`
- 复用并扩展：
  - `import_jobs.input_type` 增加 `image_tutorial`
  - `ai_messages` 增加 `quote_context_json`
- MinIO 建议新增桶：
  - `aicook-media`
  - `aicook-kb`
- `deploy/sql/base.sql` 作为首版基础建表脚本入口，补齐 pgcrypto、pgvector、媒体表、知识库表、导入任务扩展。
- 当前 `k8s-deployment.yaml` 仍是 `aichat` 相关命名与镜像；实施时应拆成 `aicook` 独立清单，至少补充 `inference-service`、MinIO 配置、模型缓存卷与资源限制。

## 测试与验收
- 图片识别：
  - 单张教程图生成菜谱草稿。
  - 多张连续步骤图按顺序合并。
  - OCR 低置信度时进入人工确认，不直接发布。
- 语音输入：
  - 搜索框、AI 输入框、菜谱编辑框都能插入识别文本。
  - 普通话识别、短句停顿、弱网重试可用。
- 快速引用问 AI：
  - 菜谱步骤、知识片段、普通正文、输入框选中文本都能正确带上下文提问。
  - 不影响正常复制、链接点击、按钮操作。
  - 移动端长按也能触发等价能力。
- AI 编排：
  - ADK 问答路径与 Graph 导入路径都可独立运行。
  - `AIRuntime` 切换模式不影响业务层调用签名。
- 部署验收：
  - `backend` 与 `inference-service` 可独立扩容。
  - GPU 不可用时允许 CPU 降级跑首版识别链路。

## 假设与默认值
- 默认语音框架选 `FunASR`，原因是中文场景成熟、提供 ASR/VAD/标点恢复/服务部署路径，适合本项目。
- 默认图片解析选 `PaddleOCR 3.x` 的文档/图片结构化能力，首版优先教程截图/拍照，不做“纯成品图猜菜谱”主流程。
- 默认语音是“按住说话”而不是实时听写。
- 默认全局引用功能同时支持桌面双击和移动端长按。
- 默认图片建菜谱与知识库导入都走“先草稿后确认”策略。
- 默认继续采用 OpenAI 兼容模型接口，后续再挂接小米 Mimo。

## 参考依据
- Eino 最新稳定版 `v0.8.4`（2026-03-18）：https://github.com/cloudwego/eino/releases
- Eino v0.8 ADK Middlewares：https://www.cloudwego.io/zh/docs/eino/release_notes_and_migration/eino_v0.8._-adk_middlewares/
- Eino 实践文档（ADK / Graph / Knowledge Indexing）：https://www.cloudwego.io/docs/eino/overview/bytedance_eino_practice/
- FunASR 官方仓库：https://github.com/modelscope/FunASR
- Fun-ASR 官方仓库（低延迟实时转写、31 语言等说明）：https://github.com/FunAudioLLM/Fun-ASR
- PaddleOCR 官方文档：https://www.paddleocr.ai/v3.3.2/en/index.html
