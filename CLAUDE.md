<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 校园闲置生活服务平台 — Claude Code 项目指南

> 本文档是 Claude 在本项目工作的首要参考。README.md 面向人类开发者，AGENTS.md 面向 agent 配置。

## 项目概览

面向高校学生的校园闲置物品交易与生活服务平台。三条核心业务线：
- **自由市场** — 闲置物品发布、下单、智能柜/面对面交收、评价
- **教材订阅** — 按学期订阅、领取/归还、质检、赔付
- **智能柜** — 存取、付费寄存、取件码、超时计费

状态：已部署生产（Railway），36 张表、65 API 路由、28 页面。

## 技术栈

| 层 | 选择 |
|---|---|
| 框架 | Next.js 15 App Router + TypeScript |
| 数据库 | PostgreSQL 16 + Prisma ORM（schema: `prisma/schema.prisma`，config: `prisma.config.ts`） |
| UI | Tailwind CSS + shadcn/ui + 玻璃态设计 |
| 认证 | JWT（jose），2h 有效期，黑名单机制 |
| 测试 | Vitest（`src/lib/__tests__/`） |
| 部署 | Railway（SFO region） |

## 关键命令

| 命令 | 用途 |
|------|------|
| `npm run dev` | 启动开发（自动启动嵌入式 PG + Next.js） |
| `npm run build` | 生产构建 |
| `npm run test` | 运行测试 |
| `npm run test:coverage` | 测试覆盖率 |
| `npm run lint` | ESLint |
| `npm run db:reset` | 重置数据库 + 种子数据 |

## 架构

```
src/
├── app/
│   ├── api/          # 65 个 API 路由（RESTful）
│   ├── (pages)/      # 28 个页面
│   └── layout.tsx    # 根布局
├── components/       # UI 组件（按功能域组织）
├── hooks/            # 自定义 hooks
├── lib/              # 核心业务逻辑
│   ├── settlement.ts    # 统一结算（支付/完成/取消副作用）
│   ├── order-state-machine.ts  # 订单状态机
│   ├── pricing.ts       # 定价（佣金/配送费/超时费）
│   ├── credit.ts        # 信用分系统
│   ├── wallet.ts        # 钱包操作
│   ├── auth.ts          # JWT 认证
│   ├── db.ts            # Prisma 客户端
│   └── api-response.ts  # 统一 API 响应
└── middleware.ts     # 限流 + 安全 headers
```

## 关键约定

- **结算统一走 `settlement.ts`**：支付/完成/取消的所有副作用（通知、信用分、柜格状态、商品状态）都在此文件处理
- **状态机守卫**：所有订单状态变更必须经过 `canTransition()` 校验
- **API 响应格式**：使用 `apiSuccess()` / `apiError()` 统一封装
- **认证**：使用 `requireAuth()` / `requireAdmin()` 守卫
- **事务安全**：金融操作使用 Prisma `$transaction`，防 TOCTOU 竞态
- **CRLF**：Windows 环境，文件为 CRLF 换行，脚本替换时注意

## 文档索引

| 文件 | 职责 |
|------|------|
| `CLAUDE.md`（本文件） | Claude 工作指南 |
| `README.md` | 项目介绍（面向人类） |
| `AGENTS.md` | GitNexus agent 配置 |
| `docs/PLAN.md` | 执行计划 + 验收标准 |
| `docs/LOG.md` | 项目日志（按时间记录关键操作） |

## GitNexus 代码知识图谱

- **MCP 注册名**：`campus-life`
- **索引统计**：2,357 节点 / 4,682 边 / 46 聚类 / 173 流程
- **已知限制**：LadybugDB 不支持 Windows 中文路径，项目内 `.gitnexus/` 为归档
