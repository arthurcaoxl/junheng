import { STORAGE_KEY, isDateKey, loadState, type CheckInState } from "./checkin";

/** 读快照：直接复用 v3 的 loadState()（含 v2/v1 迁移语义，原样保留）。 */
export function readV3Snapshot(): CheckInState {
  return loadState();
}

/**
 * 首次合并专用严格读取：已有 v3 损坏时必须中止，不能让 loadState()
 * 回退成空的新快照，否则会被误判为“本地为空”并遭云端覆盖。
 */
export function readV3SnapshotStrict(): CheckInState {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return readV3Snapshot();
  const parsed = JSON.parse(raw) as Partial<CheckInState>;
  const state = validateV3Snapshot(parsed);
  if (Object.keys(state.records).length !== Object.keys(parsed.records ?? {}).length) {
    throw new Error("本地数据包含无效日期键，已中止合并（本地数据未动）。");
  }
  return state;
}

/** 校验云端快照，拒绝脏数据写入本机。 */
export function validateV3Snapshot(input: unknown): CheckInState {
  const s = input as Partial<CheckInState> | null;
  if (
    !s || s.schema !== 3 || typeof s.userCode !== "string" || !s.userCode ||
    !isDateKey(s.startDate) || !s.records || typeof s.records !== "object" || Array.isArray(s.records)
  ) {
    throw new Error("云端数据格式与 storage-v3 契约不符，已中止恢复（本地数据未动）。");
  }
  const records: CheckInState["records"] = {};
  Object.entries(s.records).forEach(([key, day]) => {
    if (isDateKey(key)) records[key] = day;
  });
  return {
    schema: 3,
    userCode: s.userCode,
    startDate: s.startDate,
    records,
    ...(typeof s.clothesWeight === "string" ? { clothesWeight: s.clothesWeight } : {}),
  };
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
