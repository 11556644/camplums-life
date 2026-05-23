const { execSync, spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");
const https = require("https");

const PG_DIR = path.join(os.homedir(), ".campus-pg");
const PG_DATA = path.join(PG_DIR, "data");
const PG_BIN = path.join(PG_DIR, "bin");
const PG_PORT = 5432;
const DB_NAME = "campus_life";
const DB_USER = "campus";
const DB_PASS = "campus123";
const PG_URL = "https://get.enterprisedb.com/postgresql/postgresql-16.9-1-windows-x64-binaries.zip";
const PG_ZIP = path.join(os.homedir(), ".campus-pg.zip");

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = (u) => {
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          request(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        const total = parseInt(res.headers["content-length"] || "0");
        let downloaded = 0;
        res.on("data", (chunk) => {
          downloaded += chunk.length;
          if (total > 0) process.stdout.write(`\rDownloading PostgreSQL: ${Math.round(downloaded / total * 100)}%`);
        });
        res.pipe(file);
        file.on("finish", () => { file.close(); console.log("\nDownload complete"); resolve(); });
      }).on("error", reject);
    };
    request(url);
  });
}

function runPg(cmd, args, opts = {}) {
  const fullCmd = path.join(PG_BIN, cmd);
  try {
    return execSync(`"${fullCmd}" ${args}`, { encoding: "utf-8", ...opts });
  } catch (e) {
    throw new Error(`${cmd} failed: ${e.stderr || e.message}`);
  }
}

function startPgServer() {
  return new Promise((resolve, reject) => {
    const pgBin = path.join(PG_BIN, "pg_ctl.exe");
    const child = spawn(pgBin, [
      "start", "-D", PG_DATA, "-l", path.join(PG_DIR, "pg.log"),
      "-o", `-p ${PG_PORT}`
    ], { stdio: "pipe", env: { ...process.env, LC_ALL: "C" } });

    let output = "";
    child.stdout.on("data", (d) => { output += d.toString(); });
    child.stderr.on("data", (d) => { output += d.toString(); });
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`pg_ctl start failed (code ${code}): ${output}`));
    });
  });
}

async function main() {
  const envPath = path.join(__dirname, "..", ".env");

  // 1. 检查 PostgreSQL 二进制是否存在
  const pgBinExe = path.join(PG_BIN, "psql.exe");
  if (!fs.existsSync(pgBinExe)) {
    console.log("PostgreSQL binaries not found, downloading...");
    if (!fs.existsSync(PG_ZIP)) {
      await download(PG_URL, PG_ZIP);
    }

    console.log("Extracting...");
    // 用 PowerShell 解压
    execSync(`powershell -Command "Expand-Archive -Path '${PG_ZIP}' -DestinationPath '${PG_DIR}' -Force"`, { stdio: "inherit" });

    // PostgreSQL zip 解压后在 pgsql 子目录
    const extractedDir = path.join(PG_DIR, "pgsql");
    if (fs.existsSync(extractedDir)) {
      // 移动内容到 PG_DIR
      const items = fs.readdirSync(extractedDir);
      for (const item of items) {
        const src = path.join(extractedDir, item);
        const dest = path.join(PG_DIR, item);
        if (!fs.existsSync(dest)) fs.renameSync(src, dest);
      }
      fs.rmdirSync(extractedDir, { recursive: true });
    }

    // zip 里 bin 在 bin/ 子目录
    if (!fs.existsSync(pgBinExe)) {
      console.log("ERROR: PostgreSQL binaries not found after extraction");
      console.log("Contents:", fs.readdirSync(PG_DIR));
      process.exit(1);
    }
    console.log("PostgreSQL binaries installed to", PG_DIR);
  }

  // 2. 初始化数据目录
  if (!fs.existsSync(PG_DATA)) {
    console.log("Initializing database...");
    runPg("initdb.exe", `-D "${PG_DATA}" -U ${DB_USER} --encoding=UTF8 --locale=C --auth=trust`);
    console.log("Database initialized");

    // 修改 pg_hba.conf 允许密码登录
    const hbaPath = path.join(PG_DATA, "pg_hba.conf");
    let hba = fs.readFileSync(hbaPath, "utf-8");
    hba = hba.replace(/host\s+all\s+all\s+127\.0\.0\.1\/32\s+scram-sha-256/g,
      "host all all 127.0.0.1/32 md5");
    hba = hba.replace(/host\s+all\s+all\s+::1\/128\s+scram-sha-256/g,
      "host all all ::1/128 md5");
    fs.writeFileSync(hbaPath, hba);

    // 设置密码
    const pwPath = path.join(PG_DATA, "pg_hba.conf");
    // 写入 postgresql.conf 端口
    const confPath = path.join(PG_DATA, "postgresql.conf");
    let conf = fs.readFileSync(confPath, "utf-8");
    conf += `\nport = ${PG_PORT}\nlisten_addresses = 'localhost'\n`;
    fs.writeFileSync(confPath, conf);
  }

  // 3. 启动 PostgreSQL
  console.log("Starting PostgreSQL...");
  try {
    startPgServer();
    // 等待启动
    let retries = 0;
    while (retries < 30) {
      try {
        runPg("pg_isready.exe", `-p ${PG_PORT}`);
        break;
      } catch {
        retries++;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (retries >= 30) throw new Error("PostgreSQL failed to start within 30 seconds");
    console.log("PostgreSQL running on port", PG_PORT);
  } catch (e) {
    console.log("Starting fresh...");
    // 可能已经在运行
    try { runPg("pg_ctl.exe", `stop -D "${PG_DATA}" -m fast`); } catch {}
    await new Promise((r) => setTimeout(r, 2000));
    startPgServer();
    await new Promise((r) => setTimeout(r, 5000));
  }

  // 4. 设置密码
  try {
    runPg("psql.exe", `-U postgres -p ${PG_PORT} -c "ALTER USER postgres PASSWORD '${DB_PASS}';"`, {
      env: { ...process.env, PGPASSWORD: "" }
    });
  } catch {}

  // 5. 创建数据库
  try {
    runPg("createdb.exe", `-U postgres -p ${PG_PORT} -O ${DB_USER} ${DB_NAME}`, {
      env: { ...process.env, PGPASSWORD: DB_PASS }
    });
    console.log(`Database "${DB_NAME}" created`);
  } catch (e) {
    if (e.message.includes("already exists")) {
      console.log(`Database "${DB_NAME}" already exists`);
    } else {
      // 用 postgres 用户创建
      try {
        runPg("psql.exe", `-U postgres -p ${PG_PORT} -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"`, {
          env: { ...process.env, PGPASSWORD: DB_PASS }
        });
      } catch {}
    }
  }

  const dbUrl = `postgresql://${DB_USER}:${DB_PASS}@localhost:${PG_PORT}/${DB_NAME}?schema=public`;

  // 6. 写入 .env
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";
  if (envContent.includes("DATABASE_URL=")) {
    envContent = envContent.replace(/DATABASE_URL=.*/, `DATABASE_URL="${dbUrl}"`);
  } else {
    envContent = `DATABASE_URL="${dbUrl}"\n` + envContent;
  }
  if (!envContent.includes("JWT_SECRET")) {
    envContent += `\nJWT_SECRET="campus-life-jwt-secret-${Date.now()}"\n`;
  }
  fs.writeFileSync(envPath, envContent);
  console.log(".env updated");

  // 7. Prisma 迁移
  console.log("Running Prisma db push...");
  execSync("npx prisma db push --accept-data-loss", {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: dbUrl },
  });

  // 8. Seed
  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const count = await db.user.count();
    if (count === 0) {
      console.log("Seeding...");
      execSync("npx tsx prisma/seed.ts", {
        stdio: "inherit",
        cwd: path.join(__dirname, ".."),
        env: { ...process.env, DATABASE_URL: dbUrl },
      });
    } else {
      console.log(`${count} users exist, skipping seed`);
    }
  } finally {
    await db.$disconnect();
  }

  console.log("\n========================================");
  console.log("PostgreSQL ready!");
  console.log(`DATABASE_URL: ${dbUrl}`);
  console.log("========================================\n");

  // 保持运行
  process.on("SIGINT", () => {
    console.log("\nStopping PostgreSQL...");
    try { runPg("pg_ctl.exe", `stop -D "${PG_DATA}" -m fast`); } catch {}
    process.exit(0);
  });
  await new Promise(() => {});
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
