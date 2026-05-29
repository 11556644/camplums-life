# 校园闲置生活服务平台 — 执行计划

> 创建时间: 2026-05-22
> 截止时间: 2026-05-24
> 状态: 已完成

---

## 一、目标

两天内交付一个**可实际使用的校园闲置生活服务平台原型**，包含：
- 统一用户体系 + 三条业务线（智能柜、教材订阅、自由市场）
- 完整的订单状态机 + 模拟支付
- 虚拟智能柜存取系统（可付费存放任意物品）
- 运营后台基础版
- 可观测性日志 + 决策记录

## 二、技术选型

| 层 | 选择 | 理由 | 决策编号 |
|----|------|------|----------|
| 框架 | Next.js 15 (App Router) | 前后端一体，两天出活最快 | D-001 |
| 语言 | TypeScript | 类型安全，减少运行时错误 | D-001 |
| 数据库 | PostgreSQL 16 + Prisma ORM | 嵌入式安装，并发安全，生产可用 | D-002 |
| UI 组件 | Tailwind CSS + shadcn/ui | 现成组件，不手写样式 | D-003 |
| 认证 | 自建 JWT (jose) | 无外部依赖，可控性强 | D-004 |
| 支付 | 模拟支付（完整流程，非真实接口） | 无企业资质，真实接口不可行 | D-005 |
| 状态管理 | Zustand | 轻量，适合原型 | — |
| 表单 | React Hook Form + Zod | 类型安全的表单验证 | — |

## 三、虚拟实体策略（非功能，是数据假设）

以下实体在现实世界中不存在，但系统**假设它们存在**，通过种子数据预置：

| 虚拟实体 | 预置方式 | 说明 |
|----------|----------|------|
| 教材/书籍 | 种子脚本预置 15 种教材数据（ISBN、书名、作者、版本、成色、库存编号） | 系统把它们当真实库存处理，订阅、借阅、归还、质检全部正常流转 |
| 智能柜/柜格 | 种子脚本预置若干柜机 + 每台若干柜格 | 系统把它们当真实硬件处理，存取、开柜、状态变更全部正常运转 |
| 物流信息 | 前端定时器驱动 A→B→C→A 循环 | 演示用，不需要任何真实物流对接 |

**这不是功能模块，是基础数据层。** 所有业务功能（交易、存取、借还）都基于这些预置数据正常运转，用户感知不到"虚拟"。

| 约束 | 原型阶段落地方式 |
|------|------------------|
| school_id 维度隔离 | 所有核心表加 school_id 字段，查询默认按 school 过滤 |
| 幂等设计 | 支付/柜机回调接口使用全局唯一业务号 + 去重表 |
| 状态机驱动 | 订单/柜格状态迁移统一走状态机模块，禁止直接 UPDATE |
| 结构化日志 | 自建 logger 模块，JSON 格式输出，含 traceId/requestId |
| 审计日志 | audit_log 表记录所有关键操作（登录/支付/权限变更/状态迁移） |
| 事件日志 | event_log 表记录所有领域事件（订单创建/支付完成/柜格状态变更） |
| 跨服务解耦 | 单体内按模块隔离，模块间通过 service 层调用，禁止跨模块直接查表 |
| 配置按学校作用域 | school_config 表，按 school_id 存储差异化配置 |

**明确不做的（超出原型范围）：**
- 分布式 Trace（单体应用不需要）
- 蓝绿/灰度发布（Railway 单实例部署）
- 分库分表（PostgreSQL 单库，school_id 逻辑隔离）
- 微服务拆分（单体模块化架构，见 D-006）
- 短信/微信真实推送（前端 toast 模拟）

## 四、数据库概要设计

### 核心实体关系

```
School ──< User ──< Role
  │        │
  │        ├──< Order ──< OrderItem
  │        │      │
  │        │      ├──< Payment
  │        │      ├──< Rating
  │        │      └──< Dispute
  │        │
  │        ├──< Product (商品)
  │        ├──< Task (任务/服务)
  │        │
  │        ├──< Subscription ──< SubscriptionOrder
  │        │
  │        ├──< CreditScore
  │        └──< Message
  │
  ├──< Cabinet ──< CabinetSlot ──< CabinetSlotLog
  │
  ├──< Textbook ──< TextbookCopy
  │
  └──< SchoolConfig
```

### 关键表清单

| 表名 | 用途 | 核心字段 |
|------|------|----------|
| school | 学校/校区 | id, name, address |
| user | 用户 | id, school_id, phone, password_hash, nickname, avatar |
| user_role | 用户角色 | user_id, role (buyer/seller/floor_leader/admin) |
| product | 商品（闲置物品） | id, seller_id, school_id, category, title, desc, price, status |
| task | 任务/服务 | id, publisher_id, school_id, type, title, desc, budget, status |
| order | 统一订单 | id, school_id, buyer_id, seller_id, order_type, biz_type, status, amount |
| order_item | 订单明细 | order_id, product_id/task_id, quantity, price |
| payment | 支付记录 | id, order_id, amount, method, status, paid_at |
| cabinet | 智能柜 | id, school_id, location, total_slots, status |
| cabinet_slot | 柜格 | id, cabinet_id, slot_number, status (empty/occupied/reserved/fault) |
| cabinet_slot_order | 柜格-订单绑定 | slot_id, order_id, deposit_type (trade/storage), pickup_code |
| cabinet_slot_log | 柜格操作日志 | slot_id, action, operator_id, timestamp |
| textbook | 教材元数据 | id, school_id, isbn, title, author, publisher, edition |
| textbook_copy | 教材副本 | id, textbook_id, copy_number, condition, status |
| subscription_plan | 订阅套餐 | id, school_id, name, semester, price, deposit |
| subscription_order | 订阅订单 | id, user_id, plan_id, status, start_date, end_date |
| inventory_transaction | 库存流转 | copy_id, from_status, to_status, operator_id, timestamp |
| inspection_record | 质检记录 | copy_id, result, condition_before, condition_after |
| rating | 评价 | id, order_id, rater_id, ratee_id, score, content |
| dispute | 投诉/纠纷 | id, order_id, initiator_id, reason, status, resolution |
| credit_score | 信用分 | user_id, score, updated_at |
| message | 站内消息 | id, sender_id, receiver_id, type, content, read_at |
| audit_log | 审计日志 | id, user_id, action, target_type, target_id, detail, ip |
| event_log | 领域事件 | id, event_type, aggregate_type, aggregate_id, payload |
| school_config | 学校配置 | school_id, key, value |

## 五、执行分阶段计划

### Phase 1: 基础框架 + 用户体系（预计 4 小时）

| 任务 | 产出 | 验证方式 |
|------|------|----------|
| Next.js 项目初始化 | 可运行的项目骨架 | `npm run dev` 启动成功 |
| Prisma Schema 设计 | 全部表结构 | `prisma db push` 成功 |
| 种子数据 | 测试学校 + 测试用户 | 数据库有数据 |
| 用户注册/登录 | 注册页 + 登录页 + JWT | 能注册、登录、看到首页 |
| 通用布局 | 导航栏 + 侧边栏 + 内容区 | 页面结构正确 |
| Logger + AuditLog 模块 | 结构化日志 + 审计记录 | 操作后 audit_log 表有记录 |

### Phase 2: 统一订单 + 商品交易（预计 4 小时）

| 任务 | 产出 | 验证方式 |
|------|------|----------|
| 商品发布 | 发布表单 + 列表页 | 能发布、看到商品列表 |
| 商品详情 + 下单 | 详情页 + 下单流程 | 能创建订单 |
| 订单状态机 | 状态迁移模块 | 订单按正确顺序流转 |
| 模拟支付 | 支付页面 + 状态变更 | 点"支付"后订单状态变为已支付 |
| 评价系统 | 评价表单 + 展示 | 完成订单后能评价 |
| EventLog 领域事件 | 事件记录 | 关键操作写入 event_log |

### Phase 3: 智能柜系统（预计 3 小时）

| 任务 | 产出 | 验证方式 |
|------|------|----------|
| 柜机/柜格管理 | 柜机列表 + 柜格状态面板 | 能看到柜机和柜格状态 |
| 订单绑定柜格 | 存入流程 + 取件码生成 | 订单关联柜格，生成取件码 |
| 存取操作 | 存入/取出按钮 + 状态变更 | 操作后柜格状态正确变更 |
| 付费寄存 | 独立寄存入口 + 计费 | 能为非交易物品付费存放 |
| 操作日志 | 柜格操作记录 | cabinet_slot_log 有记录 |
| 超时处理 | 超时策略 + 自动状态变更 | 超时后状态自动变更 |

### Phase 4: 教材订阅 + 自由市场（预计 4 小时）

| 任务 | 产出 | 验证方式 |
|------|------|----------|
| 教材库 | 教材列表 + 详情 | 能看到教材信息 |
| 订阅套餐 | 套餐配置 + 订阅下单 | 能选择套餐并订阅 |
| 库存流转 | 领取/归还/质检流程 | 教材状态按流程变更 |
| 自由市场发布 | 任务/商品/服务发布 | 能发布不同类型 |
| 接单/报价 | 报价流程 + 选择服务者 | 能完成接单 |
| 循环物流模拟 | 物流信息循环展示 | 订单物流信息自动循环更新 |

### Phase 5: 运营后台 + 收尾（预计 3 小时）

| 任务 | 产出 | 验证方式 |
|------|------|----------|
| 用户管理 | 用户列表 + 封禁 | 能查看和管理用户 |
| 订单管理 | 订单列表 + 筛选 | 能按状态/类型筛选 |
| 数据看板 | 基础统计图表 | 能看到交易量、用户数等 |
| 投诉处理 | 投诉列表 + 仲裁 | 能处理投诉 |
| 完整流程走查 | 端到端测试 | 三条业务线各走一遍完整流程 |

## 六、风险

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| 两天时间不够 | 高 | 砍功能 | 优先保核心流程，运营后台可简化 |
| Tailwind v4 原生绑定 | 中 | 阻塞部署 | 显式添加平台绑定依赖（已解决） |
| 前端工作量大 | 中 | 砍页面 | 用 shadcn/ui 现成组件，不追求视觉完美 |
| 支付模拟逻辑复杂 | 低 | 延期 | 模拟支付本身很简单，风险可控 |

## 七、验收标准

- [x] 用户能注册、登录、切换角色
- [x] 能发布商品/任务/教材，能看到列表
- [x] 能下单、模拟支付、走完订单状态机
- [x] 能在虚拟智能柜上存入/取出物品，付费寄存可用
- [x] 能订阅教材套餐、领取、归还
- [x] 自由市场能接单、报价、完成服务
- [x] 运营后台能看到用户、订单、基础数据
- [x] 所有关键操作有审计日志
- [x] 所有状态变更走状态机，有事件日志
- [x] `npm run dev` 一条命令启动完整系统
- [x] 已部署到 Railway：https://humble-creation-production-5c11.up.railway.app
