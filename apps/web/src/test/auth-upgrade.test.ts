import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../lib/supabase";
import { upgradeToPermanentAccount } from "../services/authUpgrade";

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
