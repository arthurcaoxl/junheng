import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../lib/supabase";
import { MERGED_FLAG_KEY, syncToCloud } from "../services/checkinSync";
import { writeV3Snapshot } from "../utils/storageBridge";

const snapshot = {
  schema: 3 as const,
  userCode: "JH-ABCDE",
  startDate: "2026-11-01",
  heightCm: "168",
  initialWeightKg: "70.5",
  records: {
    "2026-11-07": {
      weight: "69.8",
      waist: "80",
      meals: [true, false, false],
      water: true,
      movement: false,
      sleep: true,
    },
  },
};

describe("已激活盒码的打卡额度同步", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    writeV3Snapshot(snapshot);
    window.localStorage.setItem("junheng-box-code-activated-v1", "true");
    window.localStorage.setItem(MERGED_FLAG_KEY, JSON.stringify({
      "test-uid": { dataVersion: "junheng-checkin-v3-union-v1", mergedAt: "2026-11-07T00:00:00.000Z" },
    }));
    const query = getSupabase().from("checkin_sync") as unknown as { maybeSingle: ReturnType<typeof vi.fn> };
    query.maybeSingle.mockResolvedValue({ data: { user_code: "JH-ABCDE" }, error: null });
  });

  it("通过 verify_checkin 原子保存快照并返回最新剩余次数", async () => {
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        ok: true,
        idempotent: false,
        maxCheckins: 21,
        usedCheckins: 7,
        remainingCheckins: 14,
        boxSpec: "21_bags",
      },
      error: null,
    });

    await expect(syncToCloud()).resolves.toBe("synced");

    expect(getSupabase().rpc).toHaveBeenCalledWith("verify_checkin", {
      p_start_date: snapshot.startDate,
      p_records: snapshot.records,
      p_height_cm: snapshot.heightCm,
      p_initial_weight_kg: snapshot.initialWeightKg,
    });
    const query = getSupabase().from("checkin_sync") as unknown as { update: ReturnType<typeof vi.fn> };
    expect(query.update).not.toHaveBeenCalled();
  });

  it("同日幂等保存成功但不把重复结果当作额外扣次", async () => {
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        ok: true,
        idempotent: true,
        maxCheckins: 21,
        usedCheckins: 7,
        remainingCheckins: 14,
        boxSpec: "21_bags",
      },
      error: null,
    });

    await expect(syncToCloud()).resolves.toBe("synced");
    expect(getSupabase().rpc).toHaveBeenCalledWith("verify_checkin", expect.objectContaining({
      p_records: snapshot.records,
    }));
  });
});
