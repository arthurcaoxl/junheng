import { STORAGE_KEY, isDateKey, loadState, type CheckInState } from "./checkin";

/** 读快照：直接复用 v3 的 loadState()（含 v2/v1 迁移语义，原样保留）。 */
export function readV3Snapshot(): CheckInState {
  return loadState();
}

/** 校验云端快照，拒绝脏数据写入本机。 */
export function validateV3Snapshot(input: unknown): CheckInState {
  const s = input as Partial<CheckInState> | null;
  if (
    !s || s.schema !== 3 || typeof s.userCode !== "string" || !s.userCode ||
    !isDateKey(s.startDate) || !s.records || typeof s.records !== "object"
  ) {
    throw new Error("云端数据格式与 storage-v3 契约不符，已中止恢复（本地数据未动）。");
  }
  const records: CheckInState["records"] = {};
  Object.entries(s.records).forEach(([key, day]) => {
    if (isDateKey(key)) records[key] = day;
  });
  return { schema: 3, userCode: s.userCode, startDate: s.startDate, records };
}

const BACKUP_PREFIX = "junheng-v3-backup-"; // 独立备份键，与 v3 键语义无关

/** 云端覆盖前的本地留存：保留最近 3 份备份。 */
export function backupLocalSnapshot(): void {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    window.localStorage.setItem(`${BACKUP_PREFIX}${Date.now()}`, raw);
    const keys = Object.keys(window.localStorage)
      .filter((k) => k.startsWith(BACKUP_PREFIX)).sort();
    keys.slice(0, Math.max(0, keys.length - 3)).forEach((k) => window.localStorage.removeItem(k));
  } catch { /* 存储不可用时跳过备份，不阻断主流程 */ }
}

/** 写回：走与组件完全相同的键和序列化格式；调用方随后 reload 完成水合。 */
export function writeV3Snapshot(state: CheckInState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(validateV3Snapshot(state)));
}
