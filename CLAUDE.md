<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## GitNexus 代码知识图谱

- **版本**：1.6.5（升级自 1.6.4-rc.44，修复 WAL 损坏 bug #1300/#1402/#1611）
- **索引统计**：2,357 节点 / 4,682 边 / 46 聚类 / 173 流程 / 1,849 embeddings
- **索引文件**：`.gitnexus/`（lbug 数据库 67MB）
- **自动生成 Skills**：`.claude/skills/generated/`（16 个模块 skill）
- **MCP 注册名**：`campus-life`

**已知限制**：LadybugDB 不支持 Windows 中文路径。MCP 查询需通过纯英文路径 junction。项目内 `.gitnexus/` 文件为归档用途。
