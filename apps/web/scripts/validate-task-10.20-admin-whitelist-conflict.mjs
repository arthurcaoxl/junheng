import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(APP_ROOT, "../..");
const SUPABASE_URL = process.env.TASK_10_20_C3_SUPABASE_URL ?? "http://127.0.0.1:58082";
const FRONTEND_URL = process.env.TASK_10_20_C3_FRONTEND_URL ?? "http://127.0.0.1:53102";
const DATABASE_URL = process.env.TASK_10_20_C3_DATABASE_URL;
const JWT_SECRET = process.env.TASK_10_20_C3_JWT_SECRET;
const ANON_KEY = process.env.TASK_10_20_C3_ANON_KEY;
const EVIDENCE_DIR = process.env.TASK_10_20_C3_EVIDENCE_DIR;
const ADMIN_EMAIL = "admin@task-10-20.test";
const BASE_EMAIL = "base@task-10-20.test";
const A_EMAIL = "a@task-10-20.test";
const B_EMAIL = "b@task-10-20.test";
const ADD_RPC = "admin_add_seed_user_whitelist_email";
const GET_RPC = "admin_get_seed_user_whitelist";
const JWT_PATTERN = /[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const SENSITIVE_KEY = /^(authorization|cookie|set-cookie|apikey|access_token|refresh_token|token|otp)$/i;

if (!DATABASE_URL || !JWT_SECRET || !ANON_KEY || !EVIDENCE_DIR) {
  throw new Error("需要 TASK_10_20_C3_DATABASE_URL / JWT_SECRET / ANON_KEY / EVIDENCE_DIR。");
}
const database = new URL(DATABASE_URL);
assert(["127.0.0.1", "localhost"].includes(database.hostname), "只允许本机一次性数据库。");
assert.equal(database.pathname, "/checkin_admin_whitelist_e2e", "数据库名称不是本轨专用临时库。 ");
for (const value of [SUPABASE_URL, FRONTEND_URL]) {
  assert(["127.0.0.1", "localhost"].includes(new URL(value).hostname), "只允许本机服务地址。");
}
const resolvedEvidence = path.resolve(EVIDENCE_DIR);
assert(
  resolvedEvidence !== REPO_ROOT && !resolvedEvidence.startsWith(`${REPO_ROOT}${path.sep}`),
  "证据目录必须在仓库外。",
);
await mkdir(resolvedEvidence, { recursive: true });
assert.deepEqual(await readdir(resolvedEvidence), [], "证据目录必须为空，禁止混入旧结果。 ");

const adminUid = randomUUID();
const now = Math.floor(Date.now() / 1000);
const expiresIn = 7200;

function jwt(role, withUser = false) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const claims = {
    role,
    iss: "supabase",
    aud: "authenticated",
    iat: now,
    exp: now + expiresIn,
    ...(withUser ? {
      sub: adminUid,
      email: ADMIN_EMAIL,
      aal: "aal1",
      session_id: randomUUID(),
    } : {}),
  };
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}`;
  return `${unsigned}.${createHmac("sha256", JWT_SECRET).update(unsigned).digest("base64url")}`;
}

const accessToken = jwt("authenticated", true);
const session = {
  access_token: accessToken,
  refresh_token: randomBytes(48).toString("base64url"),
  expires_in: expiresIn,
  expires_at: now + expiresIn,
  token_type: "bearer",
  user: {
    id: adminUid,
    aud: "authenticated",
    role: "authenticated",
    email: ADMIN_EMAIL,
    email_confirmed_at: new Date(now * 1000).toISOString(),
    phone: "",
    confirmed_at: new Date(now * 1000).toISOString(),
    created_at: new Date(now * 1000).toISOString(),
    updated_at: new Date(now * 1000).toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { fixture: "task-10.20-commit-3" },
    identities: [],
    is_anonymous: false,
  },
};
const storageKey = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

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
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [childKey, sanitize(child, childKey)]),
    );
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

async function saveJson(filename, value) {
  await writeFile(path.join(resolvedEvidence, filename), `${JSON.stringify(sanitize(value), null, 2)}\n`);
}

function sql(query) {
  const result = spawnSync("psql", [DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-At", "-c", query], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: undefined },
  });
  if (result.status !== 0) throw new Error(`psql 失败（${result.status}）：${result.stderr}`);
  return result.stdout.trim();
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function reconciliationQuery() {
  return `
select jsonb_build_object(
  'config', (
    select jsonb_build_object(
      'configKey', c.config_key,
      'emails', c.config_value,
      'updatedBy', c.updated_by,
      'updatedAt', c.updated_at
    )
    from public.system_configs c
    where c.config_key = 'seed_user_whitelist'
  ),
  'systemConfigAudit', coalesce((
    select jsonb_agg(jsonb_build_object(
      'auditId', a.audit_id,
      'oldValue', a.old_value,
      'newValue', a.new_value,
      'changedBy', a.changed_by,
      'changedAt', a.changed_at
    ) order by a.changed_at, a.audit_id)
    from public.system_config_audit a
    where a.config_key = 'seed_user_whitelist'
  ), '[]'::jsonb),
  'auditLogs', coalesce((
    select jsonb_agg(jsonb_build_object(
      'auditId', l.audit_id,
      'action', l.action,
      'actorId', l.actor_id,
      'reviewerId', l.reviewer_id,
      'metadata', l.metadata,
      'createdAt', l.created_at
    ) order by l.created_at, l.audit_id)
    from public.audit_logs l
    where l.action = 'seed_user_whitelist_email_added'
      and l.metadata ->> 'key' = 'seed_user_whitelist'
  ), '[]'::jsonb),
  'aSystemConfigAuditCount', (
    select count(*)::integer from public.system_config_audit a
    where a.config_key = 'seed_user_whitelist' and a.new_value ? ${quote(A_EMAIL)}
  ),
  'bSystemConfigAuditCount', (
    select count(*)::integer from public.system_config_audit a
    where a.config_key = 'seed_user_whitelist' and a.new_value ? ${quote(B_EMAIL)}
  ),
  'aAuditLogCount', (
    select count(*)::integer from public.audit_logs l
    where l.action = 'seed_user_whitelist_email_added' and l.metadata ->> 'email' = ${quote(A_EMAIL)}
  ),
  'bAuditLogCount', (
    select count(*)::integer from public.audit_logs l
    where l.action = 'seed_user_whitelist_email_added' and l.metadata ->> 'email' = ${quote(B_EMAIL)}
  )
);`.trim();
}

async function captureSql(name) {
  const query = reconciliationQuery();
  const output = sql(query);
  await writeFile(path.join(resolvedEvidence, `${name}.query.sql`), `${query}\n`);
  await writeFile(path.join(resolvedEvidence, `${name}.json`), `${JSON.stringify(JSON.parse(output), null, 2)}\n`);
  await writeFile(path.join(resolvedEvidence, `${name}.raw.txt`), `${output}\n`);
  return JSON.parse(output);
}

async function screenshot(actor, name, transcript) {
  const section = actor.page.locator(".admin-seed-whitelist");
  await section.scrollIntoViewIfNeeded();
  await actor.page.screenshot({ path: path.join(resolvedEvidence, `${name}.png`), fullPage: false });
  const state = await whitelistState(actor.page);
  await writeFile(path.join(resolvedEvidence, `${name}.txt`), [
    `ACTOR: ${actor.name.toUpperCase()}`,
    `URL: ${actor.page.url()}`,
    `TITLE: ${await actor.page.title()}`,
    `SCREENSHOT: ${name}.png`,
    transcript,
    "",
    `VERSION TEXT: ${state.versionText}`,
    `EMAILS: ${JSON.stringify(state.emails)}`,
    `ERROR: ${state.error}`,
    "",
    "WHITELIST VISIBLE TEXT:",
    await section.innerText(),
    "",
    "PAGE VISIBLE TEXT:",
    (await actor.page.locator("body").innerText()).slice(0, 16000),
    "",
  ].join("\n"));
}

async function whitelistState(page) {
  const section = page.locator(".admin-seed-whitelist");
  const alert = section.getByRole("alert");
  return {
    versionText: await section.locator(".admin-seed-whitelist-version span").innerText(),
    emails: (await section.locator(".admin-seed-whitelist-list li > span").allInnerTexts()).sort(),
    error: await alert.count() ? await alert.innerText() : "",
  };
}

async function sanitizeHar(rawPath, outputPath) {
  const har = JSON.parse(await readFile(rawPath, "utf8"));
  for (const entry of har.log?.entries ?? []) {
    entry.request.headers = (entry.request.headers ?? []).map((header) => SENSITIVE_KEY.test(header.name)
      ? { ...header, value: "[REDACTED]" }
      : header);
    entry.response.headers = (entry.response.headers ?? []).map((header) => SENSITIVE_KEY.test(header.name)
      ? { ...header, value: "[REDACTED]" }
      : header);
    entry.request.cookies = [];
    entry.response.cookies = [];
    entry.request.url = redactText(entry.request.url);
    entry.response.redirectURL = redactText(entry.response.redirectURL ?? "");
    if (entry.request.postData?.text) {
      entry.request.postData.text = JSON.stringify(sanitizeBody(entry.request.postData.text));
    }
    if (entry.response.content?.text) {
      entry.response.content.text = JSON.stringify(sanitizeBody(entry.response.content.text));
    }
  }
  await saveJson(outputPath, har);
  await rm(rawPath, { force: true });
}

const actors = [];
let browser;
let vite;
const viteLog = createWriteStream(path.join(resolvedEvidence, "vite.log"));

async function flushActor(actor) {
  await Promise.all(actor.networkTasks);
  actor.networkTasks = [];
}

async function openActor(name) {
  const rawHar = path.join(resolvedEvidence, `.raw-${name}-network.har`);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    recordHar: { path: rawHar, content: "embed", urlFilter: /\/rest\/v1\// },
  });
  await context.addInitScript(({ key, value, origin }) => {
    if (location.origin === origin && localStorage.getItem(key) === null) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }, { key: storageKey, value: session, origin: new URL(FRONTEND_URL).origin });
  const page = await context.newPage();
  const actor = {
    name,
    context,
    page,
    rawHar,
    network: [],
    networkTasks: [],
    pageErrors: [],
    console: [],
  };
  actors.push(actor);
  page.on("pageerror", (error) => actor.pageErrors.push(error.message));
  page.on("console", (message) => actor.console.push({ type: message.type(), text: redactText(message.text()) }));
  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/rest/v1/")) return;
    const task = (async () => {
      const request = response.request();
      let responseText = "";
      let responseBodyError = null;
      try {
        responseText = await response.text();
      } catch (error) {
        responseBodyError = error.message;
      }
      actor.network.push({
        method: request.method(),
        url: redactText(url),
        status: response.status(),
        requestHeaders: sanitize(request.headers()),
        responseHeaders: sanitize(response.headers()),
        requestBody: sanitizeBody(request.postData()),
        responseBody: sanitizeBody(responseText),
        responseBodyError,
      });
    })();
    actor.networkTasks.push(task);
  });

  await page.goto(`${FRONTEND_URL}/admin/check-in`, { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "生产调度" }).waitFor({ state: "visible", timeout: 20000 });
  await page.getByRole("tab", { name: "生产调度" }).click();
  const section = page.locator(".admin-seed-whitelist");
  await section.getByRole("heading", { name: "种子用户白名单" }).waitFor();
  await page.waitForFunction(() => {
    const input = document.querySelector("#seed-whitelist-email");
    return input instanceof HTMLInputElement && !input.disabled;
  });
  await page.waitForLoadState("networkidle");
  await flushActor(actor);
  return actor;
}

function rpcEntries(actor, rpc, method) {
  return actor.network.filter((entry) => entry.method === method && new URL(entry.url).pathname.endsWith(`/rpc/${rpc}`));
}

async function stopVite() {
  if (!vite || vite.exitCode !== null || vite.signalCode !== null) return;
  vite.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => vite.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (vite.exitCode === null && vite.signalCode === null) vite.kill("SIGKILL");
}

try {
  assert.equal(sql("select 1;"), "1", "PostgreSQL 健康检查失败。 ");
  const restHealth = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
  });
  assert.equal(restHealth.status, 200, "Kong/PostgREST 健康检查失败。 ");
  await restHealth.arrayBuffer();
  await saveJson("stack-health.json", {
    postgres: "select 1 => 1",
    restStatus: restHealth.status,
    supabaseUrl: SUPABASE_URL,
    frontendUrl: FRONTEND_URL,
    database: { host: database.hostname, port: database.port, name: database.pathname.slice(1) },
    mode: "real PostgreSQL + PostgREST + Kong; no response rewriting; no GoTrue dependency",
  });

  assert.equal(sql(`select count(*) from auth.users where id = ${quote(adminUid)};`), "0");
  sql(`
    begin;
    insert into auth.users (id, email, phone, raw_user_meta_data, created_at, updated_at)
    values (
      ${quote(adminUid)}, ${quote(ADMIN_EMAIL)}, '',
      '{"fixture":"task-10.20-commit-3"}'::jsonb, now(), now()
    );
    insert into public.camp_admins (email, auth_user_id, role, is_active)
    values (${quote(ADMIN_EMAIL)}, ${quote(adminUid)}, 'admin', true);
    insert into public.system_configs (config_key, config_value)
    values ('seed_user_whitelist', jsonb_build_array(${quote(BASE_EMAIL)}))
    on conflict (config_key) do update set config_value = excluded.config_value;
    commit;
  `);
  const before = await captureSql("sql-before");
  assert.deepEqual(before.config.emails, [BASE_EMAIL]);
  assert.equal(before.aSystemConfigAuditCount, 0);
  assert.equal(before.bSystemConfigAuditCount, 0);
  assert.equal(before.aAuditLogCount, 0);
  assert.equal(before.bAuditLogCount, 0);
  const t0 = before.config.updatedAt;
  assert.equal(typeof t0, "string");

  vite = spawn(process.execPath, [
    "node_modules/vite/bin/vite.js",
    "--host", "127.0.0.1",
    "--port", String(new URL(FRONTEND_URL).port),
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
  let viteReady = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (viteExit) throw new Error(`Vite 提前退出：${JSON.stringify(viteExit)}`);
    try {
      const response = await fetch(`${FRONTEND_URL}/admin/check-in`);
      if (response.ok) {
        await response.arrayBuffer();
        viteReady = true;
        break;
      }
    } catch { /* 等待 Vite 监听。 */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert(viteReady, "Vite 未就绪。 ");

  browser = await chromium.launch({ headless: true });
  const [actorA, actorB] = await Promise.all([openActor("a"), openActor("b")]);
  const initialA = await whitelistState(actorA.page);
  const initialB = await whitelistState(actorB.page);
  assert.deepEqual(initialA.emails, [BASE_EMAIL]);
  assert.deepEqual(initialB.emails, [BASE_EMAIL]);
  assert.equal(initialA.versionText, `配置版本：${t0}`);
  assert.equal(initialB.versionText, `配置版本：${t0}`);
  const aInitialGets = rpcEntries(actorA, GET_RPC, "POST");
  const bInitialGets = rpcEntries(actorB, GET_RPC, "POST");
  assert(aInitialGets.length >= 1);
  assert(bInitialGets.length >= 1);
  for (const entry of [...aInitialGets, ...bInitialGets]) {
    assert.equal(entry.status, 200);
    assert.equal(entry.responseBody.updatedAt, t0);
    assert.deepEqual(entry.responseBody.emails, [BASE_EMAIL]);
  }
  const aInitialGetCount = aInitialGets.length;
  const bInitialGetCount = bInitialGets.length;
  await saveJson("initial-snapshots.json", {
    t0,
    actorA: initialA,
    actorB: initialB,
    aInitialGetCount,
    bInitialGetCount,
    note: "React StrictMode 开发挂载可能产生两次初始化读取；后续断言以各自基线计算增量。",
  });
  await screenshot(actorA, "a-initial", `双 Context 初始读取相同 T0：${t0}；列表仅 ${BASE_EMAIL}。`);
  await screenshot(actorB, "b-initial", `双 Context 初始读取相同 T0：${t0}；列表仅 ${BASE_EMAIL}。`);

  await actorA.page.locator(".admin-seed-whitelist #seed-whitelist-email").fill(A_EMAIL);
  const aAddWait = actorA.page.waitForResponse((response) =>
    response.url().includes(`/rpc/${ADD_RPC}`) && response.request().method() === "POST");
  await actorA.page.locator(".admin-seed-whitelist").getByRole("button", { name: "添加邮箱" }).click();
  const aAddResponse = await aAddWait;
  assert.equal(aAddResponse.status(), 200, "A 的真实新增 RPC 未成功。 ");
  const aAddResponseText = await aAddResponse.text();
  const aAddBody = JSON.parse(aAddResponseText);
  const aRequestBody = JSON.parse(aAddResponse.request().postData());
  assert.equal(aRequestBody.p_email, A_EMAIL);
  assert.equal(aRequestBody.p_expected_config_exists, true);
  assert.equal(aRequestBody.p_expected_updated_at, t0);
  assert.equal(aAddBody.changed, true);
  assert.deepEqual(aAddBody.emails, [A_EMAIL, BASE_EMAIL]);
  const t1 = aAddBody.updatedAt;
  assert.equal(typeof t1, "string");
  assert.notEqual(t1, t0);
  const sectionA = actorA.page.locator(".admin-seed-whitelist");
  await sectionA.getByText("邮箱已添加到种子用户白名单。", { exact: true }).waitFor();
  await sectionA.locator("li > span").filter({ hasText: A_EMAIL }).waitFor();
  await actorA.page.waitForLoadState("networkidle");
  await flushActor(actorA);
  const afterA = await captureSql("sql-after-a");
  assert.deepEqual(afterA.config.emails, [A_EMAIL, BASE_EMAIL]);
  assert.equal(afterA.config.updatedAt, t1);
  assert.equal(afterA.aSystemConfigAuditCount, 1);
  assert.equal(afterA.bSystemConfigAuditCount, 0);
  assert.equal(afterA.aAuditLogCount, 1);
  assert.equal(afterA.bAuditLogCount, 0);
  const updatedA = await whitelistState(actorA.page);
  assert.equal(updatedA.versionText, `配置版本：${t1}`);
  assert.deepEqual(updatedA.emails, [A_EMAIL, BASE_EMAIL]);
  assert.equal(updatedA.error, "");
  const aGets = rpcEntries(actorA, GET_RPC, "POST");
  assert.equal(aGets.length, aInitialGetCount + 1, "A 成功后应只增加一次白名单读取。 ");
  assert.equal(aGets.at(-1).responseBody.updatedAt, t1);
  await saveJson("a-update-rpc.json", {
    status: aAddResponse.status(),
    requestBody: aRequestBody,
    responseText: aAddResponseText,
    responseBody: aAddBody,
  });
  await screenshot(actorA, "a-update-success", `A 新增成功，HTTP 200；${A_EMAIL} 可见；T0 ${t0} → T1 ${t1}。`);

  const bStaleVersionBefore = await whitelistState(actorB.page);
  assert.equal(bStaleVersionBefore.versionText, `配置版本：${t0}`, "B 在写入前被意外刷新。 ");
  await actorB.page.locator(".admin-seed-whitelist #seed-whitelist-email").fill(B_EMAIL);
  const bAddWait = actorB.page.waitForResponse((response) =>
    response.url().includes(`/rpc/${ADD_RPC}`) && response.request().method() === "POST");
  await actorB.page.locator(".admin-seed-whitelist").getByRole("button", { name: "添加邮箱" }).click();
  const bAddResponse = await bAddWait;
  const bAddResponseText = await bAddResponse.text();
  const bAddBody = JSON.parse(bAddResponseText);
  const bRequestBody = JSON.parse(bAddResponse.request().postData());
  assert.equal(bAddResponse.status(), 500, "B stale RPC 必须保留真实 HTTP 500。 ");
  assert.equal(bAddBody.code, "40001");
  assert.equal(bAddBody.message, "SEED_USER_WHITELIST_VERSION_CONFLICT");
  assert.equal(bRequestBody.p_email, B_EMAIL);
  assert.equal(bRequestBody.p_expected_config_exists, true);
  assert.equal(bRequestBody.p_expected_updated_at, t0, "B 必须仍携带 T0。 ");
  const sectionB = actorB.page.locator(".admin-seed-whitelist");
  await sectionB.getByRole("alert").filter({ hasText: "数据已过期，请刷新重试" }).waitFor();
  await actorB.page.waitForLoadState("networkidle");
  await flushActor(actorB);
  const conflictB = await whitelistState(actorB.page);
  assert.equal(conflictB.error, "数据已过期，请刷新重试");
  assert.equal(conflictB.versionText, `配置版本：${t0}`, "冲突后 B 的版本被意外刷新。 ");
  assert.deepEqual(conflictB.emails, [BASE_EMAIL]);
  assert.equal(conflictB.emails.includes(A_EMAIL), false);
  assert.equal(conflictB.emails.includes(B_EMAIL), false);
  assert.equal(rpcEntries(actorB, GET_RPC, "POST").length, bInitialGetCount, "B 冲突后不应增加白名单读取。 ");
  const afterB = await captureSql("sql-after-b");
  assert.deepEqual(afterB, afterA, "B 冲突写入改变了数据库或审计。 ");
  assert.deepEqual(afterB.config.emails, [A_EMAIL, BASE_EMAIL]);
  assert.equal(afterB.aSystemConfigAuditCount, 1);
  assert.equal(afterB.bSystemConfigAuditCount, 0);
  assert.equal(afterB.aAuditLogCount, 1);
  assert.equal(afterB.bAuditLogCount, 0);
  await writeFile(path.join(resolvedEvidence, "b-stale-rpc-response.http.txt"), [
    `HTTP ${bAddResponse.status()}`,
    `Content-Type: ${await bAddResponse.headerValue("content-type")}`,
    "",
    bAddResponseText,
    "",
  ].join("\n"));
  await saveJson("b-stale-rpc-response.json", {
    status: bAddResponse.status(),
    requestBody: bRequestBody,
    responseText: bAddResponseText,
    responseBody: bAddBody,
  });
  await saveJson("version-transition.json", {
    t0,
    t1,
    aRequestExpectedUpdatedAt: aRequestBody.p_expected_updated_at,
    bRequestExpectedUpdatedAt: bRequestBody.p_expected_updated_at,
    bPageVersionAfterConflict: conflictB.versionText,
    bAutomaticallyRefreshed: false,
  });
  await screenshot(
    actorB,
    "b-stale-conflict",
    `B 不刷新仍持 T0 ${t0}；真实 HTTP 500 / code 40001 / ${bAddBody.message}；精确提示“${conflictB.error}”；B 邮箱未入列表。`,
  );

  for (const actor of actors) {
    await flushActor(actor);
    assert.deepEqual(actor.pageErrors, [], `${actor.name} 页面存在未捕获异常。 `);
    await saveJson(`${actor.name}-network.json`, actor.network);
    await saveJson(`${actor.name}-browser-diagnostics.json`, {
      pageErrors: actor.pageErrors,
      console: actor.console,
    });
  }
  await saveJson("sql-reconciliation.json", {
    before,
    afterA,
    afterB,
    afterAAndAfterBIdentical: true,
    finalEmails: afterB.config.emails,
    a: { systemConfigAudit: 1, auditLogs: 1 },
    b: { systemConfigAudit: 0, auditLogs: 0 },
  });
  await writeFile(path.join(resolvedEvidence, "scenario-playbook.txt"), [
    "TASK-10.20 Commit 3 / G-P1-1 真实双 Context Admin 白名单冲突 E2E",
    "",
    `1. 一次性本机 PostgreSQL 专用库应用仓库全部既有迁移；同一合成 Admin UID：${adminUid}。`,
    `2. 初始白名单仅 ${BASE_EMAIL}，数据库 T0=${t0}。`,
    "3. 两个独立 Chromium Context 分别注入同一 Admin 的有效本地 Supabase session；浏览器 Vite 仅收到 anon 配置。",
    "4. A、B 均真实打开 /admin/check-in 并点击生产调度；两者页面与 RPC 均显示同一 T0。",
    `5. A 新增 ${A_EMAIL}：真实 HTTP 200，页面显示 A 邮箱和 T1=${t1}，请求仍携带 T0。`,
    `6. B 不刷新，新增 ${B_EMAIL}：请求仍携带 T0，真实 HTTP ${bAddResponse.status()}，响应 code=${bAddBody.code}、message=${bAddBody.message}。`,
    "7. B 页面精确显示“数据已过期，请刷新重试”，仍显示 T0，列表仅 base；未自动发起额外白名单 GET。",
    "8. SQL after-a 与 after-b 完全一致：最终 base+A、不含 B；A 在 system_config_audit / audit_logs 各 1，B 各 0。",
    "9. 未使用 page.route、Mock RPC、代理改码或直接 RPC/psql 替代双页面操作；原始响应与脱敏 HAR 均保留。",
    "10. access token、refresh token、Authorization、apikey、Cookie 均未写入证据。",
    "",
  ].join("\n"));

  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" });
  assert.equal(head.status, 0);
  const scriptBytes = await readFile(fileURLToPath(import.meta.url));
  await saveJson("summary.json", {
    result: "PASS",
    executedAt: new Date().toISOString(),
    gitHead: head.stdout.trim(),
    scriptSha256: createHash("sha256").update(scriptBytes).digest("hex"),
    dualContexts: true,
    realRenderedPages: true,
    noMocksOrResponseRewriting: true,
    adminUid,
    t0,
    t1,
    a: { email: A_EMAIL, addStatus: 200, finalVersion: t1 },
    b: {
      email: B_EMAIL,
      staleVersion: t0,
      addStatus: bAddResponse.status(),
      responseCode: bAddBody.code,
      responseMessage: bAddBody.message,
      exactUiError: conflictB.error,
      automaticallyRefreshed: false,
    },
    finalEmails: afterB.config.emails,
    afterAAndAfterBIdentical: true,
    audits: { a: { systemConfigAudit: 1, auditLogs: 1 }, b: { systemConfigAudit: 0, auditLogs: 0 } },
  });
  console.log(JSON.stringify({
    result: "PASS",
    t0,
    t1,
    aStatus: 200,
    bStatus: bAddResponse.status(),
    bCode: bAddBody.code,
    bMessage: bAddBody.message,
    bUiError: conflictB.error,
    finalEmails: afterB.config.emails,
    audits: { a: [1, 1], b: [0, 0] },
  }, null, 2));
} catch (error) {
  for (const actor of actors) {
    await flushActor(actor).catch(() => {});
    await saveJson(`${actor.name}-network.json`, actor.network).catch(() => {});
    await screenshot(actor, `${actor.name}-failure`, `失败：${error.message}`).catch(() => {});
  }
  throw error;
} finally {
  for (const actor of actors) {
    await actor.context.close().catch(() => {});
    await sanitizeHar(actor.rawHar, `${actor.name}-network.har`).catch(async (error) => {
      await writeFile(path.join(resolvedEvidence, `${actor.name}-har-sanitize-error.txt`), `${error.message}\n`);
    });
  }
  if (browser) await browser.close().catch(() => {});
  await stopVite();
  viteLog.end();
}
