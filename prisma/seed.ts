import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // 清空所有表（按依赖顺序）
  await db.$executeRaw`TRUNCATE TABLE "LogisticsNode", "LogisticsRoute", "InventoryTransaction", "InspectionRecord", "TextbookCopy", "Textbook", "CabinetSlotLog", "CabinetSlotOrder", "CabinetSlot", "Cabinet", "Dispute", "Rating", "Message", "WalletTransaction", "Wallet", "EventLog", "AuditLog", "CreditScore", "UserRole", "OrderItem", "Order", "SubscriptionOrder", "SubscriptionPlan", "SchoolConfig", "Task", "Product", "User", "School" CASCADE`;

  // ==================== 学校 ====================
  const school = await db.school.create({
    data: {
      id: "school_001",
      name: "示例大学",
      address: "北京市海淀区示例路1号",
    },
  });
  console.log("Created school:", school.name);

  // ==================== 用户 ====================
  const passwordHash = await bcrypt.hash("123456", 10);

  const admin = await db.user.create({
    data: {
      schoolId: school.id,
      phone: "13800000001",
      passwordHash,
      nickname: "管理员",
      studentId: "ADMIN001",
      department: "信息中心",
    },
  });

  const seller = await db.user.create({
    data: {
      schoolId: school.id,
      phone: "13800000002",
      passwordHash,
      nickname: "张同学",
      studentId: "2024001001",
      department: "计算机学院",
      dormitory: "1号楼",
      roomNumber: "301",
      enrollYear: 2024,
    },
  });

  const buyer = await db.user.create({
    data: {
      schoolId: school.id,
      phone: "13800000003",
      passwordHash,
      nickname: "李同学",
      studentId: "2024002001",
      department: "电子工程学院",
      dormitory: "2号楼",
      roomNumber: "502",
      enrollYear: 2024,
    },
  });

  const floorLeader = await db.user.create({
    data: {
      schoolId: school.id,
      phone: "13800000004",
      passwordHash,
      nickname: "王楼长",
      studentId: "2023001001",
      department: "管理学院",
      dormitory: "1号楼",
      roomNumber: "101",
      enrollYear: 2023,
    },
  });

  const serviceProvider = await db.user.create({
    data: {
      schoolId: school.id,
      phone: "13800000005",
      passwordHash,
      nickname: "赵技能达人",
      studentId: "2023003001",
      department: "艺术学院",
      dormitory: "3号楼",
      roomNumber: "201",
      enrollYear: 2023,
    },
  });

  // 角色分配
  const roles = [
    { userId: admin.id, schoolId: school.id, role: "admin" },
    { userId: seller.id, schoolId: school.id, role: "seller" },
    { userId: seller.id, schoolId: school.id, role: "buyer" },
    { userId: buyer.id, schoolId: school.id, role: "buyer" },
    { userId: floorLeader.id, schoolId: school.id, role: "floor_leader" },
    { userId: floorLeader.id, schoolId: school.id, role: "buyer" },
    { userId: serviceProvider.id, schoolId: school.id, role: "service_provider" },
    { userId: serviceProvider.id, schoolId: school.id, role: "buyer" },
  ];
  await db.userRole.createMany({ data: roles });

  // 信用分
  for (const user of [admin, seller, buyer, floorLeader, serviceProvider]) {
    await db.creditScore.create({ data: { userId: user.id, schoolId: school.id, score: 100 } });
  }

  console.log("Created users: admin, seller, buyer, floorLeader, serviceProvider");

  // ==================== 智能柜 ====================
  const cabinet1 = await db.cabinet.create({
    data: {
      schoolId: school.id,
      name: "1号楼智能柜",
      location: "1号楼一楼大厅",
      totalSlots: 12,
    },
  });

  const cabinet2 = await db.cabinet.create({
    data: {
      schoolId: school.id,
      name: "食堂智能柜",
      location: "第一食堂入口处",
      totalSlots: 8,
    },
  });

  // 创建柜格
  for (let i = 1; i <= 12; i++) {
    await db.cabinetSlot.create({
      data: {
        cabinetId: cabinet1.id,
        slotNumber: i,
        status: i <= 3 ? "occupied" : i === 4 ? "reserved" : i === 12 ? "fault" : "empty",
      },
    });
  }

  for (let i = 1; i <= 8; i++) {
    await db.cabinetSlot.create({
      data: {
        cabinetId: cabinet2.id,
        slotNumber: i,
        status: i <= 2 ? "occupied" : "empty",
      },
    });
  }

  console.log("Created cabinets: 1号楼智能柜 (12 slots), 食堂智能柜 (8 slots)");

  // ==================== 教材 ====================
  const textbooks = [
    { isbn: "9787302356288", title: "高等数学（第七版）上册", author: "同济大学数学系", publisher: "高等教育出版社", edition: "第七版", course: "高等数学A", department: "理学院", isRequired: true },
    { isbn: "9787302356295", title: "高等数学（第七版）下册", author: "同济大学数学系", publisher: "高等教育出版社", edition: "第七版", course: "高等数学B", department: "理学院", isRequired: true },
    { isbn: "9787040396638", title: "大学物理学（第五版）", author: "马文蔚", publisher: "高等教育出版社", edition: "第五版", course: "大学物理", department: "理学院", isRequired: true },
    { isbn: "9787302455875", title: "数据结构（C语言版）", author: "严蔚敏", publisher: "清华大学出版社", edition: "第二版", course: "数据结构", department: "计算机学院", isRequired: true },
    { isbn: "9787111407010", title: "计算机组成原理", author: "唐朔飞", publisher: "高等教育出版社", edition: "第二版", course: "计算机组成原理", department: "计算机学院", isRequired: true },
    { isbn: "9787302517597", title: "操作系统概念（第九版）", author: "Silberschatz", publisher: "高等教育出版社", edition: "第九版", course: "操作系统", department: "计算机学院", isRequired: true },
    { isbn: "9787040472875", title: "线性代数", author: "同济大学数学系", publisher: "高等教育出版社", edition: "第六版", course: "线性代数", department: "理学院", isRequired: true },
    { isbn: "9787302330981", title: "概率论与数理统计", author: "浙江大学", publisher: "高等教育出版社", edition: "第四版", course: "概率论", department: "理学院", isRequired: true },
    { isbn: "9787121203589", title: "信号与系统", author: "郑君里", publisher: "高等教育出版社", edition: "第三版", course: "信号与系统", department: "电子工程学院", isRequired: true },
    { isbn: "9787040513097", title: "电路原理", author: "邱关源", publisher: "高等教育出版社", edition: "第五版", course: "电路原理", department: "电子工程学院", isRequired: true },
    { isbn: "9787302427445", title: "Python编程导论", author: "John Guttag", publisher: "人民邮电出版社", edition: "第二版", course: "Python程序设计", department: "计算机学院", isRequired: false },
    { isbn: "9787115417305", title: "经济学原理", author: "曼昆", publisher: "北京大学出版社", edition: "第八版", course: "微观经济学", department: "经管学院", isRequired: true },
    { isbn: "9787300256511", title: "管理学", author: "罗宾斯", publisher: "中国人民大学出版社", edition: "第十三版", course: "管理学原理", department: "管理学院", isRequired: true },
    { isbn: "9787563559589", title: "人工智能导论", author: "李德毅", publisher: "北京邮电大学出版社", edition: "第二版", course: "人工智能导论", department: "计算机学院", isRequired: false },
    { isbn: "9787302468264", title: "机器学习", author: "周志华", publisher: "清华大学出版社", edition: "第一版", course: "机器学习", department: "计算机学院", isRequired: false },
  ];

  const conditions = ["new", "like_new", "good", "acceptable"];
  const copyStatuses = ["available", "available", "available", "borrowed", "sanitizing"];

  for (const tb of textbooks) {
    const textbook = await db.textbook.create({
      data: { schoolId: school.id, ...tb, semester: "2026-spring" },
    });

    // 每本教材 2-4 个副本
    const copyCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 1; i <= copyCount; i++) {
      await db.textbookCopy.create({
        data: {
          textbookId: textbook.id,
          copyNumber: `${tb.isbn}-${String(i).padStart(3, "0")}`,
          condition: conditions[Math.floor(Math.random() * conditions.length)],
          status: copyStatuses[Math.floor(Math.random() * copyStatuses.length)],
        },
      });
    }
  }

  console.log(`Created ${textbooks.length} textbooks with copies`);

  // ==================== 订阅套餐 ====================
  await db.subscriptionPlan.createMany({
    data: [
      {
        schoolId: school.id,
        name: "春季学期基础套餐",
        semester: "2026-spring",
        price: 199,
        deposit: 100,
        description: "包含5本教材，学期末归还",
        maxBooks: 5,
        freeLateDays: 3,
      },
      {
        schoolId: school.id,
        name: "春季学期进阶套餐",
        semester: "2026-spring",
        price: 349,
        deposit: 150,
        description: "包含8本教材，含理工科必修",
        maxBooks: 8,
        freeLateDays: 5,
      },
      {
        schoolId: school.id,
        name: "学年全能套餐",
        semester: "2025-2026",
        price: 599,
        deposit: 200,
        description: "全年教材无忧，最多10本",
        maxBooks: 10,
        freeLateDays: 7,
      },
    ],
  });

  console.log("Created subscription plans");

  // ==================== 示例商品 ====================
  await db.product.createMany({
    data: [
      { schoolId: school.id, sellerId: seller.id, category: "electronics", title: "iPad Air 5 64G WiFi版", description: "自用一年，功能完好，无磕碰，配原装充电器和保护壳", price: 2800, images: JSON.stringify(["/uploads/ipad-air.png"]), status: "active", location: "1号楼" },
      { schoolId: school.id, sellerId: seller.id, category: "books", title: "考研英语真题全套", description: "2020-2025年真题详解，几乎全新", price: 45, images: JSON.stringify(["/uploads/kaoyan-english.png"]), status: "active", location: "1号楼" },
      { schoolId: school.id, sellerId: floorLeader.id, category: "furniture", title: "宿舍台灯 护眼款", description: "LED护眼台灯，三档调光，毕业清仓", price: 35, images: JSON.stringify(["/uploads/desk-lamp.png"]), status: "active", location: "1号楼" },
      { schoolId: school.id, sellerId: serviceProvider.id, category: "daily", title: "未拆封洗衣液2L装", description: "囤多了，全新未拆封", price: 18, status: "active", location: "3号楼" },
      { schoolId: school.id, sellerId: seller.id, category: "electronics", title: "罗技G304无线鼠标", description: "用了一个学期，手感好，送鼠标垫", price: 120, status: "active", location: "1号楼" },
    ],
  });

  console.log("Created sample products");

  // ==================== 示例任务 ====================
  await db.task.createMany({
    data: [
      { schoolId: school.id, publisherId: buyer.id, type: "errand", title: "帮忙取快递", description: "菜鸟驿站有一个大件，帮忙搬到2号楼502", budget: 10, budgetType: "fixed", status: "open", location: "菜鸟驿站→2号楼" },
      { schoolId: school.id, publisherId: buyer.id, type: "tutoring", title: "C语言辅导", description: "期末考试前需要辅导C语言基础，每周两次", budget: 50, budgetType: "negotiable", status: "open", location: "图书馆" },
      { schoolId: school.id, publisherId: seller.id, type: "delivery", title: "代买奶茶", description: "帮买蜜雪冰城两杯，送到1号楼301", budget: 5, budgetType: "fixed", status: "open", location: "校门口奶茶店→1号楼" },
      { schoolId: school.id, publisherId: floorLeader.id, type: "skill_exchange", title: "吉他教学换摄影", description: "我会弹吉他，想学摄影，互相教学", budget: 0, budgetType: "fixed", status: "open", location: "3号楼活动室" },
      { schoolId: school.id, publisherId: serviceProvider.id, type: "repair", title: "笔记本清灰换硅脂", description: "游戏本用了一年半需要清灰，提供工具", budget: 30, budgetType: "negotiable", status: "open", location: "3号楼" },
    ],
  });

  console.log("Created sample tasks");

  // ==================== 学校配置 ====================
  await db.schoolConfig.createMany({
    data: [
      { schoolId: school.id, key: "storage_fee_per_hour", value: "0.5" },
      { schoolId: school.id, key: "storage_max_days", value: "30" },
      { schoolId: school.id, key: "late_fee_per_day", value: "2" },
      { schoolId: school.id, key: "credit_score_initial", value: "100" },
      { schoolId: school.id, key: "credit_score_per_order", value: "2" },
      { schoolId: school.id, key: "dispute_auto_resolve_hours", value: "48" },
    ],
  });

  console.log("Created school configs");

  // ==================== 物流路线（演示用循环路线）====================
  const route = await db.logisticsRoute.create({
    data: {
      orderId: "demo_logistics",
      status: "in_transit",
      currentNode: 1,
    },
  });

  await db.logisticsNode.createMany({
    data: [
      { routeId: route.id, nodeName: "发货点 · 1号楼", sequence: 0, status: "departed", departedAt: new Date() },
      { routeId: route.id, nodeName: "中转站 · 校园快递中心", sequence: 1, status: "arrived", arrivedAt: new Date() },
      { routeId: route.id, nodeName: "收货点 · 2号楼", sequence: 2, status: "pending" },
    ],
  });

  console.log("Created demo logistics route");

  // ==================== 提示 ====================
  console.log("\n====================");
  console.log("Seed completed!");
  console.log("====================");
  console.log("Test accounts (password: 123456):");
  console.log("  Admin:          13800000001");
  console.log("  Seller:         13800000002");
  console.log("  Buyer:          13800000003");
  console.log("  Floor Leader:   13800000004");
  console.log("  Service:        13800000005");
  console.log("====================\n");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
