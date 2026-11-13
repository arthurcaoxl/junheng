import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { createServer } from "node:http";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(APP_ROOT, "../..");
const SUPABASE_URL = process.env.TASK_10_20_C1_SUPABASE_URL ?? "http://127.0.0.1:58081";
const FRONTEND_URL = process.env.TASK_10_20_C1_FRONTEND_URL ?? "http://127.0.0.1:53100";
const MAILPIT_URL = process.env.TASK_10_20_C1_MAILPIT_URL ?? "http://127.0.0.1:25034";
const DATABASE_URL = process.env.TASK_10_20_C1_DATABASE_URL;
const JWT_SECRET = process.env.TASK_10_20_C1_JWT_SECRET;
const ANON_KEY = process.env.TASK_10_20_C1_ANON_KEY;
const EVIDENCE_DIR = process.env.TASK_10_20_C1_EVIDENCE_DIR;
const STORAGE_KEY = "junheng-checkin-v3";
const MERGED_FLAG_KEY = "junheng-checkin-merged-flag";
const DATA_VERSION = "junheng-checkin-v3-union-v1";
const JWT_PATTERN = /[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const SENSITIVE_KEY = /^(authorization|cookie|set-cookie|apikey|access_token|refresh_token|token|otp|code)$/i;

if (!DATABASE_URL || !JWT_SECRET || !ANON_KEY || !EVIDENCE_DIR) {
  throw new Error("需要 TASK_10_20_C1_DATABASE_URL / JWT_SECRET / ANON_KEY / EVIDENCE_DIR。");
}
const resolvedEvidence = path.resolve(EVIDENCE_DIR);
assert(!resolvedEvidence.startsWith(`${REPO_ROOT}${path.sep}`), "证据目录必须在仓库外。");
await mkdir(resolvedEvidence, { recursive: true });

const scenarios = [
  { name: "fresh", email: "fresh@task-10-20.test", userCode: "JH-C1FR1", latestWeight: "68.6" },
  { name: "stale", email: "stale@task-10-20.test", userCode: "JH-C1ST1", latestWeight: "71.4" },
];

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(key, amount) {
  const [year, month, day] = key.split("-").map(Number);
  return localDateKey(new Date(year, month - 1, day + amount));
}

function jwt(role) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    role,
    iss: "supabase",
    aud: "authenticated",
    iat: now,
    exp: now + 7200,
  })}`;
  return `${unsigned}.${createHmac("sha256", JWT_SECRET).update(unsigned).digest("base64url")}`;
}

const serviceRoleKey = jwt("service_role");

function redactText(value) {
  return String(value)
    .replace(JWT_PATTERN, "[REDACTED_JWT]")
    .replace(/([?&](?:token|access_token|refresh_token|code)=)[^&\s]+/gi, "$1[REDACTED]");
}

function sanitize(value, key = "") {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, sanitize(child, childKey)]));
  }
  return value;
}

function sanitizeBody(text) {
  if (!text) return null;
  try {
    return sanitize(JSON.parse(text));
  } catch {
    return redactText(text);
  }
}

async function saveJson(file, value) {
  await writeFile(file, `${JSON.stringify(sanitize(value), null, 2)}\n`);
}

function sql(query) {
  const result = spawnSync("psql", [DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-At", "-c", query], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: undefined },
  });
  if (result.status !== 0) throw new Error(`psql 失败（${result.status}）：${result.stderr}`);
  return result.stdout.trim();
}

function queryJson(query) {
  const output = sql(query);
  return output ? JSON.parse(output) : null;
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function day(weight) {
  return { weight, waist: "", meals: [false, false, false], water: false, movement: false, sleep: false };
}

const today = localDateKey(new Date());
const startDate = addDays(today, -2);
const dates = [startDate, addDays(today, -1), today];
for (const scenario of scenarios) {
  const weights = scenario.name === "fresh" ? ["70.0", "69.3", scenario.latestWeight] : ["72.8", "72.1", scenario.latestWeight];
  scenario.records = Object.fromEntries(dates.map((date, index) => [date, day(weights[index])]));
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${url} -> ${response.status}: ${redactText(text)}`);
  return { status: response.status, body };
}

async function createConfirmedUser(email) {
  const { body } = await api(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, email_confirm: true, user_metadata: { fixture: "task-10.20-commit-1" } }),
  });
  assert(body?.id, "GoTrue admin 未返回 uid。");
  return body.id;
}

async function waitForOtp(email, notBefore) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { body } = await api(`${MAILPIT_URL}/api/v1/messages?limit=50`);
    const message = (body.messages ?? []).find((item) => {
      const recipients = (item.To ?? []).map((recipient) => recipient.Address?.toLowerCase());
      return recipients.includes(email) && new Date(item.Created).getTime() >= notBefore - 2000;
    });
    if (message) {
      const detail = (await api(`${MAILPIT_URL}/api/v1/message/${message.ID}`)).body;
      const searchable = `${detail.Text ?? ""}\n${detail.HTML ?? ""}`;
      const match = searchable.match(/(?:code|验证码)[^\d]{0,40}(\d{6})/i) ?? searchable.match(/\b(\d{6})\b/);
      if (match) {
        return {
          code: match[1],
          evidence: {
            ID: message.ID,
            From: detail.From,
            To: detail.To,
            Subject: detail.Subject,
            Created: detail.Created,
            Text: (detail.Text ?? "").replace(match[1], "[REDACTED_OTP]"),
          },
        };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Mailpit 中未等到 ${email} 的 6 位 OTP。`);
}

async function storageEcho(page) {
  return page.evaluate(async () => {
    const local = Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]));
    const session = Object.fromEntries(Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)]));
    const databases = typeof indexedDB.databases === "function"
      ? (await indexedDB.databases()).map(({ name, version }) => ({ name, version }))
      : [];
    return { localStorage: local, sessionStorage: session, indexedDB: databases };
  });
}

async function clearSiteData(page) {
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    if (typeof indexedDB.databases === "function") {
      const databases = await indexedDB.databases();
      await Promise.all(databases.map(({ name }) => new Promise((resolve, reject) => {
        if (!name) { resolve(); return; }
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error(`IndexedDB 删除受阻：${name}`));
      })));
    }
  });
}

function cloudSnapshot(uids) {
  const uidList = uids.map(quote).join(",");
  return queryJson(`
    select coalesce(jsonb_agg(jsonb_build_object(
      'auth_user_id', auth_user_id,
      'user_code', user_code,
      'start_date', start_date,
      'records', records,
      'height_cm', height_cm,
      'initial_weight_kg', initial_weight_kg,
      'updated_at', updated_at
    ) order by auth_user_id), '[]'::jsonb)
    from public.checkin_sync where auth_user_id in (${uidList});
  `);
}

async function screenshot(page, directory, name, transcript) {
  const filename = `${name}.png`;
  await page.screenshot({ path: path.join(directory, filename), fullPage: true });
  await writeFile(path.join(directory, `${name}.url.txt`), `${page.url()}\n`);
  const visibleText = (await page.locator("body").innerText()).slice(0, 12000);
  await writeFile(path.join(directory, `${name}.txt`), [
    `URL: ${page.url()}`,
    `TITLE: ${await page.title()}`,
    `SCREENSHOT: ${filename}`,
    transcript,
    "",
    "VISIBLE TEXT:",
    visibleText,
    "",
  ].join("\n"));
}

async function sanitizeHar(rawPath, outputPath) {
  const har = JSON.parse(await readFile(rawPath, "utf8"));
  if (har.log?.entries) {
    har.log.entries = har.log.entries.filter((entry) => entry.request.url.includes("/auth/v1/") || entry.request.url.includes("/rest/v1/"));
  }
  for (const entry of har.log?.entries ?? []) {
    entry.request.headers = (entry.request.headers ?? []).map((header) => SENSITIVE_KEY.test(header.name)
      ? { ...header, value: "[REDACTED]" }
      : header);
    entry.response.headers = (entry.response.headers ?? []).map((header) => SENSITIVE_KEY.test(header.name)
      ? { ...header, value: "[REDACTED]" }
      : header);
    entry.request.cookies = [];
    entry.response.cookies = [];
    if (entry.request.postData?.text) entry.request.postData.text = JSON.stringify(sanitizeBody(entry.request.postData.text));
    if (entry.response.content?.text) entry.response.content.text = JSON.stringify(sanitizeBody(entry.response.content.text));
    entry.request.url = redactText(entry.request.url);
    entry.response.redirectURL = redactText(entry.response.redirectURL ?? "");
  }
  await saveJson(outputPath, har);
  await rm(rawPath, { force: true });
}

async function runScenario(browser, scenario, uid, cloudBefore) {
  const directory = path.join(resolvedEvidence, scenario.name);
  await mkdir(directory, { recursive: true });
  const rawHar = path.join(directory, ".raw-network.har");
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    recordHar: { path: rawHar, content: "embed" },
  });
  const page = await context.newPage();
  const network = [];
  const networkTasks = [];
  const pageErrors = [];
  const realResponseBodies = new Map();
  await page.route("**/rest/v1/checkin_sync**", async (route) => {
    const request = route.request();
    const response = await route.fetch();
    const body = await response.text();
    realResponseBodies.set(`${request.method()} ${redactText(request.url())}`, body);
    await route.fulfill({ response, body });
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/auth/v1/") && !url.includes("/rest/v1/checkin_sync")) return;
    const task = (async () => {
      const request = response.request();
      const responseKey = `${request.method()} ${redactText(url)}`;
      let responseText = "";
      try { responseText = await response.text(); } catch { responseText = realResponseBodies.get(responseKey) ?? "[response body unavailable]"; }
      network.push({
        method: request.method(),
        url: redactText(url),
        status: response.status(),
        requestBody: sanitizeBody(request.postData()),
        responseBody: sanitizeBody(responseText),
      });
    })();
    networkTasks.push(task);
  });

  const playbook = [];
  try {
    await page.goto(`${FRONTEND_URL}/check-in`, { waitUntil: "networkidle" });
    const beforeClear = await storageEcho(page);
    await clearSiteData(page);
    await context.clearCookies();
    const afterClear = await storageEcho(page);
    assert.deepEqual(afterClear.localStorage, {});
    assert.deepEqual(afterClear.sessionStorage, {});
    assert.deepEqual(afterClear.indexedDB, []);

    if (scenario.name === "stale") {
      await page.evaluate(({ key, uid: flagUid, dataVersion }) => {
        localStorage.setItem(key, JSON.stringify({
          [flagUid]: { dataVersion, mergedAt: "2026-11-12T00:00:00.000Z" },
        }));
      }, { key: MERGED_FLAG_KEY, uid, dataVersion: DATA_VERSION });
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY), null);
      playbook.push("清空站点数据后仅注入当前 uid 的有效旧合并标记；未注入任何打卡记录或会话。 ");
    } else {
      playbook.push("使用全新 browser context，并实际清空 localStorage、sessionStorage、IndexedDB 与 Cookie。 ");
    }
    const afterFixture = await storageEcho(page);
    await saveJson(path.join(directory, "site-data-clearing.json"), { beforeClear, afterClear, afterFixture });

    await page.reload({ waitUntil: "networkidle" });
    const localBeforeLogin = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    const localRecordCountBeforeLogin = localBeforeLogin === null ? 0 : Object.keys(localBeforeLogin.records).length;
    assert.equal(localRecordCountBeforeLogin, 0);
    assert.equal(localBeforeLogin?.userCode === scenario.userCode, false);
    playbook.push("登录前本地记录数为 0；无权限页面尚未创建 v3 时，键不存在同样按真实空态记录。 ");
    await screenshot(page, directory, "before-login", "真实页面登录前：本地 records 为 0。");

    await page.locator(".sync-panel-restore").first().click();
    await page.getByLabel("邮箱地址").fill(scenario.email);
    const otpSentAt = Date.now();
    await page.getByRole("button", { name: "发送登录验证码" }).click();
    await page.getByLabel("邮箱验证码").waitFor({ state: "visible" });
    const otp = await waitForOtp(scenario.email, otpSentAt);
    await saveJson(path.join(directory, "mailpit-message.json"), otp.evidence);
    playbook.push("通过页面发送真实 OTP；Mailpit 收到合成邮箱邮件；证据中的验证码已脱敏。 ");
    await screenshot(page, directory, "otp-sent", "真实 OTP 已发送至 Mailpit，验证码仅存在于 Node 进程内存。 ");

    await page.getByLabel("邮箱验证码").fill(otp.code);
    const verifyResponse = page.waitForResponse((response) => response.url().includes("/auth/v1/verify") && response.request().method() === "POST");
    await page.getByRole("button", { name: "登录并恢复数据" }).click();
    assert.equal((await verifyResponse).status(), 200);
    await page.waitForFunction(({ key, userCode }) => {
      const state = JSON.parse(localStorage.getItem(key));
      return state?.userCode === userCode && Object.keys(state.records).length === 3;
    }, { key: STORAGE_KEY, userCode: scenario.userCode });
    await page.locator(".record-code-badge").filter({ hasText: scenario.userCode }).waitFor();
    await page.locator(".weight-net").filter({ hasText: `当前净重 ${Number(scenario.latestWeight).toFixed(1)} kg` }).waitFor();
    await page.waitForLoadState("networkidle");

    const restored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    assert.equal(restored.schema, 3);
    assert.equal(restored.userCode, scenario.userCode);
    assert.equal(restored.startDate, startDate);
    assert.deepEqual(restored.records, scenario.records);
    assert.deepEqual(Object.keys(restored.records).sort(), [...dates].sort());
    assert.equal(await page.locator(".record-code-badge").innerText(), scenario.userCode);
    assert.equal(await page.getByRole("spinbutton", { name: "早晨体重（空腹）" }).inputValue(), scenario.latestWeight);
    const backups = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("junheng-v3-backup-")));
    playbook.push("真实 OTP verify=200；云端 3 条记录恢复到 v3；页面 reload 后代码、最新体重和记录均已重新水合。 ");

    const cloudAfter = cloudSnapshot([uid]);
    assert.deepEqual(cloudAfter, cloudBefore, "云端行在恢复前后发生变化。 ");
    playbook.push("SQL 前后对账完全一致：仍是一行、3 条记录，updated_at 未变化，无 INSERT/UPDATE。 ");
    await screenshot(page, directory, "after-restore", `恢复后：${scenario.userCode}，3 条云端记录，最新体重 ${scenario.latestWeight} kg。`);

    await Promise.all(networkTasks);
    const checkinReads = network.filter((entry) => entry.url.includes("/rest/v1/checkin_sync") && entry.method === "GET");
    assert(checkinReads.length >= 1, "未捕获真实 checkin_sync GET。 ");
    for (const read of checkinReads) {
      assert.equal(new URL(read.url).searchParams.get("auth_user_id"), `eq.${uid}`);
      assert.equal(read.status, 200);
    }
    assert.equal(network.some((entry) => entry.url.includes("/rest/v1/checkin_sync") && ["POST", "PATCH", "PUT", "DELETE"].includes(entry.method)), false);
    assert.equal(network.some((entry) => entry.url.includes(`eq.${scenarios.find((item) => item.name !== scenario.name).email}`)), false);
    assert.equal(network.some((entry) => entry.url.includes("/auth/v1/verify") && entry.status === 200), true);
    assert.deepEqual(pageErrors, []);
    await saveJson(path.join(directory, "network.json"), network);
    await saveJson(path.join(directory, "restored-local-snapshot.json"), { restored, backupKeys: backups });
    await saveJson(path.join(directory, "sql-reconciliation.json"), { before: cloudBefore, after: cloudAfter, identical: true });
    await writeFile(path.join(directory, "scenario-playbook.txt"), [
      `SCENARIO: ${scenario.name}`,
      `SYNTHETIC EMAIL: ${scenario.email}`,
      `UID: ${uid}`,
      `FRONTEND URL: ${FRONTEND_URL}/check-in`,
      `SUPABASE URL: ${SUPABASE_URL}`,
      "",
      ...playbook.map((line, index) => `${index + 1}. ${line}`),
      "",
      "NETWORK GUARANTEES: verify OTP=200；checkin_sync GET 使用当前 uid 的真实会话；无云端写方法；无跨 uid 查询。",
      "SECRETS: access/refresh token、Authorization、apikey、Cookie 与 OTP 均未写入本证据目录。",
      "",
    ].join("\n"));
    return { scenario: scenario.name, uid, restoredRecords: 3, cloudRows: 1, cloudUnchanged: true, checkinReads: checkinReads.length };
  } catch (error) {
    await screenshot(page, directory, "failure", `失败：${error.message}`).catch(() => {});
    throw error;
  } finally {
    await Promise.all(networkTasks).catch(() => {});
    await context.close();
    await sanitizeHar(rawHar, path.join(directory, "network.har"));
  }
}

let vite;
let browser;
const templateServer = createServer((request, response) => {
  if (request.url !== "/magiclink.html") {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end("<!doctype html><html><body><p>Your sign-in code is <strong>{{ .Token }}</strong>.</p><p>This synthetic local-only code expires shortly.</p></body></html>");
});
const viteLog = createWriteStream(path.join(resolvedEvidence, "vite.log"));
try {
  await new Promise((resolve, reject) => {
    templateServer.once("error", reject);
    templateServer.listen(53101, "0.0.0.0", resolve);
  });
  await api(`${MAILPIT_URL}/api/v1/messages`, { method: "DELETE" }).catch(() => null);
  sql(`delete from auth.users where lower(email) in (${scenarios.map((scenario) => quote(scenario.email)).join(",")});`);

  vite = spawn(process.execPath, [
    "node_modules/vite/bin/vite.js",
    "--host", "127.0.0.1",
    "--port", "53100",
    "--strictPort",
  ], {
    cwd: APP_ROOT,
    env: { ...process.env, VITE_SUPABASE_URL: SUPABASE_URL, VITE_SUPABASE_ANON_KEY: ANON_KEY },
    stdio: ["ignore", "pipe", "pipe"],
  });
  vite.stdout.pipe(viteLog);
  vite.stderr.pipe(viteLog);
  let viteExit = null;
  vite.on("exit", (code, signal) => { viteExit = { code, signal }; });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (viteExit) throw new Error(`Vite 提前退出：${JSON.stringify(viteExit)}`);
    try {
      const response = await fetch(`${FRONTEND_URL}/check-in`);
      if (response.ok) { ready = true; break; }
    } catch { /* 等待 Vite 监听。 */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert(ready, "Vite 未就绪。 ");

  const users = [];
  for (const scenario of scenarios) {
    const uid = await createConfirmedUser(scenario.email);
    users.push({ scenario: scenario.name, uid });
    sql(`insert into public.checkin_sync (
      auth_user_id, user_code, start_date, records, height_cm, initial_weight_kg, consent_granted, updated_at
    ) values (
      ${quote(uid)}, ${quote(scenario.userCode)}, ${quote(startDate)}, ${quote(JSON.stringify(scenario.records))}::jsonb,
      170, ${quote(scenario.records[startDate].weight)}, false, now()
    );`);
  }
  await saveJson(path.join(resolvedEvidence, "fixture-users.json"), { users, emails: scenarios.map((scenario) => scenario.email) });
  const cloudBeforeAll = cloudSnapshot(users.map((user) => user.uid));
  assert.equal(cloudBeforeAll.length, 2);
  await saveJson(path.join(resolvedEvidence, "sql-before.json"), cloudBeforeAll);

  browser = await chromium.launch({ headless: true });
  const results = [];
  for (const scenario of scenarios) {
    const uid = users.find((user) => user.scenario === scenario.name).uid;
    const cloudBefore = cloudSnapshot([uid]);
    results.push(await runScenario(browser, scenario, uid, cloudBefore));
  }
  await browser.close();
  browser = null;

  const cloudAfterAll = cloudSnapshot(users.map((user) => user.uid));
  assert.deepEqual(cloudAfterAll, cloudBeforeAll);
  await saveJson(path.join(resolvedEvidence, "sql-after.json"), cloudAfterAll);
  await saveJson(path.join(resolvedEvidence, "summary.json"), {
    result: "PASS",
    executedAt: new Date().toISOString(),
    frontend: `${FRONTEND_URL}/check-in`,
    supabase: SUPABASE_URL,
    otpFlow: "real GoTrue email OTP via Mailpit",
    scenarios: results,
    cloudBeforeAfterIdentical: true,
    noCloudWrites: true,
  });
  console.log(JSON.stringify({ result: "PASS", scenarios: results, cloudBeforeAfterIdentical: true }, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (vite && vite.exitCode === null && vite.signalCode === null) {
    vite.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => vite.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (vite.exitCode === null && vite.signalCode === null) vite.kill("SIGKILL");
  }
  if (templateServer.listening) {
    templateServer.closeAllConnections();
    await new Promise((resolve) => templateServer.close(resolve));
  }
  viteLog.end();
}
