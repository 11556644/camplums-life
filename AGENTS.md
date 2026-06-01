<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## GitNexus 代码知识图谱

本项目已通过 GitNexus 1.6.5 建立语义代码关系图。

**索引统计**：2,357 节点 / 4,682 边 / 46 聚类 / 173 流程

**可用能力**（通过 MCP 调用）：
- `query` — 语义搜索代码执行流
- `context` — 符号 360 度上下文（调用者、被调用者）
- `impact` — 变更影响分析
- `cypher` — 图数据库查询
- `detect_changes` — 未提交变更影响分析
- `route_map` — API 路由映射

**已知限制**：LadybugDB 不支持 Windows 中文路径，MCP 查询需通过纯英文路径 junction。项目内 `.gitnexus/` 为归档。

**自动生成 Skills**（16 个）：`.claude/skills/generated/` 目录下，按模块组织（cabinets、chats、components、favorites、login、orders 等）。

