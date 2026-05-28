# AI 全域内容获客运营系统 v8 交付包

本交付包用于指导 Codex / Claude Code / Cursor 按 SDD + TDD 方式生成项目代码。

## v8 范围修正

当前 MVP 不包含真实 AI 生图、生视频、自动剪辑、数字人、配音、字幕生成等多媒体生成能力；但系统必须预留未来 `Media Generation Provider` 插件接口，后续可接入第三方生图/生视频 API、ComfyUI、客户自有模型服务或其他外部生成服务。

系统只做：

- 文案、标题、脚本、文章、问答、标签、回复建议等文本生成。
- 用户已有图片/视频素材的上传、管理、关联和发布。
- 未来生图/生视频 Provider 的接口、Mock、Disabled 和素材审核预留。
- 多平台发布、评论私信承接、线索识别、飞书/企微沉淀和复盘。

---

## 文件目录

1. `00_缺口清单与默认假设.md`  
   判断当前是否还缺必要信息，并列出必须由客户确认的业务参数。

2. `01_需求PRD.md`  
   产品定位、目标用户、业务流程、功能需求、权限、验收标准。

3. `02_技术架构设计.md`  
   系统架构、服务划分、数据库、队列、对象存储、Provider、Connector、Agent/Skill、部署方案。

4. `03_任务分解与开发Plan.md`  
   按阶段拆解开发任务，适合给 AI 编码工具逐步执行。

5. `04_测试用例与TDD计划.md`  
   单元测试、集成测试、E2E 测试、Mock Provider、平台降级测试、验收测试。

6. `05_SDD_AI代码生成指南.md`  
   用于指导 AI 生成代码的结构化规范，包括目录结构、接口契约、数据模型、状态机、代码生成顺序。

7. `06_Codex_ClaudeCode执行Prompt.md`  
   可直接复制给 Codex / Claude Code 的分阶段执行 Prompt。

## 核心设计原则

- 单品牌 / 单公司自用。
- 数据本地优先保存。
- PostgreSQL 是主业务库。
- MinIO 保存用户上传或外部导入的图片、视频、封面、截图和报告。
- Redis + BullMQ 负责任务队列。
- pgvector / Qdrant 保存知识库、话术库和案例库。
- 飞书和企微是线索沉淀与协作目标，不是唯一主数据库。
- MediaCrawler 用于低频公开内容调研和评论洞察。
- social-auto-upload 用于视频发布 Provider 参考或封装。
- xiaohongshu-mcp-skills / xiaohongshu-skills 用于小红书 Skill 参考。
- Wechatsync 用于文章同步 Provider 参考。
- 所有平台能力必须支持 official_api / browser_assist / manual_import / mock 降级。

## 当前结论

当前需求已经足够进入工程实现阶段。缺失的信息不阻塞 MVP 设计，但在上线前需要客户确认行业、平台账号权限、飞书/企微配置、AI 模型和部署环境；生图/生视频后续接入需要单独确认模型、成本、品牌规范和审核规则。
