import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { getSupabase } from "../lib/supabase";

function renderCheckIn() {
  return render(<MemoryRouter initialEntries={["/check-in"]}><App /></MemoryRouter>);
}

describe("sync panel", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("stays hidden when supabase env is not configured", () => {
    renderCheckIn();
    expect(screen.queryByText("跨设备同步")).not.toBeInTheDocument();
  });

  describe("with supabase configured (mocked)", () => {
    beforeEach(() => {
      window.localStorage.clear();
      vi.clearAllMocks();
      vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
      vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    });

    it("binds an email via OTP without changing the uid", async () => {
      const user = userEvent.setup();
      renderCheckIn();
      expect(await screen.findByText(/记录目前只保存在本机/)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "绑定邮箱，永久保存" }));
      await user.type(screen.getByLabelText("邮箱地址"), "bind@example.com");
      await user.click(screen.getByRole("button", { name: "发送绑定验证码" }));
      expect(await screen.findByText(/验证码已发送/)).toBeInTheDocument();

      const client = getSupabase();
      expect(client.auth.updateUser).toHaveBeenCalledWith({ email: "bind@example.com" });

      await user.type(screen.getByLabelText("邮箱验证码"), "12345678");
      await user.click(screen.getByRole("button", { name: "完成绑定" }));
      expect(await screen.findByText(/绑定成功/)).toBeInTheDocument();
      expect(client.auth.verifyOtp).toHaveBeenCalledWith({ email: "bind@example.com", token: "12345678", type: "email_change" });
      expect(screen.getByText(/已绑定：bind@example.com/)).toBeInTheDocument();
    });

    it("seeds local data to the cloud when restoring on a new device with no cloud row", async () => {
      const user = userEvent.setup();
      renderCheckIn();

      await user.click(screen.getByRole("button", { name: "在新设备恢复数据" }));
      await user.type(screen.getByLabelText("邮箱地址"), "restore@example.com");
      await user.click(screen.getByRole("button", { name: "发送登录验证码" }));
      expect(await screen.findByText(/验证码已发送/)).toBeInTheDocument();
      expect(getSupabase().auth.signInWithOtp).toHaveBeenCalled();

      await user.type(screen.getByLabelText("邮箱验证码"), "123456");
      await user.click(screen.getByRole("button", { name: "登录并恢复数据" }));
      expect(await screen.findByText(/云端暂无记录，已将本机数据上传到云端/)).toBeInTheDocument();
    });

    it("surfaces a friendly rate-limit error from the server", async () => {
      const user = userEvent.setup();
      (getSupabase().auth.signInWithOtp as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        error: { status: 429, message: "rate limit exceeded" },
      });
      renderCheckIn();

      await user.click(screen.getByRole("button", { name: "在新设备恢复数据" }));
      await user.type(screen.getByLabelText("邮箱地址"), "limited@example.com");
      await user.click(screen.getByRole("button", { name: "发送登录验证码" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(/发送太频繁/);
    });
  });
});
