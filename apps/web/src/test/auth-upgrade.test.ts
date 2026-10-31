import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../lib/supabase";
import { confirmEmailUpgrade, upgradeToPermanentAccount } from "../services/authUpgrade";

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


describe("confirmEmailUpgrade 服务端邮箱强制核对（杜绝假成功）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verifyOtp 成功且服务端邮箱已等于目标邮箱时正常完成", async () => {
    (getSupabase().auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { user: { email: "new@example.com" } }, error: null,
    });
    await expect(confirmEmailUpgrade("new@example.com", "12345678")).resolves.toBeUndefined();
  });

  it("verifyOtp 成功但服务端仍是旧邮箱时抛出换绑未生效", async () => {
    (getSupabase().auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { user: { email: "old@example.com" } }, error: null,
    });
    await expect(confirmEmailUpgrade("new@example.com", "12345678")).rejects.toThrow(/换绑未生效/);
  });

  it("拿不到服务端用户（邮箱未知）时同样不允许报成功", async () => {
    (getSupabase().auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { user: null }, error: null,
    });
    await expect(confirmEmailUpgrade("new@example.com", "12345678")).rejects.toThrow(/换绑未生效/);
  });

  it("验证码错误时抛出友好提示", async () => {
    (getSupabase().auth.verifyOtp as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ error: { message: "invalid" } });
    await expect(confirmEmailUpgrade("new@example.com", "000000")).rejects.toThrow(/验证码不正确或已过期/);
  });
});
