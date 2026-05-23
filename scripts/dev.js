const { execSync, spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");

const PG_DIR = path.join(os.homedir(), ".campus-pg");
const PG_DATA = path.join(PG_DIR, "data");
const PG_BIN = path.join(PG_DIR, "bin");
const PG_PORT = 5432;

function isPgRunning() {
  try {
    execSync(`"${path.join(PG_BIN, "pg_isready.exe")}" -p ${PG_PORT}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function startPg() {
  const pgCtl = path.join(PG_BIN, "pg_ctl.exe");
  const logFile = path.join(PG_DIR, "pg.log");

  if (!fs.existsSync(pgCtl)) {
    console.log("[db] PostgreSQL not installed. Run: npm run db:start");
    process.exit(1);
  }

  console.log("[db] Starting PostgreSQL...");
  try {
    execSync(`"${pgCtl}" start -D "${PG_DATA}" -l "${logFile}" -o "-p ${PG_PORT}"`, {
      stdio: "pipe",
      env: { ...process.env, LC_ALL: "C" },
    });
  } catch (e) {
    // 可能已经在运行
    if (!isPgRunning()) {
      console.error("[db] Failed to start PostgreSQL:", e.message);
      process.exit(1);
    }
  }

  // 等待就绪
  let retries = 0;
  while (!isPgRunning() && retries < 30) {
    execSync("sleep 1 2>/dev/null || timeout /t 1 /nobreak >nul 2>&1", { stdio: "pipe" });
    retries++;
  }

  if (!isPgRunning()) {
    console.error("[db] PostgreSQL failed to start within 30 seconds");
    process.exit(1);
  }
  console.log("[db] PostgreSQL ready on port " + PG_PORT);
}

// 1. 确保 PostgreSQL 运行
if (!isPgRunning()) {
  startPg();
} else {
  console.log("[db] PostgreSQL already running");
}

// 2. 同步 Prisma schema（静默）
try {
  execSync("npx prisma db push --accept-data-loss --skip-generate", {
    stdio: "pipe",
    cwd: path.join(__dirname, ".."),
  });
} catch {}

// 3. 启动 Next.js dev server
console.log("[app] Starting Next.js dev server...");
const isWin = process.platform === "win32";
const nextDev = spawn(isWin ? "npx.cmd" : "npx", ["next", "dev"], {
  stdio: "inherit",
  cwd: path.join(__dirname, ".."),
  env: { ...process.env },
});

// 优雅关闭
process.on("SIGINT", () => {
  nextDev.kill("SIGINT");
  process.exit(0);
});
process.on("SIGTERM", () => {
  nextDev.kill("SIGTERM");
  process.exit(0);
});

nextDev.on("close", (code) => {
  process.exit(code || 0);
});
