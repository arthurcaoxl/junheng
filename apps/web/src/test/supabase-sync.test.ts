import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../lib/supabase";
import {
  flushSyncToCloud,
  installSyncLifecycle,
  loginWithEmail,
  resendRemainingSeconds,
  scheduleSyncToCloud,
  sendLoginCode,
  syncToCloud,
} from "../services/checkinSync";
import { isValidOtpCode, normalizeOtpInput, OTP_INPUT_PROPS } from "../services/otp";
import { backupLocalSnapshot, readV3Snapshot, validateV3Snapshot, writeV3Snapshot } from "../utils/storageBridge";
import { STORAGE_KEY } from "../utils/checkin";

const validSnapshot = {
  schema: 3 as const,
  userCode: "JH-ABCDE",
  startDate: "2026-10-01",
  records: { "2026-10-01": { weight: "70", waist: "", meals: [true, false, false], water: true, movement: false, sleep: true } },
};

describe("otp helpers", () => {
  it("accepts both 6-digit (local) and 8-digit (prod) codes", () => {
    expect(isValidOtpCode("123456")).toBe(true);
    expect(isValidOtpCode("12345678")).toBe(true);
    expect(isValidOtpCode("12345")).toBe(false);
    expect(isValidOtpCode("123456789")).toBe(false);
    expect(isValidOtpCode("abcdef")).toBe(false);
  });

  it("normalizes pasted codes with spaces or dashes", () => {
    expect(normalizeOtpInput(" 1234 5678 ")).toBe("12345678");
    expect(normalizeOtpInput("123-456")).toBe("123456");
    expect(normalizeOtpInput("1234567890")).toBe("12345678");
    expect(OTP_INPUT_PROPS.pattern).toBe("[0-9]{6,8}");
  });
});

describe("storageBridge", () => {
  beforeEach(() => window.localStorage.clear());

  it("validates a well-formed cloud snapshot", () => {
    expect(validateV3Snapshot(validSnapshot)).toEqual(validSnapshot);
  });

  it("rejects snapshots that break the storage-v3 contract", () => {
    expect(() => validateV3Snapshot({ ...validSnapshot, schema: 2 })).toThrow(/契约不符/);
    expect(() => validateV3Snapshot({ ...validSnapshot, startDate: "10/01" })).toThrow(/契约不符/);
    expect(() => validateV3Snapshot({ ...validSnapshot, userCode: "" })).toThrow(/契约不符/);
    expect(() => validateV3Snapshot(null)).toThrow(/契约不符/);
  });

  it("writes snapshots through the same storage key without touching v3 logic", () => {
    writeV3Snapshot(validSnapshot);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual(validSnapshot);
    expect(readV3Snapshot().userCode).toBe("JH-ABCDE");
  });

  it("keeps at most three local backups before cloud overwrite", () => {
    writeV3Snapshot(validSnapshot);
    for (let i = 0; i < 5; i += 1) {
      vi.spyOn(Date, "now").mockReturnValue(1000 + i);
      backupLocalSnapshot();
    }
    vi.restoreAllMocks();
    const backups = Object.keys(window.localStorage).filter((k) => k.startsWith("junheng-v3-backup-"));
    expect(backups).toHaveLength(3);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeTruthy();
  });
});

describe("checkinSync with mocked supabase", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("inserts the v3 snapshot when no cloud row exists", async () => {
    writeV3Snapshot(validSnapshot);
    await expect(syncToCloud()).resolves.toBe("synced");
    const client = getSupabase();
    expect(client.from).toHaveBeenCalledWith("checkin_sync");
    const query = client.from("checkin_sync") as unknown as { insert: ReturnType<typeof vi.fn> };
    const [row] = query.insert.mock.calls[0];
    expect(row).toMatchObject({ auth_user_id: "test-uid", user_code: "JH-ABCDE", start_date: "2026-10-01" });
  });

  it("never overwrites cloud user_code and aligns local code to the cloud", async () => {
    writeV3Snapshot(validSnapshot); // 本地 JH-ABCDE
    const client = getSupabase();
    const query = client.from("checkin_sync") as unknown as {
      maybeSingle: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      insert: ReturnType<typeof vi.fn>;
    };
    query.maybeSingle.mockResolvedValueOnce({ data: { user_code: "JH-CLOUD" }, error: null });
    await expect(syncToCloud()).resolves.toBe("synced");
    // 更新载荷不含 user_code，营员代码终身以云端为准
    const [payload] = query.update.mock.calls[0];
    expect(payload).not.toHaveProperty("user_code");
    expect(payload).toMatchObject({ start_date: "2026-10-01", records: validSnapshot.records });
    expect(query.insert).not.toHaveBeenCalled();
    expect(readV3Snapshot().userCode).toBe("JH-CLOUD"); // 本地立即对齐云端固定值
  });

  it("degrades to offline without touching local data on network failure", async () => {
    writeV3Snapshot(validSnapshot);
    const client = getSupabase();
    (client.auth.getSession as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network down"));
    await expect(syncToCloud()).resolves.toBe("offline");
    expect(readV3Snapshot()).toEqual(validSnapshot);
  });

  it("debounces repeated check-in saves into a single upload", async () => {
    vi.useFakeTimers();
    const client = getSupabase();
    scheduleSyncToCloud();
    scheduleSyncToCloud();
    scheduleSyncToCloud();
    expect(client.from).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4000);
    // 一次上传 = select 查已有行 + insert/update 写入，共 2 次 from 调用
    expect(client.from).toHaveBeenCalledTimes(2);
    await expect(flushSyncToCloud()).resolves.toBe("noop");
  });

  it("flushes pending sync on page hide", async () => {
    vi.useFakeTimers();
    const client = getSupabase();
    const uninstall = installSyncLifecycle();
    scheduleSyncToCloud();
    window.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(0);
    expect(client.from).toHaveBeenCalledTimes(2);
    uninstall();
  });

  it("enforces a 60s resend cooldown with friendly copy", async () => {
    await sendLoginCode("user@example.com");
    expect(resendRemainingSeconds("user@example.com")).toBeGreaterThan(0);
    await expect(sendLoginCode("user@example.com")).rejects.toThrow(/发送太频繁/);
  });

  it("turns a server 429 into a friendly rate-limit message", async () => {
    const client = getSupabase();
    (client.auth.signInWithOtp as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      error: { status: 429, message: "rate limit exceeded" },
    });
    await expect(sendLoginCode("limited@example.com")).rejects.toThrow(/发送太频繁/);
  });

  it("restores cloud data with a local backup on a new device", async () => {
    writeV3Snapshot(validSnapshot);
    const client = getSupabase();
    const query = client.from("checkin_sync") as unknown as { single: ReturnType<typeof vi.fn> };
    const cloudRow = { user_code: "JH-CLOUD", start_date: "2026-09-20", records: {} };
    query.single.mockResolvedValueOnce({ data: cloudRow, error: null });
    await expect(loginWithEmail("user@example.com", "12345678")).resolves.toBe("cloud-restored");
    expect(readV3Snapshot().userCode).toBe("JH-CLOUD");
    const backups = Object.keys(window.localStorage).filter((k) => k.startsWith("junheng-v3-backup-"));
    expect(backups).toHaveLength(1);
  });

  it("seeds the cloud from local data when no cloud row exists", async () => {
    writeV3Snapshot(validSnapshot);
    await expect(loginWithEmail("user@example.com", "123456")).resolves.toBe("local-seeded");
    expect(readV3Snapshot()).toEqual(validSnapshot);
  });

  it("rejects an invalid OTP with a friendly error", async () => {
    const client = getSupabase();
    (client.auth.verifyOtp as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ error: { message: "invalid" } });
    await expect(loginWithEmail("user@example.com", "000000")).rejects.toThrow(/验证码不正确或已过期/);
  });
});
