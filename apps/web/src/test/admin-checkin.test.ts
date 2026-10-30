import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../lib/supabase";
import {
  buildAdminCsv,
  buildCampDayMetrics,
  verifyAdminLogin,
  type AdminCamper,
  type AdminDayRecord,
} from "../services/adminCheckin";

function day(patch: Partial<AdminDayRecord> = {}): AdminDayRecord {
  return {
    weight: "",
    waist: "",
    meals: [false, false, false],
    water: false,
    movement: false,
    sleep: false,
    ...patch,
  };
}

function camper(patch: Partial<AdminCamper>): AdminCamper {
  const records = patch.records ?? {};
  return {
    authUserId: "uid-1",
    email: "camper@example.com",
    userCode: "JH-ADMIN1",
    startDate: "2026-10-01",
    updatedAt: "2026-10-30T10:00:00.000Z",
    records,
    recordedDays: Object.keys(records).length,
    ...patch,
  };
}

const campers: AdminCamper[] = [
  camper({
    authUserId: "uid-a",
    email: "a@example.com",
    userCode: "JH-AAAAA",
    startDate: "2026-10-01",
    records: {
      "2026-10-01": day({ weight: "80", waist: "90", meals: [true, true, true], water: true, movement: true }),
      "2026-10-02": day({ weight: "79", waist: "89", meals: [true, false, true] }),
      "2026-10-03": day({ water: true }),
    },
  }),
  camper({
    authUserId: "uid-b",
    email: "b@example.com",
    userCode: "JH-BBBBB",
    startDate: "2026-10-05",
    records: {
      "2026-10-05": day({ weight: "70", waist: "80", meals: [true, false, false] }),
      "2026-10-06": day({ weight: "69.5", waist: "79.5", meals: [true, false, true], water: true }),
    },
  }),
];

describe("admin check-in statistics", () => {
  it("aligns different start dates by D1-D21 and calculates cohort rates", () => {
    const metrics = buildCampDayMetrics(campers);
    expect(metrics).toHaveLength(21);
    expect(metrics[0].participants).toBe(2);
    expect(metrics[0].avgWeightChangePercent).toBe(0);
    expect(metrics[0].mealCompletionRate).toBe(66.7);
    expect(metrics[0].waterRate).toBe(50);
    expect(metrics[0].movementRate).toBe(50);
    expect(metrics[1].participants).toBe(2);
    expect(metrics[1].avgWeightChangePercent).toBeLessThan(0);
    expect(metrics[1].avgWaistChangePercent).toBeLessThan(0);
    expect(metrics[2].participants).toBe(1);
  });

  it("builds a desensitized CSV without UID or email", () => {
    const csv = buildAdminCsv(campers);
    expect(csv).toContain("camper_code,record_date,camp_day,weight_kg,waist_cm");
    expect(csv).toContain('"JH-AAAAA","2026-10-01","1","80","90"');
    expect(csv).toContain('"JH-BBBBB","2026-10-06","2","69.5","79.5"');
    expect(csv).not.toContain("a@example.com");
    expect(csv).not.toContain("uid-a");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
});

describe("admin login with email OTP", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("verifies the OTP, checks the whitelist RPC, and returns normalized campers", async () => {
    const client = getSupabase();
    (client.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: [{
        auth_user_id: "uid-a",
        email: "camper@example.com",
        user_code: "JH-AAAAA",
        start_date: "2026-10-01",
        records: { "2026-10-01": { weight: "80", waist: "", meals: [true, false, false], water: true, movement: false, sleep: false } },
        updated_at: "2026-10-30T10:00:00.000Z",
      }],
      error: null,
    });

    await expect(verifyAdminLogin("admin@example.com", " 1234 5678 ")).resolves.toMatchObject([
      { email: "camper@example.com", userCode: "JH-AAAAA", recordedDays: 1 },
    ]);
    expect(client.auth.verifyOtp).toHaveBeenCalledWith({ email: "admin@example.com", token: "12345678", type: "email" });
    expect(client.rpc).toHaveBeenCalledWith("admin_checkin_overview");
  });

  it("maps a whitelist rejection to a friendly message without changing data", async () => {
    const client = getSupabase();
    (client.rpc as ReturnType<typeof vi.fn>).mockRejectedValueOnce({ code: "P0001", message: "当前邮箱不是管理员" });
    await expect(verifyAdminLogin("outside@example.com", "123456")).rejects.toThrow(/没有管理员权限/);
    expect(client.auth.verifyOtp).toHaveBeenCalled();
  });
});
