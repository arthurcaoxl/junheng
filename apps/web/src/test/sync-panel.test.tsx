import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { getSupabase } from "../lib/supabase";
import { addDays, emptyDay, STORAGE_KEY, todayKey } from "../utils/checkin";

function renderCheckIn() {
  return render(<MemoryRouter initialEntries={["/check-in"]}><App /></MemoryRouter>);
}

describe("sync panel", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("hides every sync entry when supabase env is not configured", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    renderCheckIn();
    expect(screen.queryByText("跨设备同步")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "未同步，绑定邮箱" })).not.toBeInTheDocument();
    expect(screen.queryByText(/记录目前仅保存在本机/)).not.toBeInTheDocument();
  });

  describe("with supabase configured (mocked)", () => {
    beforeEach(() => {
      window.localStorage.clear();
      vi.clearAllMocks();
      vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
      vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    });

    it("exposes the header pill and inline guide, both opening the shared modal", async () => {
      const user = userEvent.setup();
      renderCheckIn();
      expect(screen.getByRole("button", { name: "未同步，绑定邮箱" })).toBeInTheDocument();
      expect(screen.getAllByText(/记录目前仅保存在本机/)).toHaveLength(2);

      await user.click(screen.getByRole("button", { name: "立即绑定" }));
      expect(screen.getByRole("dialog", { name: "绑定邮箱，永久保存" })).toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("binds an email via OTP and refreshes all status surfaces", async () => {
      const user = userEvent.setup();
      renderCheckIn();
      await user.click(screen.getByRole("button", { name: "绑定邮箱，永久保存" }));
      await user.type(screen.getByLabelText("邮箱地址"), "bind@example.com");
      await user.click(screen.getByRole("button", { name: "发送绑定验证码" }));
      expect(await screen.findByText(/验证码已发送/)).toBeInTheDocument();

      const client = getSupabase();
      expect(client.auth.updateUser).toHaveBeenCalledWith({ email: "bind@example.com" });

      await user.type(screen.getByLabelText("邮箱验证码"), "12345678");
      await user.click(screen.getByRole("button", { name: "完成绑定" }));
      expect(client.auth.verifyOtp).toHaveBeenCalledWith({ email: "bind@example.com", token: "12345678", type: "email_change" });

      expect(await screen.findByText(/已绑定邮箱：bind@example.com。数据自动同步至云端。/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "已同步，查看跨设备同步" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "绑定邮箱，永久保存" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "立即绑定" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "在新设备恢复数据" })).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
      expect(getSupabase().auth.verifyOtp).toHaveBeenCalledWith({ email: "restore@example.com", token: "123456", type: "email" });
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

    it("shows a dismissible soft prompt after the fourth recorded day", async () => {
      vi.useFakeTimers();
      const startDate = addDays(todayKey(), -3);
      const recordedDay = { ...emptyDay(), water: true };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        schema: 3,
        userCode: "JH-TEST1",
        startDate,
        records: {
          [startDate]: recordedDay,
          [addDays(startDate, 1)]: recordedDay,
          [addDays(startDate, 2)]: recordedDay,
        },
      }));
      renderCheckIn();
      fireEvent.click(screen.getByRole("checkbox", { name: "早餐前已饮用" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(1500); });

      expect(screen.getByText(/您已坚持打卡 4 天/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "稍后再说" }));
      expect(screen.queryByText(/您已坚持打卡 4 天/)).not.toBeInTheDocument();
      expect(window.localStorage.getItem("junheng-sync-toast-snooze")).not.toBeNull();
    });
  });
});
