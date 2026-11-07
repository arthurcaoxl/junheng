import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../lib/supabase";
import { ensureInitialMerge, syncToCloud } from "../services/checkinSync";
import { emptyDay, loadState, STORAGE_KEY, type CheckInState } from "../utils/checkin";
import { readV3Snapshot, writeV3Snapshot } from "../utils/storageBridge";

const MERGED_FLAG_KEY = "junheng-checkin-merged-flag";
const OLD_DATA_VERSION = "junheng-checkin-v3";
const PROFILE_DATA_VERSION = "junheng-checkin-v3-union-v1";
const DATE = "2026-11-01";

function day(weight: string) {
  return { ...emptyDay(), weight };
}

function snapshot(overrides: Partial<CheckInState> = {}): CheckInState {
  return {
    schema: 3,
    userCode: "JH-LOCAL",
    startDate: DATE,
    records: { [DATE]: day("70") },
    ...overrides,
  };
}

function cloudRow(state: CheckInState) {
  return {
    user_code: state.userCode,
    start_date: state.startDate,
    records: state.records,
    height_cm: state.heightCm ?? null,
    initial_weight_kg: state.initialWeightKg ?? null,
  };
}

function setMergedFlag(dataVersion: string, uid = "test-uid") {
  window.localStorage.setItem(MERGED_FLAG_KEY, JSON.stringify({
    [uid]: { dataVersion, mergedAt: "2026-11-01T08:00:00.000Z" },
  }));
}

function cloudQuery() {
  return getSupabase().from("checkin_sync") as unknown as {
    select: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
  };
}

describe("BMI 基础档案本地存储", () => {
  beforeEach(() => window.localStorage.clear());

  it("loadState 保留身高和自定义初始体重，旧数据仍保持缺省", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot({
      heightCm: "168.5",
      initialWeightKg: "72.3",
    })));
    expect(loadState()).toMatchObject({ heightCm: "168.5", initialWeightKg: "72.3" });

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
    expect(loadState().heightCm).toBeUndefined();
    expect(loadState().initialWeightKg).toBeUndefined();
  });

  it("writeV3Snapshot 保留有效档案，缺省时省略字段且不写入 undefined 字符串", () => {
    writeV3Snapshot(snapshot({ heightCm: "168", initialWeightKg: "72" }));
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toMatchObject({
      heightCm: "168",
      initialWeightKg: "72",
    });

    writeV3Snapshot(snapshot({ heightCm: undefined, initialWeightKg: undefined }));
    const raw = window.localStorage.getItem(STORAGE_KEY)!;
    const stored = JSON.parse(raw);
    expect(stored).not.toHaveProperty("heightCm");
    expect(stored).not.toHaveProperty("initialWeightKg");
    expect(raw).not.toContain("undefined");
  });
});

describe("BMI 基础档案幂等云端同步", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  });

  it("旧版 merged_flag 必须补跑合并，本地缺省档案从云端补齐且不清空云端", async () => {
    const records = { [DATE]: day("70") };
    const local = snapshot({ records });
    const cloud = snapshot({
      userCode: "JH-CLOUD",
      records,
      heightCm: "172",
      initialWeightKg: "71.5",
    });
    writeV3Snapshot(local);
    setMergedFlag(OLD_DATA_VERSION);
    cloudQuery().maybeSingle.mockResolvedValueOnce({ data: cloudRow(cloud), error: null });

    await expect(ensureInitialMerge()).resolves.toBe("local-merged");

    expect(cloudQuery().maybeSingle).toHaveBeenCalledTimes(1);
    expect(cloudQuery().update).not.toHaveBeenCalled();
    expect(readV3Snapshot()).toMatchObject({ heightCm: "172", initialWeightKg: "71.5" });
    expect(window.localStorage.getItem(MERGED_FLAG_KEY)).toContain(PROFILE_DATA_VERSION);
  });

  it("只有新版 merged_flag 才跳过首次合并", async () => {
    writeV3Snapshot(snapshot());
    setMergedFlag(PROFILE_DATA_VERSION);

    await expect(ensureInitialMerge()).resolves.toBe("already-merged");
    expect(cloudQuery().maybeSingle).not.toHaveBeenCalled();
  });

  it("本地与云端档案冲突时以本地为准，云端独有日期回填本地", async () => {
    const local = snapshot({
      heightCm: "168",
      initialWeightKg: "73",
      records: { [DATE]: day("local") },
    });
    const cloud = snapshot({
      userCode: "JH-CLOUD",
      heightCm: "175",
      initialWeightKg: "70",
      records: {
        [DATE]: day("cloud"),
        "2026-11-02": day("cloud-only"),
      },
    });
    writeV3Snapshot(local);
    cloudQuery().maybeSingle.mockResolvedValueOnce({ data: cloudRow(cloud), error: null });

    await expect(ensureInitialMerge()).resolves.toBe("local-merged");

    const [payload] = cloudQuery().update.mock.calls[0];
    expect(payload).toMatchObject({ height_cm: "168", initial_weight_kg: "73" });
    expect(payload.records["2026-11-02"].weight).toBe("cloud-only");
    expect(readV3Snapshot()).toMatchObject({ heightCm: "168", initialWeightKg: "73" });
    expect(readV3Snapshot().records["2026-11-02"]).toEqual(day("cloud-only"));
  });

  it("本地无打卡时恢复云端记录，但保留本地明确填写的档案并同步差异", async () => {
    const local = snapshot({ records: {}, heightCm: "168" });
    const cloud = snapshot({
      userCode: "JH-CLOUD",
      heightCm: "175",
      initialWeightKg: "72",
    });
    writeV3Snapshot(local);
    cloudQuery().maybeSingle.mockResolvedValueOnce({ data: cloudRow(cloud), error: null });

    await expect(ensureInitialMerge()).resolves.toBe("cloud-restored");

    expect(readV3Snapshot()).toMatchObject({
      userCode: "JH-CLOUD",
      heightCm: "168",
      initialWeightKg: "72",
      records: cloud.records,
    });
    const [payload] = cloudQuery().update.mock.calls[0];
    expect(payload).toMatchObject({ height_cm: "168", initial_weight_kg: "72" });
    expect(Object.keys(window.localStorage).filter((key) => key.startsWith("junheng-v3-backup-"))).toHaveLength(1);
  });

  it("已完成首次合并后，仅档案变化的上传也包含身高和初始体重", async () => {
    writeV3Snapshot(snapshot({ heightCm: "169", initialWeightKg: "74" }));
    setMergedFlag(PROFILE_DATA_VERSION);
    cloudQuery().maybeSingle.mockResolvedValueOnce({ data: { user_code: "JH-LOCAL" }, error: null });

    await expect(syncToCloud()).resolves.toBe("synced");

    expect(cloudQuery().insert).not.toHaveBeenCalled();
    const [payload] = cloudQuery().update.mock.calls[0];
    expect(payload).toMatchObject({ height_cm: "169", initial_weight_kg: "74" });
  });

  it("未填写档案时云端写入 null，而不是缺列或 undefined 字符串", async () => {
    writeV3Snapshot(snapshot());

    await expect(syncToCloud()).resolves.toBe("synced");

    const [payload] = cloudQuery().insert.mock.calls[0];
    expect(payload).toHaveProperty("height_cm", null);
    expect(payload).toHaveProperty("initial_weight_kg", null);
    expect(JSON.stringify(payload)).not.toContain("undefined");
  });

  it("本地没有打卡但有档案、云端无行时仍上传档案种子", async () => {
    writeV3Snapshot(snapshot({ records: {}, heightCm: "170" }));

    await expect(ensureInitialMerge()).resolves.toBe("local-seeded");

    expect(cloudQuery().insert).toHaveBeenCalledWith(expect.objectContaining({
      auth_user_id: "test-uid",
      height_cm: "170",
      initial_weight_kg: null,
      consent_granted: false, // 合规兜底：建档即默认未授权，绝不进研究池
    }));
  });
});
