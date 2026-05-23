const { execSync, spawn } = require("child_process");
const path = require("path");

const isProduction = process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT;

// 1. 同步 Prisma schema（生产环境跳过本地 PG，直接用 DATABASE_URL）
console.log("[db] Syncing schema...");
try {
  execSync("npx prisma db push --accept-data-loss --skip-generate", {
    stdio: "pipe",
    cwd: __dirname.includes("scripts") ? path.join(__dirname, "..") : __dirname,
  });
  console.log("[db] Schema synced");
} catch (e) {
  console.log("[db] Schema sync skipped:", e.message?.slice(0, 100));
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
