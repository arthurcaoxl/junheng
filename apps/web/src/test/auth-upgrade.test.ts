import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../lib/supabase";
import { confirmEmailUpgrade, confirmOldEmailForChange, upgradeToPermanentAccount } from "../services/authUpgrade";

describe("upgradeToPermanentAccount 错误分类与脱敏诊断", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("目标邮箱已被其他账号占用时给出可操作的中文提示", async () => {
    const client = getSupabase();
    (client.auth.updateUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      error: { status: 422, code: "email_exists", message: "A user with this email address has already been registered" },
    });
    await expect(upgradeToPermanentAccount("taken@163.com")).rejects.toThrow(/已被其他账号占用/);
  });

  it("429 或频控错误保留原有的发送太频繁提示", async () => {
    const client = getSupabase();
    (client.auth.updateUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      error: { status: 429, message: "rate limit exceeded" },
    });
    await expect(upgradeToPermanentAccount("limited@example.com")).rejects.toThrow(/发送太频繁/);
  });

  it("其他失败输出脱敏诊断日志且不暴露完整邮箱", async () => {
    const client = getSupabase();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    (client.auth.updateUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      error: { status: 500, message: "SMTP relay rejected" },
    });

    await expect(upgradeToPermanentAccount("camper@example.com")).rejects.toThrow(/绑定请求失败/);

    expect(consoleError).toHaveBeenCalledWith("Email change request failed", {
      status: 500,
      code: undefined,
      emailDomain: "example.com",
      message: "SMTP relay rejected",
    });
  });

  it("成功时按目标邮箱发起原地升级", async () => {
    const client = getSupabase();
    await expect(upgradeToPermanentAccount("new@example.com")).resolves.toBeUndefined();
    expect(client.auth.updateUser).toHaveBeenCalledWith({ email: "new@example.com" });
  });
});


describe("confirmEmailUpgrade 双确认核对", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("服务端邮箱已等于目标邮箱时判定换绑真正生效", async () => {
    (getSupabase().auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { user: { email: "new@example.com" } }, error: null,
    });
    await expect(confirmEmailUpgrade("new@example.com", "12345678")).resolves.toEqual({ status: "changed" });
  });

  it("仅新邮箱验证但服务端仍是旧邮箱时返回 pending 与当前邮箱", async () => {
    (getSupabase().auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { user: { email: "old@example.com" } }, error: null,
    });
    await expect(confirmEmailUpgrade("new@example.com", "12345678")).resolves.toEqual({
      status: "pending",
      currentEmail: "old@example.com",
    });
  });

  it("验证码错误时抛出友好提示", async () => {
    (getSupabase().auth.verifyOtp as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ error: { message: "invalid" } });
    await expect(confirmEmailUpgrade("new@example.com", "000000")).rejects.toThrow(/验证码不正确或已过期/);
  });
});

describe("confirmOldEmailForChange 原邮箱二次确认", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("用原邮箱提交确认码，服务端更新为目标邮箱后成功", async () => {
    (getSupabase().auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { user: { email: "new@example.com" } }, error: null,
    });
    await expect(confirmOldEmailForChange("old@example.com", "new@example.com", "87654321")).resolves.toBeUndefined();
    expect(getSupabase().auth.verifyOtp).toHaveBeenCalledWith({ email: "old@example.com", token: "87654321", type: "email_change" });
  });

  it("原邮箱确认码错误时给出针对性提示", async () => {
    (getSupabase().auth.verifyOtp as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ error: { message: "invalid" } });
    await expect(confirmOldEmailForChange("old@example.com", "new@example.com", "000000")).rejects.toThrow(/原邮箱确认码不正确或已过期/);
  });

  it("确认后服务端仍未换绑时不允许报成功", async () => {
    (getSupabase().auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { user: { email: "old@example.com" } }, error: null,
    });
    await expect(confirmOldEmailForChange("old@example.com", "new@example.com", "87654321")).rejects.toThrow(/尚未生效/);
  });
});
