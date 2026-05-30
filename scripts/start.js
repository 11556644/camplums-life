const { execSync, spawn } = require("child_process");
const path = require("path");

const isProduction = process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT;

// 1. 同步 Prisma schema（安全模式，不丢数据）
console.log("[db] Syncing schema...");
try {
  // 生产环境：不使用 --accept-data-loss，只做安全的增量变更（如 ADD COLUMN）
  // 如果 schema 有破坏性变更（删列/改类型），这里会报错，需要手动处理
  const flags = isProduction
    ? "--skip-generate"
    : "--accept-data-loss --skip-generate";
  execSync(`npx prisma db push ${flags}`, {
    stdio: "pipe",
    cwd: __dirname.includes("scripts") ? path.join(__dirname, "..") : __dirname,
  });
  console.log("[db] Schema synced");
} catch (e) {
  console.log("[db] Schema sync failed:", e.message?.slice(0, 200));
  if (isProduction) {
    console.log("[db] ⚠️ Production schema sync failed. If you have breaking changes, run manually: npx prisma db push --accept-data-loss");
  }
}

// 2. 启动 Next.js
console.log("[app] Starting Next.js...");
const isWin = process.platform === "win32";
const next = spawn(isWin ? "npx.cmd" : "npx", ["next", "start", "-p", process.env.PORT || "3000"], {
  stdio: "inherit",
  cwd: __dirname.includes("scripts") ? path.join(__dirname, "..") : __dirname,
  env: { ...process.env },
});

process.on("SIGINT", () => { next.kill("SIGINT"); process.exit(0); });
process.on("SIGTERM", () => { next.kill("SIGTERM"); process.exit(0); });
next.on("close", (code) => process.exit(code || 0));
