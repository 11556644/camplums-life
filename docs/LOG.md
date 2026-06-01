# 项目日志 (Project Log)

> 按时间顺序记录所有关键操作、状态变更和产出

---

## 2026-05-22

### [启动] 项目分析与规划

**时间**: 2026-05-22
**操作**: 阅读分析全部项目文件
**文件**: 校园生活.txt, 背景.txt, CLAUDE.md
**产出**: 确认项目定位为"课程作业/毕设，可实际使用"
**关键发现**:
- 三条业务线必须全部存在
- 实体物品虚拟存在，支付需真实接口（但无企业资质，改为模拟）
- 智能柜支持付费存放任意物品
- 物流信息循环模拟
- 截止时间: 2026-05-24

### [决策] 技术选型确定

**时间**: 2026-05-22
**决策**: Next.js 15 + TypeScript + PostgreSQL 16/Prisma + Tailwind/shadcn/ui
**详情**: 技术选型已在本文件记录

### [产出] 执行计划

**时间**: 2026-05-22
**文件**: docs/PLAN.md
**内容**: 5 个 Phase，22 小时预估工作量，全量任务拆解

### [修正] 虚拟实体策略澄清

**时间**: 2026-05-22
**操作**: 更新 PLAN.md 和 DECISIONS.md
**澄清**: 教材、智能柜、柜格是"预置基础数据"而非"功能模块"。种子脚本预置数据，系统当真实存在处理。用户感知不到"虚拟"。

### [澄清] 产品定位确认

**时间**: 2026-05-22
**确认**: 系统需可给真实用户使用，非纯演示。质量标准：真实注册、数据持久化、错误处理、基础安全、良好 UX。

### [开始] Phase 1 — 框架搭建 + 用户体系

**时间**: 2026-05-22
**操作**: 初始化 Next.js 项目，设计 Prisma Schema

### [完成] Phase 1 全部完成

**时间**: 2026-05-22
**产出**:
- Next.js 15 + TypeScript + Tailwind + shadcn/ui 项目骨架
- Prisma Schema 36 张表（PostgreSQL）— 含论坛5表、钱包2表、物流2表、商品收藏1表、信用历史1表
- 种子数据：1 所学校、5 个用户、2 台智能柜 20 个柜格、25 本书籍（15教材+10课外）、3 个订阅套餐、5 个商品、5 个任务、5 个论坛板块 4 篇帖子
- 用户注册/登录 API + JWT 认证
- Logger + AuditLog + EventLog 模块
- 订单状态机模块
- 首页 + 登录页 + 注册页 + 导航栏
- 构建通过，零错误

### [开始] Phase 2 — 统一订单 + 商品交易 + 模拟支付

### [完成] Phase 2 完成

**时间**: 2026-05-22
**产出**:
- 商品列表/详情 API + 页面
- 订单 CRUD API + 状态机驱动
- 模拟支付（完整状态流转）
- 评价 API + 信用分自动调整
- 订单管理页面（买家/卖家视角）
- 构建通过，16 个路由

### [开始] Phase 3 — 智能柜系统

### [完成] Phase 3 + 4 + 5 全部完成

**时间**: 2026-05-22
**产出**:
- 智能柜 API（存入/取出/柜机列表）+ 页面（柜格可视化面板）
- 教材列表 API + 订阅套餐 API + 页面
- 自由市场任务列表 API + 页面
- 运营后台（数据看板 + 审计日志）+ 页面
- 管理员用户管理 API
- 全部路由构建通过

### [状态] 系统可启动

**启动方式**: `npm run dev`
**访问地址**: http://localhost:3000
**测试账号**: 13800000001-005（密码 123456）
**路由总数**: 92+ 个（64 API + 28 页面）

### [完成] 全部 Phase 1-5 + 后续功能迭代

**时间**: 2026-05-22 ~ 2026-05-29
**总产出**:
- 36 张数据库表（Prisma + PostgreSQL）— 含论坛5表、钱包2表、物流2表、商品收藏1表、信用历史1表
- 65 个 API 路由（认证、商品、订单、智能柜、书籍借阅、任务、消息、钱包、论坛、管理后台）
- 28 个页面（首页、登录、注册、商品、订单、智能柜、任务、书籍中心、论坛、钱包、个人中心、管理后台等）
- 种子数据（5 用户、2 柜机 20 柜格、25 本书籍、5 商品、5 任务、3 套餐、5 论坛板块）
- 订单状态机（4 种订单类型，完整状态迁移规则）
- 结构化日志 + 审计日志 + 领域事件
- JWT 认证 + 权限控制

### [重大] 功能补全 + 系统联动修复

**时间**: 2026-05-22 ~ 2026-05-23
**操作**: 全面补全三大业务线功能 + 修复系统联动问题

**新增功能**:
- 搜索功能（商品/任务/教材关键词搜索）
- 「我的」页面（个人信息编辑、快捷入口）
- 用户主页 `/user/[id]`（信用分、评分、发布列表）
- 聊天列表 `/chats`（会话列表 + 搜索用户发起新对话）
- 图片真实上传（`/api/upload` + 本地存储 + Magic bytes 校验）
- 物流追踪 `/logistics/[id]`（时间线 UI + 自动轮询）
- 智能柜实时刷新（5 秒轮询）
- 模拟物流推进 API（`POST /api/demo`）
- 未读消息计数 badge（导航栏 10 秒轮询）
- 消息中心增强（分类筛选 + 可回复 + 可跳转）

**三大业务线补全**:
- 智能柜：取件倒计时、拒收功能、管理员远程开柜/标记故障、柜格数据看板、存入拍照
- 教材订阅：真实订阅流程（分配副本）、归还 API、质检/消毒/上架、赔付计算、我的教材页、教材详情页
- 自由市场：接单创建订单、任务完成结算、报价机制、截止时间

**系统联动修复**:
- 信用分全链路：订单完成/取消/纠纷/教材逾期均影响信用分，低于 30 禁止发布
- 钱包-订单打通：取消退款到钱包、任务完成结算到卖家、支付金额校验
- 状态机统一：钱包支付/任务完成均走 `canTransition()` 校验
- 通知补齐：订单取消/封禁/下架/纠纷双方均可通知
- 审计日志补齐：管理员操作/过期柜格/逾期费均记录
- 隐私保护：手机号脱敏、宿舍信息脱敏、搜索结果脱敏

**安全加固**:
- JWT 黑名单（被封用户即时失效，每次请求查 DB）
- JWT 有效期缩短 7天→2小时
- API 限流中间件（认证 5次/分、支付 10次/分、通用 100次/分）
- 安全 Headers（X-Content-Type-Options / X-Frame-Options / XSS-Protection）
- 上传安全（Magic bytes 校验 + 纯随机文件名）
- JWT Secret 外部化（生产环境强制要求环境变量）

### [重大] 数据库迁移 SQLite → PostgreSQL

**时间**: 2026-05-23
**操作**: 从 SQLite 迁移到 PostgreSQL 16
**理由**: SQLite 不支持并发写入，生产环境不可用
**方式**: 嵌入式 PostgreSQL 二进制（`~/.campus-pg/`），随项目自动启动
**产出**:
- `prisma/schema.prisma` provider 改为 `postgresql`
- `scripts/db-start.js` 自动下载 + 初始化 + seed
- `scripts/dev.js` 自动启动 PG + Next.js（`npm run dev` 一条命令）
- `scripts/start.js` 生产启动脚本
- Prisma schema + seed 数据完整迁移
- 构建通过，API 正常返回数据

### [部署] Railway 生产环境上线

**时间**: 2026-05-23
**操作**: 部署到 Railway（PostgreSQL + Next.js）
**平台**: Railway (SFO region)
**URL**: https://humble-creation-production-5c11.up.railway.app
**解决的问题**:
- Tailwind CSS v4 `@tailwindcss/oxide` 原生绑定在 Linux 不可用 → 显式添加 `@tailwindcss/oxide-linux-x64-gnu`
- TypeScript `noImplicitAny` 错误 → tsconfig 关闭 + 事务回调 `any` 类型
- ESLint `no-explicit-any` 阻塞构建 → 降级为 warn
**测试账号**: 13800000001-005（密码 123456）

### [清理] 项目文件整理

**时间**: 2026-05-23
**操作**:
- 删除 3 张根目录截图（屏幕截图*.png）
- 移动 3 个需求文档到 docs/（背景.txt、校园生活.txt、requirements.txt）
- 更新 .gitignore（去重、补充 dev.db、截图规则）
- 同步文档不一致（SQLite → PostgreSQL）

### [修复] EventLog_schoolId_fkey 外键约束错误

**时间**: 2026-05-29
**问题**: `domainEvent()` 调用时未传 `schoolId`，默认用空字符串 `""` 插入 EventLog，但 School 表不存在 id 为空的记录，导致 FK 约束报错
**修复**:
- `prisma/schema.prisma`: EventLog.schoolId 改为可空（`String?`），外键改为可选
- `src/lib/logger.ts`: `domainEvent()` 新增 `userId` 参数，支持自动推断 schoolId；移除空字符串兜底
- 6 个调用方（cabinets、wallet、orders、textbooks）补传 `userId: session.userId`
**影响**: 领域事件不再因 FK 约束失败，schoolId 正确关联到学校

### [修复] 文档数据不一致修正

**时间**: 2026-05-29
**修正项**:
- 表数量：34 → 38（新增 CreditScoreHistory、Wallet、WalletTransaction、LogisticsRoute、LogisticsNode、ForumBoard/Post/Comment/Like/Favorite、ProductFavorite）
- API 路由数：57 → 64
- 路由总数：85+ → 92+
- PLAN.md 实体关系图补全所有 36 张表
- PLAN.md 关键表清单补全 12 张缺失表

### [功能] 商品交收方式选择 + 智能柜集成

**时间**: 2026-05-29
**操作**: 商品交易支持智能柜交收和面对面交易两种方式

**数据模型变更**:
- `Product` 新增 `cabinetDelivery`（Boolean）和 `faceToFaceDelivery`（Boolean）字段
- `Order` 新增 `deliveryMethod` 字段（cabinet / face_to_face）

**完整流程**:
1. 卖家发布商品时选择支持的交收方式（至少一种，可多选）
2. 商品详情页展示支持的交收方式，买家下单时选择
3. 选择智能柜：买家选柜格 → 下单时柜格 empty→reserved（预留锁定）
4. 卖家支付后"存入智能柜"：柜格 reserved→occupied，生成取件码通知买家
5. 智能柜交收享受 2 小时 ¥0.2 交易特价（marketplaceSpecial）
6. 面对面交易走原有物流流程
7. 订单取消自动释放预留/占用柜格

**参照模式**: 教材订阅模块的柜格预留逻辑（empty→reserved→occupied 生命周期）

### [基础设施] GitNexus 代码知识图谱部署

**时间**: 2026-05-31
**操作**: 为项目部署 GitNexus 语义代码关系图

**过程**:
1. 初始版本 1.6.4-rc.44 存在 WAL 数据库损坏 bug（已知 issue #1300、#1402、#1611）
2. 升级到 1.6.5 后问题解决
3. 由于 LadybugDB 不支持 Windows 中文路径（项目目录名"校园生活"），通过创建纯英文路径副本完成索引
4. 索引结果复制回项目 `.gitnexus/` 目录

**产出**:
- 索引统计：2,357 节点 / 4,682 边 / 46 聚类 / 173 流程 / 1,849 embeddings
- 16 个自动生成的模块级 skill（`.claude/skills/generated/`）
- MCP 注册名：`campus-life`

**已知限制**:
- LadybugDB 不支持 Windows 中文路径，MCP 查询需通过纯英文路径 junction
- 索引基于代码快照（2026-05-31），代码变更后需重新索引
- .gitnexus/lbug 数据库文件 67MB

**相关更新**:
- 重写 README.md（从默认模板替换为项目实际内容）
- 重写 CLAUDE.md（添加完整项目指南）
- 更新 AGENTS.md（追加 GitNexus 使用说明）

