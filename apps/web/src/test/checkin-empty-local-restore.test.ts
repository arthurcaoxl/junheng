import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../lib/supabase";
import { ensureInitialMerge, MERGED_FLAG_KEY } from "../services/checkinSync";
import { emptyDay, type CheckInState } from "../utils/checkin";
import { readV3Snapshot, writeV3Snapshot } from "../utils/storageBridge";

const UID = "test-uid";
const DATA_VERSION = "junheng-checkin-v3-union-v1";
const START_DATE = "2026-11-01";

function day(weight: string) {
  return { ...emptyDay(), weight };
}

function snapshot(records: CheckInState["records"], userCode = "JH-LOCAL"): CheckInState {
  return { schema: 3, userCode, startDate: START_DATE, records };
}

function cloudRow(state: CheckInState) {
  return {
    user_code: state.userCode,
    start_date: state.startDate,
    records: state.records,
    height_cm: null,
    initial_weight_kg: null,
  };
}

function cloudQuery() {
  return getSupabase().from("checkin_sync") as unknown as {
    maybeSingle: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
  };
}

function setValidMergedFlag(uid = UID) {
  window.localStorage.setItem(MERGED_FLAG_KEY, JSON.stringify({
    [uid]: { dataVersion: DATA_VERSION, mergedAt: "2026-11-12T00:00:00.000Z" },
  }));
}

describe("空本地记录下的首次云端恢复", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { user: { id: UID, email: "restore@example.test" } } },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("本地 records 为空且存在有效旧标记时仍恢复云端 N 条记录", async () => {
    const local = snapshot({});
    const cloud = snapshot({
      "2026-11-01": day("70"),
      "2026-11-02": day("69.5"),
      "2026-11-03": day("69"),
    }, "JH-CLOUD");
    writeV3Snapshot(local);
    setValidMergedFlag();
    cloudQuery().maybeSingle.mockResolvedValueOnce({ data: cloudRow(cloud), error: null });

    await expect(ensureInitialMerge()).resolves.toBe("cloud-restored");

    expect(readV3Snapshot()).toEqual(cloud);
    expect(Object.keys(readV3Snapshot().records)).toHaveLength(3);
    expect(Object.keys(window.localStorage).filter((key) => key.startsWith("junheng-v3-backup-"))).toHaveLength(1);
    expect(cloudQuery().maybeSingle).toHaveBeenCalledTimes(1);
    expect(cloudQuery().update).not.toHaveBeenCalled();
    expect(cloudQuery().insert).not.toHaveBeenCalled();
  });

  it("本地 records 非空且标记有效时保持 already-merged 快捷返回", async () => {
    const local = snapshot({ "2026-11-01": day("70") });
    writeV3Snapshot(local);
    setValidMergedFlag();

    await expect(ensureInitialMerge()).resolves.toBe("already-merged");

    expect(readV3Snapshot()).toEqual(local);
    expect(cloudQuery().maybeSingle).not.toHaveBeenCalled();
    expect(cloudQuery().update).not.toHaveBeenCalled();
    expect(cloudQuery().insert).not.toHaveBeenCalled();
  });

  it("空本地记录读取云端失败后保留本地并可在下次调用重试", async () => {
    const local = snapshot({});
    const cloud = snapshot({ "2026-11-01": day("70") }, "JH-CLOUD");
    writeV3Snapshot(local);
    setValidMergedFlag();
    cloudQuery().maybeSingle
      .mockResolvedValueOnce({ data: null, error: { message: "network down" } })
      .mockResolvedValueOnce({ data: cloudRow(cloud), error: null });

    await expect(ensureInitialMerge()).rejects.toThrow("云端数据读取失败");
    expect(readV3Snapshot()).toEqual(local);
    expect(window.localStorage.getItem(MERGED_FLAG_KEY)).toContain(DATA_VERSION);

    await expect(ensureInitialMerge()).resolves.toBe("cloud-restored");
    expect(readV3Snapshot()).toEqual(cloud);
    expect(cloudQuery().maybeSingle).toHaveBeenCalledTimes(2);
  });

  it("空本地记录且云端无行时保持 empty 且不写云端", async () => {
    const local = snapshot({});
    writeV3Snapshot(local);
    setValidMergedFlag();
    cloudQuery().maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await expect(ensureInitialMerge()).resolves.toBe("empty");

    expect(readV3Snapshot()).toEqual(local);
    expect(cloudQuery().insert).not.toHaveBeenCalled();
    expect(cloudQuery().update).not.toHaveBeenCalled();
  });
});
