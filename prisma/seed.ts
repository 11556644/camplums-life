import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // 清空所有表（按依赖顺序，含所有模型）
  await db.$executeRaw`TRUNCATE TABLE "CreditScoreHistory", "ForumLike", "ForumFavorite", "ForumComment", "ForumPost", "ForumBoard", "LogisticsNode", "LogisticsRoute", "InventoryTransaction", "InspectionRecord", "TextbookCopy", "Textbook", "CabinetSlotLog", "CabinetSlotOrder", "CabinetSlot", "Cabinet", "Dispute", "Rating", "Message", "WalletTransaction", "Wallet", "EventLog", "AuditLog", "CreditScore", "UserRole", "OrderItem", "Payment", "Order", "SubscriptionOrder", "SubscriptionPlan", "SchoolConfig", "Task", "Product", "ProductFavorite", "User", "School" CASCADE`;

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

  // 角色分配（admin 同时拥有 buyer 角色以使用基础功能）
  const roles = [
    { userId: admin.id, schoolId: school.id, role: "admin" },
    { userId: admin.id, schoolId: school.id, role: "buyer" },
    { userId: seller.id, schoolId: school.id, role: "seller" },
    { userId: seller.id, schoolId: school.id, role: "buyer" },
    { userId: buyer.id, schoolId: school.id, role: "buyer" },
    { userId: floorLeader.id, schoolId: school.id, role: "floor_leader" },
    { userId: floorLeader.id, schoolId: school.id, role: "buyer" },
    { userId: serviceProvider.id, schoolId: school.id, role: "service_provider" },
    { userId: serviceProvider.id, schoolId: school.id, role: "buyer" },
  ];
  await db.userRole.createMany({ data: roles });

  // 信用分（起点 600，标准等级）
  for (const user of [admin, seller, buyer, floorLeader, serviceProvider]) {
    await db.creditScore.create({ data: { userId: user.id, schoolId: school.id, score: 600, tier: "standard" } });
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
    { isbn: "9787302356288", title: "高等数学（第七版）上册", author: "同济大学数学系", publisher: "高等教育出版社", edition: "第七版", course: "高等数学A", department: "理学院", isRequired: true, originalPrice: 68 },
    { isbn: "9787302356295", title: "高等数学（第七版）下册", author: "同济大学数学系", publisher: "高等教育出版社", edition: "第七版", course: "高等数学B", department: "理学院", isRequired: true, originalPrice: 68 },
    { isbn: "9787040396638", title: "大学物理学（第五版）", author: "马文蔚", publisher: "高等教育出版社", edition: "第五版", course: "大学物理", department: "理学院", isRequired: true, originalPrice: 59 },
    { isbn: "9787302455875", title: "数据结构（C语言版）", author: "严蔚敏", publisher: "清华大学出版社", edition: "第二版", course: "数据结构", department: "计算机学院", isRequired: true, originalPrice: 49 },
    { isbn: "9787111407010", title: "计算机组成原理", author: "唐朔飞", publisher: "高等教育出版社", edition: "第二版", course: "计算机组成原理", department: "计算机学院", isRequired: true, originalPrice: 55 },
    { isbn: "9787302517597", title: "操作系统概念（第九版）", author: "Silberschatz", publisher: "高等教育出版社", edition: "第九版", course: "操作系统", department: "计算机学院", isRequired: true, originalPrice: 79 },
    { isbn: "9787040472875", title: "线性代数", author: "同济大学数学系", publisher: "高等教育出版社", edition: "第六版", course: "线性代数", department: "理学院", isRequired: true, originalPrice: 39 },
    { isbn: "9787302330981", title: "概率论与数理统计", author: "浙江大学", publisher: "高等教育出版社", edition: "第四版", course: "概率论", department: "理学院", isRequired: true, originalPrice: 42 },
    { isbn: "9787121203589", title: "信号与系统", author: "郑君里", publisher: "高等教育出版社", edition: "第三版", course: "信号与系统", department: "电子工程学院", isRequired: true, originalPrice: 56 },
    { isbn: "9787040513097", title: "电路原理", author: "邱关源", publisher: "高等教育出版社", edition: "第五版", course: "电路原理", department: "电子工程学院", isRequired: true, originalPrice: 52 },
    { isbn: "9787302427445", title: "Python编程导论", author: "John Guttag", publisher: "人民邮电出版社", edition: "第二版", course: "Python程序设计", department: "计算机学院", isRequired: false, originalPrice: 79 },
    { isbn: "9787115417305", title: "经济学原理", author: "曼昆", publisher: "北京大学出版社", edition: "第八版", course: "微观经济学", department: "经管学院", isRequired: true, originalPrice: 88 },
    { isbn: "9787300256511", title: "管理学", author: "罗宾斯", publisher: "中国人民大学出版社", edition: "第十三版", course: "管理学原理", department: "管理学院", isRequired: true, originalPrice: 75 },
    { isbn: "9787563559589", title: "人工智能导论", author: "李德毅", publisher: "北京邮电大学出版社", edition: "第二版", course: "人工智能导论", department: "计算机学院", isRequired: false, originalPrice: 45 },
    { isbn: "9787302468264", title: "机器学习", author: "周志华", publisher: "清华大学出版社", edition: "第一版", course: "机器学习", department: "计算机学院", isRequired: false, originalPrice: 65 },
    // 课外书籍
    { isbn: "9787544253994", title: "百年孤独", author: "加西亚·马尔克斯", publisher: "南海出版公司", edition: "精装版", course: null, department: null, isRequired: false, originalPrice: 55 },
    { isbn: "9787020024759", title: "红楼梦", author: "曹雪芹", publisher: "人民文学出版社", edition: "第三版", course: null, department: null, isRequired: false, originalPrice: 60 },
    { isbn: "9787544270878", title: "解忧杂货店", author: "东野圭吾", publisher: "南海出版公司", edition: "平装版", course: null, department: null, isRequired: false, originalPrice: 42 },
    { isbn: "9787530216781", title: "活着", author: "余华", publisher: "北京十月文艺出版社", edition: "精装版", course: null, department: null, isRequired: false, originalPrice: 35 },
    { isbn: "9787544291163", title: "人类简史", author: "尤瓦尔·赫拉利", publisher: "中信出版社", edition: "平装版", course: null, department: null, isRequired: false, originalPrice: 68 },
    { isbn: "9787550263680", title: "三体", author: "刘慈欣", publisher: "重庆出版社", edition: "全套", course: null, department: null, isRequired: false, originalPrice: 93 },
    { isbn: "9787532776788", title: "小王子", author: "圣埃克苏佩里", publisher: "上海译文出版社", edition: "精装版", course: null, department: null, isRequired: false, originalPrice: 32 },
    { isbn: "9787544298070", title: "挪威的森林", author: "村上春树", publisher: "南海出版公司", edition: "平装版", course: null, department: null, isRequired: false, originalPrice: 38 },
    { isbn: "9787508663364", title: "时间简史", author: "史蒂芬·霍金", publisher: "湖南科学技术出版社", edition: "插图版", course: null, department: null, isRequired: false, originalPrice: 45 },
    { isbn: "9787020002207", title: "围城", author: "钱钟书", publisher: "人民文学出版社", edition: "第二版", course: null, department: null, isRequired: false, originalPrice: 39 },
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
      { schoolId: school.id, sellerId: seller.id, category: "electronics", title: "iPad Air 5 64G WiFi版", description: "自用一年，功能完好，无磕碰，配原装充电器和保护壳", price: 2800, images: JSON.stringify(["/images/seeds/ipad-air.png"]), status: "active", location: "1号楼" },
      { schoolId: school.id, sellerId: seller.id, category: "books", title: "考研英语真题全套", description: "2020-2025年真题详解，几乎全新", price: 45, images: JSON.stringify(["/images/seeds/kaoyan-english.png"]), status: "active", location: "1号楼" },
      { schoolId: school.id, sellerId: floorLeader.id, category: "furniture", title: "宿舍台灯 护眼款", description: "LED护眼台灯，三档调光，毕业清仓", price: 35, images: JSON.stringify(["/images/seeds/desk-lamp.png"]), status: "active", location: "1号楼" },
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

  // ==================== 校园贴吧 ====================
  const boards = await Promise.all([
    db.forumBoard.create({ data: { schoolId: school.id, name: "校园生活", description: "分享日常，记录美好校园时光", icon: "🏫", sortOrder: 1 } }),
    db.forumBoard.create({ data: { schoolId: school.id, name: "学习交流", description: "学习经验、考试攻略、课程讨论", icon: "📖", sortOrder: 2 } }),
    db.forumBoard.create({ data: { schoolId: school.id, name: "情感天地", description: "倾诉心事、分享感悟", icon: "💕", sortOrder: 3 } }),
    db.forumBoard.create({ data: { schoolId: school.id, name: "求职就业", description: "实习信息、面试经验、职业规划", icon: "💼", sortOrder: 4 } }),
    db.forumBoard.create({ data: { schoolId: school.id, name: "灌水区", description: "随便聊聊，放松心情", icon: "🌊", sortOrder: 5 } }),
  ]);

  // 示例帖子
  const post1 = await db.forumPost.create({
    data: {
      schoolId: school.id, boardId: boards[0].id, authorId: buyer.id,
      title: "食堂新开的窗口味道不错！",
      content: "今天去食堂发现一楼新开了一家麻辣烫窗口，味道真的很棒！推荐大家去试试，分量也很足，人均大概15-20块。他们家的辣椒油是自己做的，特别香。",
      viewCount: 128, likeCount: 23, commentCount: 5,
    },
  });

  const post2 = await db.forumPost.create({
    data: {
      schoolId: school.id, boardId: boards[1].id, authorId: seller.id,
      title: "数据结构期末复习攻略分享",
      content: "分享一下我去年数据结构的复习方法：\n\n1. 先把课本上的例题全部做一遍\n2. 重点看二叉树、图的遍历算法\n3. 动态规划是难点，建议多刷LeetCode相关题目\n4. 考前一周做3套历年真题\n\n有需要资料的同学可以私信我，有电子版笔记和往年真题。",
      viewCount: 256, likeCount: 45, commentCount: 8,
    },
  });

  const post3 = await db.forumPost.create({
    data: {
      schoolId: school.id, boardId: boards[2].id, authorId: buyer.id,
      title: "大一快结束了，感觉时间过得好快",
      content: "转眼间大一就要结束了，感觉昨天还在军训。这一年经历了很多，认识了一群很好的室友，虽然成绩一般但学到了很多课本外的东西。希望接下来的大学生活能更加充实。",
      isAnonymous: true,
      viewCount: 512, likeCount: 67, commentCount: 12,
    },
  });

  const post4 = await db.forumPost.create({
    data: {
      schoolId: school.id, boardId: boards[3].id, authorId: serviceProvider.id,
      title: "暑假实习找工作的几点建议",
      content: "作为大三学长，给学弟学妹们几点实习建议：\n\n1. 简历要简洁突出项目经验\n2. 3-4月是春招黄金期，别错过\n3. 多关注学校就业信息网\n4. 面试前研究公司背景和岗位需求\n5. 技术面多刷题，HR面准备好自我介绍\n\n加油！",
      viewCount: 384, likeCount: 89, commentCount: 15,
    },
  });

  // 示例评论
  await db.forumComment.createMany({
    data: [
      { postId: post1.id, authorId: seller.id, content: "确实好吃！他们家的丸子也很Q弹", likeCount: 5 },
      { postId: post1.id, authorId: serviceProvider.id, content: "谢谢推荐，明天去尝尝", likeCount: 2 },
      { postId: post2.id, authorId: buyer.id, content: "学长太好了！请问笔记可以分享一下吗？", likeCount: 8 },
      { postId: post2.id, authorId: floorLeader.id, content: "补充一下，链表相关的题目也经常考", likeCount: 12 },
      { postId: post3.id, authorId: seller.id, content: "同感，感觉每天都很忙但又不知道忙了什么", isAnonymous: true, likeCount: 15 },
      { postId: post4.id, authorId: buyer.id, content: "请问学长是哪个专业的？", likeCount: 3 },
    ],
  });

  // 更新板块帖子数
  await db.forumBoard.update({ where: { id: boards[0].id }, data: { postCount: 1 } });
  await db.forumBoard.update({ where: { id: boards[1].id }, data: { postCount: 1 } });
  await db.forumBoard.update({ where: { id: boards[2].id }, data: { postCount: 1 } });
  await db.forumBoard.update({ where: { id: boards[3].id }, data: { postCount: 1 } });

  console.log("Created forum boards and sample posts");

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
