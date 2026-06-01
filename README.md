# 校园闲置生活服务平台

一个面向高校学生的校园闲置物品交易与生活服务平台原型。基于 Next.js 15 + TypeScript + PostgreSQL 构建，支持商品交易、教材订阅、智能柜存取三大核心业务线。

## 功能概览

### 三条业务线
- **自由市场** — 闲置物品发布、浏览、下单、智能柜/面对面交收、评价
- **教材订阅** — 按学期订阅教材、领取/归还、质检、赔付
- **智能柜** — 虚拟柜机存取、付费寄存、取件码、超时处理

### 通用能力
- 用户注册/登录（JWT 认证）
- 订单状态机（统一订单模型，4 种订单类型）
- 模拟支付（完整状态流转）
- 钱包系统（余额、流水、退款）
- 站内消息 + 聊天
- 论坛（板块/帖子/评论/点赞/收藏）
- 物流追踪（循环模拟）
- 信用分体系
- 运营后台（数据看板、用户/订单/投诉管理）

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js 15 (App Router) |
| 语言 | TypeScript |
| 数据库 | PostgreSQL 16 + Prisma ORM |
| UI | Tailwind CSS + shadcn/ui |
| 状态管理 | Zustand |
| 认证 | JWT (jose) |
| 代码分析 | GitNexus 1.6.5（代码知识图谱） |
| 部署 | Railway |

## 本地开发

```bash
npm install
npm run dev
```

启动后访问 http://localhost:3000。

数据库使用嵌入式 PostgreSQL（自动下载到 `~/.campus-pg/`），首次启动自动初始化 + 种子数据。

**测试账号**：`13800000001` ~ `13800000005`，密码 `123456`

## 部署

生产环境：https://humble-creation-production-5c11.up.railway.app

部署在 Railway（SFO region），使用 Railway 托管的 PostgreSQL。

## 代码知识图谱（GitNexus）

项目已索引为语义代码图谱，支持查询代码执行流、影响分析和 Cypher 图查询：

- **索引路径**：`C:\Users\honor\Desktop\校园生活\.gitnexus\`
- **MCP 查询路径**：由于 LadybugDB 不支持 Windows 中文路径，MCP 查询需通过纯英文路径的 junction 访问
- **自动生成的 Skills**：`.claude/skills/generated/`（16 个模块级 skill）

> 已知限制：LadybugDB（GitNexus 底层数据库）在 Windows 含中文字符的路径下会崩溃。索引文件保存在项目目录中作为归档，实际 MCP 查询需创建 junction 到纯英文路径。
