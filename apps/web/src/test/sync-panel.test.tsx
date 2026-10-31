import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { getSupabase } from "../lib/supabase";
import { addDays, emptyDay, STORAGE_KEY, todayKey } from "../utils/checkin";

function renderCheckIn(route = "/check-in") {
  return render(<MemoryRouter initialEntries={[route]}><App /></MemoryRouter>);
}

function seedRecordedDays(count: number, leaveTodayEmpty = false) {
  const startDate = addDays(todayKey(), -(count - 1 + (leaveTodayEmpty ? 1 : 0)));
  const recordedDay = { ...emptyDay(), weight: "65", waist: "82", water: true };
  const records = Object.fromEntries(Array.from({ length: count }, (_, index) => [addDays(startDate, index), recordedDay]));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: 3, userCode: "JH-TEST1", startDate, records }));
}

function seedCalendarDay(day: number, recordedDays: number) {
  const startDate = addDays(todayKey(), -(day - 1));
  const recordedDay = { ...emptyDay(), weight: "65", waist: "82", water: true };
  const records = Object.fromEntries(Array.from({ length: recordedDays }, (_, index) => [addDays(startDate, index), recordedDay]));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: 3, userCode: "JH-TEST1", startDate, records, clothesWeight: "0.5" }));
}

function mockPosterCanvas() {
  const context = {
    fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
    lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    measureText: vi.fn(() => ({ width: 100 })), closePath: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,poster");
}

async function bindFromMilestone(email = "seven@example.com") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("邮箱地址"), email);
  await user.click(screen.getByRole("button", { name: /获取邮箱验证码|立即绑定并查看海报/ }));
  await user.type(await screen.findByLabelText("邮箱验证码"), "12345678");
  await user.click(screen.getByRole("button", { name: /完成绑定/ }));
}

describe("sync panel", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("hides every sync entry when supabase env is not configured", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    renderCheckIn();
    expect(screen.queryByText("跨设备同步")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "未同步，绑定邮箱" })).not.toBeInTheDocument();
    expect(screen.getAllByText("数据已在本机自动保存。绑定邮箱可同步至云端，换设备随时恢复。")).toHaveLength(1);
  });

  describe("with supabase configured (mocked)", () => {
    beforeEach(() => {
      window.localStorage.clear();
      vi.clearAllMocks();
      vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
      vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
      (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { session: null } });
    });

    it("exposes the header pill and inline guide, both opening the shared modal", async () => {
      const user = userEvent.setup();
      renderCheckIn();
      expect(screen.getByRole("button", { name: "未同步，绑定邮箱" })).toBeInTheDocument();
      expect(screen.getAllByText("数据已在本机自动保存。绑定邮箱可同步至云端，换设备随时恢复。")).toHaveLength(3);

      await user.click(screen.getByRole("button", { name: "立即绑定" }));
      expect(screen.getByRole("dialog", { name: "绑定邮箱，换手机/电脑接着打卡" })).toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("binds an email, immediately backs up existing records, and refreshes all status surfaces", async () => {
      const user = userEvent.setup();
      seedRecordedDays(1);
      renderCheckIn();
      await user.click(screen.getByRole("button", { name: "绑定邮箱，换手机/电脑接着打卡" }));
      expect(screen.getByText(/输入邮箱接收 6–8 位数字验证码/)).toBeInTheDocument();
      await user.type(screen.getByLabelText("邮箱地址"), "bind@example.com");
      await user.click(screen.getByRole("button", { name: "获取邮箱验证码" }));
      expect(await screen.findByText(/验证码已发送/)).toBeInTheDocument();

      const client = getSupabase();
      expect(client.auth.updateUser).toHaveBeenCalledWith({ email: "bind@example.com" });

      await user.type(screen.getByLabelText("邮箱验证码"), "12345678");
      await user.click(screen.getByRole("button", { name: "完成绑定" }));
      expect(client.auth.verifyOtp).toHaveBeenCalledWith({ email: "bind@example.com", token: "12345678", type: "email_change" });

      expect(await screen.findByText(/已绑定邮箱：bind@example.com。打卡记录会自动备份到云端。/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "用户中心" })).toHaveAttribute("href", "/user-center");
      expect(screen.queryByRole("button", { name: "绑定邮箱，换手机/电脑接着打卡" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "立即绑定" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "在新设备恢复数据" })).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      const query = client.from("checkin_sync") as unknown as { insert: ReturnType<typeof vi.fn> };
      expect(query.insert).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole("button", { name: "立即备份到云端" }));
      expect(await screen.findByText("本机打卡记录已备份到云端。")).toBeInTheDocument();
      expect(query.insert).toHaveBeenCalledTimes(2);
    });

    it("seeds local data to the cloud when restoring on a new device with no cloud row", async () => {
      const user = userEvent.setup();
      seedRecordedDays(1);
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

    it("shows a dismissible soft prompt exactly when the third day is recorded", async () => {
      vi.useFakeTimers();
      seedRecordedDays(2, true);
      renderCheckIn();
      fireEvent.click(screen.getByRole("checkbox", { name: "早餐前已饮用" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(1500); });

      expect(screen.getByText("🎉 您已坚持打卡 3 天！建议绑定邮箱，防止数据丢失，换手机也能接着打卡。")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "暂不" }));
      expect(screen.queryByText(/您已坚持打卡 3 天/)).not.toBeInTheDocument();
      expect(window.localStorage.getItem("junheng-sync-toast-snooze")).not.toBeNull();
    });

    it("gates calendar day 7 after a D3 snooze and keeps saving after dismissal", async () => {
      mockPosterCanvas();
      seedCalendarDay(7, 1);
      window.localStorage.setItem("junheng-sync-toast-snooze", String(Date.now()));
      const user = userEvent.setup();
      renderCheckIn("/user-center");
      await user.click(screen.getByRole("button", { name: "生成专属成就海报" }));
      expect(screen.getByRole("dialog", { name: "🎉 您的专属健康海报已生成！" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "暂不，返回打卡" }));
      await user.click(screen.getByRole("link", { name: "继续打卡" }));

      await user.type(screen.getByLabelText("早晨体重（空腹）"), "68");
      await bindFromMilestone("after-d7@example.com");
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
      expect(saved.records[todayKey()].weights.morning).toBe("68");
      expect(saved.records[todayKey()].weight).toBe("67.5");
      expect(screen.queryByRole("img", { name: "21 天健康记录海报预览" })).not.toBeInTheDocument();
    });

    it("blocks an anonymous day-7 poster export with achievement copy and a blurred preview", async () => {
      mockPosterCanvas();
      seedRecordedDays(7);
      const user = userEvent.setup();
      renderCheckIn("/user-center");
      await user.click(screen.getByRole("button", { name: "生成专属成就海报" }));

      const dialog = screen.getByRole("dialog", { name: "🎉 您的专属健康海报已生成！" });
      expect(dialog).toHaveTextContent("绑定邮箱即可永久保存这份成就（换手机不丢失）。登录后将自动为您展开高清海报。");
      expect(screen.getByRole("button", { name: "立即绑定并查看海报" })).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "专属健康海报模糊预览" })).toBeInTheDocument();
      expect(screen.queryByRole("img", { name: "21 天健康记录海报预览" })).not.toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      fireEvent.click(document.querySelector(".sync-modal-overlay")!);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "暂不，返回打卡" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.queryByRole("img", { name: "21 天健康记录海报预览" })).not.toBeInTheDocument();
    });

    it("automatically continues the poster export after day-7 email binding", async () => {
      mockPosterCanvas();
      seedRecordedDays(7);
      const user = userEvent.setup();
      renderCheckIn("/user-center");
      await user.click(screen.getByRole("button", { name: "生成专属成就海报" }));
      await bindFromMilestone();

      expect(await screen.findByRole("img", { name: "21 天健康记录海报预览" })).toHaveAttribute("src", "data:image/png;base64,poster");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(getSupabase().auth.verifyOtp).toHaveBeenCalledWith({ email: "seven@example.com", token: "12345678", type: "email_change" });
    });

    it("gates day-7 trends and reveals the original charts after binding", async () => {
      mockPosterCanvas();
      seedRecordedDays(7);
      const user = userEvent.setup();
      renderCheckIn("/user-center");
      expect(screen.queryByRole("img", { name: "体重趋势图" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "查看趋势图" }));
      expect(screen.getByRole("dialog", { name: /太棒了！您已坚持记录 7 天/ })).toBeInTheDocument();
      await bindFromMilestone("trend@example.com");

      expect(await screen.findByRole("img", { name: "体重趋势图" })).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "腰围趋势图" })).toBeInTheDocument();
    });

    it("does not gate a bound user and links the header icon to a real user-center route", async () => {
      mockPosterCanvas();
      seedRecordedDays(7);
      (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { session: { user: { email: "bound@example.com" } } },
      });
      const user = userEvent.setup();
      renderCheckIn();
      const userCenterLink = await screen.findByRole("link", { name: "用户中心" });
      await user.click(userCenterLink);
      expect(screen.getByRole("heading", { name: "我的脂代谢追踪档案" })).toBeInTheDocument();
      expect(screen.getByText("bound@example.com")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "生成专属成就海报" }));
      expect(screen.getByRole("img", { name: "21 天健康记录海报预览" })).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "继续打卡" })).toHaveAttribute("href", "/check-in");
    });
  });
});
