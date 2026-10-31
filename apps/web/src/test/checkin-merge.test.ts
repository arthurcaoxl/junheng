import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../lib/supabase";
import { ensureInitialMerge } from "../services/checkinSync";
import { emptyDay, STORAGE_KEY, type CheckInState } from "../utils/checkin";
import { readV3Snapshot, writeV3Snapshot } from "../utils/storageBridge";

const MERGED_FLAG_KEY = "junheng-checkin-merged-flag";

function day(weight: string) {
  return { ...emptyDay(), weight };
}

function snapshot(startDate: string, records: CheckInState["records"], userCode = "JH-LOCAL"): CheckInState {
  return { schema: 3, userCode, startDate, records };
}

function cloudRow(state: CheckInState) {
  return { user_code: state.userCode, start_date: state.startDate, records: state.records };
}

function mockUid(uid: string) {
  (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { session: { user: { id: uid, email: `${uid}@example.com` } } },
  });
}

function cloudQuery() {
  return getSupabase().from("checkin_sync") as unknown as {
    maybeSingle: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
  };
}

describe("按日期键补全式首次合并", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    mockUid("uid-a");
  });

  it("把本地 D6-D10 补到云端 D1-D5，且不覆盖本地", async () => {
    const cloudRecords = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`2026-10-0${i + 1}`, day(`${60 + i}`)]));
    const localRecords = Object.fromEntries(Array.from({ length: 10 }, (_, i) => {
      const date = `2026-10-${String(i + 1).padStart(2, "0")}`;
      return [date, day(`${60 + i}`)];
    }));
    const local = snapshot("2026-10-01", localRecords);
    writeV3Snapshot(local);
    cloudQuery().maybeSingle.mockResolvedValueOnce({ data: cloudRow(snapshot("2026-10-01", cloudRecords, "JH-CLOUD")), error: null });

    await expect(ensureInitialMerge()).resolves.toBe("local-merged");

    const [payload] = cloudQuery().update.mock.calls[0];
    expect(Object.keys(payload.records)).toHaveLength(10);
    expect(payload.records).toEqual(localRecords);
    expect(readV3Snapshot()).toEqual({ ...local, userCode: "JH-CLOUD" });
  });

  it("同日期冲突以本地为准，云端独有日期保留且不回填非空本地", async () => {
    const local = snapshot("2026-10-01", { "2026-10-02": day("local") });
    const cloud = snapshot("2026-10-01", {
      "2026-10-01": day("cloud-only-before"),
      "2026-10-02": day("cloud-conflict"),
      "2026-10-03": day("cloud-only-after"),
    }, "JH-CLOUD");
    writeV3Snapshot(local);
    cloudQuery().maybeSingle.mockResolvedValueOnce({ data: cloudRow(cloud), error: null });

    await ensureInitialMerge();

    const [payload] = cloudQuery().update.mock.calls[0];
    expect(payload.records["2026-10-02"].weight).toBe("local");
    expect(payload.records["2026-10-01"].weight).toBe("cloud-only-before");
    expect(payload.records["2026-10-03"].weight).toBe("cloud-only-after");
    expect(Object.keys(readV3Snapshot().records)).toEqual(["2026-10-02"]);
  });

  it("本地记录与云端一致时无需上传，也绝不在对齐营员代码时回填云端日期", async () => {
    const local = snapshot("2026-10-01", { "2026-10-02": day("same") });
    const cloud = snapshot("2026-10-01", {
      "2026-10-01": day("cloud-only"),
      "2026-10-02": day("same"),
    }, "JH-CLOUD");
    writeV3Snapshot(local);
    cloudQuery().maybeSingle.mockResolvedValueOnce({ data: cloudRow(cloud), error: null });

    await expect(ensureInitialMerge()).resolves.toBe("local-merged");

    expect(cloudQuery().update).not.toHaveBeenCalled();
    expect(readV3Snapshot()).toEqual({ ...local, userCode: "JH-CLOUD" });
  });

  it("只有本地为空时才用云端快照覆盖本地并保留备份", async () => {
    const local = snapshot("2026-10-01", {});
    const cloud = snapshot("2026-09-20", { "2026-09-20": day("cloud") }, "JH-CLOUD");
    writeV3Snapshot(local);
    cloudQuery().maybeSingle.mockResolvedValueOnce({ data: cloudRow(cloud), error: null });

    await expect(ensureInitialMerge()).resolves.toBe("cloud-restored");

    expect(readV3Snapshot()).toEqual(cloud);
    expect(Object.keys(window.localStorage).filter((key) => key.startsWith("junheng-v3-backup-"))).toHaveLength(1);
    expect(cloudQuery().update).not.toHaveBeenCalled();
    expect(cloudQuery().insert).not.toHaveBeenCalled();
  });

  it("本地非空且云端为空时上传本地种子", async () => {
    const local = snapshot("2026-10-01", { "2026-10-01": day("local") });
    writeV3Snapshot(local);
    cloudQuery().maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await expect(ensureInitialMerge()).resolves.toBe("local-seeded");

    expect(cloudQuery().insert).toHaveBeenCalledWith(expect.objectContaining({
      auth_user_id: "uid-a",
      records: local.records,
    }));
    expect(readV3Snapshot()).toEqual(local);
  });

  it("本地和云端都为空时不写业务数据，只记录完成标记", async () => {
    writeV3Snapshot(snapshot("2026-10-01", {}));
    cloudQuery().maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await expect(ensureInitialMerge()).resolves.toBe("empty");

    expect(cloudQuery().insert).not.toHaveBeenCalled();
    expect(cloudQuery().update).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(MERGED_FLAG_KEY)).toContain("uid-a");
  });

  it("同一 uid 并发及重复调用共享一次合并，完成标记前重跑仍幂等", async () => {
    const local = snapshot("2026-10-01", { "2026-10-01": day("local") });
    const cloud = snapshot("2026-10-01", { "2026-09-30": day("cloud") }, "JH-CLOUD");
    writeV3Snapshot(local);
    cloudQuery().maybeSingle.mockResolvedValue({ data: cloudRow(cloud), error: null });

    const [first, second] = await Promise.all([ensureInitialMerge(), ensureInitialMerge()]);
    expect(first).toBe("local-merged");
    expect(second).toBe("local-merged");
    expect(cloudQuery().maybeSingle).toHaveBeenCalledTimes(1);
    expect(cloudQuery().update).toHaveBeenCalledTimes(1);

    await expect(ensureInitialMerge()).resolves.toBe("already-merged");
    expect(cloudQuery().maybeSingle).toHaveBeenCalledTimes(1);

    window.localStorage.removeItem(MERGED_FLAG_KEY);
    cloudQuery().maybeSingle.mockResolvedValueOnce({
      data: cloudRow(snapshot("2026-10-01", {
        "2026-09-30": day("cloud"),
        "2026-10-01": day("local"),
      }, "JH-CLOUD")),
      error: null,
    });
    await expect(ensureInitialMerge()).resolves.toBe("local-merged");
    expect(cloudQuery().update).toHaveBeenCalledTimes(1);
  });

  it("不同 uid 的完成标记彼此独立，切回已完成账号不重复读取", async () => {
    writeV3Snapshot(snapshot("2026-10-01", { "2026-10-01": day("local") }));
    cloudQuery().maybeSingle.mockResolvedValue({ data: null, error: null });

    await ensureInitialMerge();
    mockUid("uid-b");
    await ensureInitialMerge();
    mockUid("uid-a");
    await expect(ensureInitialMerge()).resolves.toBe("already-merged");

    expect(cloudQuery().maybeSingle).toHaveBeenCalledTimes(2);
    expect(cloudQuery().insert.mock.calls.map(([row]) => row.auth_user_id)).toEqual(["uid-a", "uid-b"]);
  });

  it("云端读取失败时本地不变且不写完成标记，随后可安全重试", async () => {
    const local = snapshot("2026-10-01", { "2026-10-01": day("local") });
    writeV3Snapshot(local);
    cloudQuery().maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "network down" } });

    await expect(ensureInitialMerge()).rejects.toThrow("云端数据读取失败");
    expect(readV3Snapshot()).toEqual(local);
    expect(window.localStorage.getItem(MERGED_FLAG_KEY)).toBeNull();

    cloudQuery().maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(ensureInitialMerge()).resolves.toBe("local-seeded");
    expect(window.localStorage.getItem(MERGED_FLAG_KEY)).toContain("uid-a");
  });

  it("本地 v3 损坏时不视为空数据，也不读取云端覆盖", async () => {
    window.localStorage.setItem(STORAGE_KEY, "{broken-json");

    await expect(ensureInitialMerge()).rejects.toThrow();

    expect(cloudQuery().maybeSingle).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("{broken-json");
    expect(window.localStorage.getItem(MERGED_FLAG_KEY)).toBeNull();
  });
});
