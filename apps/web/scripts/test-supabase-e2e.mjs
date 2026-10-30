// 端到端实测：匿名登录 → upsert → 读回 → RLS 越权拒绝。
// 用法：node scripts/test-supabase-e2e.mjs（读取 apps/web/.env，不打印密钥）
// 注意：会在云端留下 2 个匿名测试用户及其行，可在 Supabase 控制台 Authentication → Users 删除（级联清行）。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(here, "../.env"), "utf8")
    .split("\n")
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.split("=")[0], line.slice(line.indexOf("=") + 1).trim()]),
);
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
if (!url || !anonKey) throw new Error("缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

// 用户 A：匿名登录并上传一条 v3 快照
const clientA = createClient(url, anonKey);
const { data: anonA, error: anonAError } = await clientA.auth.signInAnonymously();
check("匿名登录（用户 A）", !anonAError && !!anonA.session, anonAError?.message ?? `uid=${anonA.session?.user.id.slice(0, 8)}…`);
if (anonAError) process.exit(1);
const uidA = anonA.session.user.id;

const snapshot = {
  auth_user_id: uidA,
  user_code: "JH-E2ET0",
  start_date: "2026-10-30",
  records: { "2026-10-30": { weight: "70", waist: "", meals: [true, false, false], water: true, movement: false, sleep: true } },
  updated_at: new Date().toISOString(),
};
const { error: upsertError } = await clientA.from("checkin_sync").upsert(snapshot, { onConflict: "auth_user_id" });
check("upsert 自己的行", !upsertError, upsertError?.message ?? "");

const { data: rowA, error: selectAError } = await clientA.from("checkin_sync").select("*").single();
check(
  "读回自己的行（数据一致）",
  !selectAError && rowA?.user_code === "JH-E2ET0" && rowA?.records?.["2026-10-30"]?.weight === "70",
  selectAError?.message ?? "",
);

// 用户 B：另一个匿名用户，验证 RLS 隔离
const clientB = createClient(url, anonKey);
const { data: anonB, error: anonBError } = await clientB.auth.signInAnonymously();
check("匿名登录（用户 B）", !anonBError && !!anonB.session, anonBError?.message ?? "");
const { data: rowsB, error: selectBError } = await clientB.from("checkin_sync").select("*");
check("RLS：B 看不到 A 的行", !selectBError && Array.isArray(rowsB) && rowsB.length === 0, selectBError?.message ?? `rows=${rowsB?.length}`);

const { error: updateBError, data: updateBData } = await clientB
  .from("checkin_sync").update({ user_code: "JH-HACK0" }).eq("auth_user_id", uidA).select();
check("RLS：B 改不动 A 的行", !updateBError && Array.isArray(updateBData) && updateBData.length === 0, updateBError?.message ?? "");

const { error: insertBError } = await clientB.from("checkin_sync").insert({ ...snapshot, auth_user_id: uidA });
check("RLS：B 不能冒用 A 的 uid 插行", !!insertBError, insertBError?.message ?? "");

// 匿名用户 JWT role 验证（应为 authenticated）
const payload = JSON.parse(Buffer.from(anonA.session.access_token.split(".")[1], "base64").toString());
check("匿名用户 JWT role = authenticated", payload.role === "authenticated", `role=${payload.role}, is_anonymous=${payload.is_anonymous}`);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} 项通过`);
console.log("清理：Supabase 控制台 Authentication → Users 删除两个匿名测试用户即可级联删除测试行。");
process.exit(failed ? 1 : 0);
