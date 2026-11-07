import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { getSupabase } from "../lib/supabase";
import { emptyDay, STORAGE_KEY, todayKey } from "../utils/checkin";

function renderUserCenter() {
  return render(<MemoryRouter initialEntries={["/user-center"]}><App /></MemoryRouter>);
}

function cloudQuery() {
  return getSupabase().from("checkin_sync") as unknown as {
    maybeSingle: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
}

function seedState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    schema: 3,
    userCode: "JH-WQAKS",
    startDate: todayKey(),
    records: { [todayKey()]: { ...emptyDay(), weight: "70" } },
  }));
}

describe("账号安全", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("未配置 Supabase 时隐藏账号操作", () => {
    window.localStorage.clear();
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    renderUserCenter();
    expect(screen.queryByRole("button", { name: "修改邮箱" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "退出登录" })).not.toBeInTheDocument();
  });

  describe("已配置且已绑定邮箱", () => {
    beforeEach(() => {
      window.localStorage.clear();
      vi.clearAllMocks();
      vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
      vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
      seedState();
      (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { session: { user: { id: "test-uid", email: "old@example.com" } } },
      });
    });

    it("验证失败时保留旧邮箱并显示错误", async () => {
      (getSupabase().auth.verifyOtp as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ error: new Error("invalid") });
      const user = userEvent.setup();
      renderUserCenter();
      await user.click(await screen.findByRole("button", { name: "修改邮箱" }));
      expect(screen.getByText("old@example.com")).toBeInTheDocument();
      await user.type(screen.getByLabelText("邮箱地址"), "new@example.com");
      await user.click(screen.getByRole("button", { name: "发送修改验证码" }));
      await user.type(await screen.findByLabelText("邮箱验证码"), "123456");
      await user.click(screen.getByRole("button", { name: "确认修改邮箱" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("验证码不正确或已过期");
      expect(screen.getByText("old@example.com")).toBeInTheDocument();
      expect(screen.queryByText("邮箱修改成功，云端数据已同步")).not.toBeInTheDocument();
    });

    it("验证与云端同步成功后广播新邮箱且体验官代码不变", async () => {
      const user = userEvent.setup();
      renderUserCenter();
      await user.click(await screen.findByRole("button", { name: "修改邮箱" }));
      await user.type(screen.getByLabelText("邮箱地址"), "new@example.com");
      await user.click(screen.getByRole("button", { name: "发送修改验证码" }));
      expect(screen.getByText("old@example.com")).toBeInTheDocument();
      await user.type(await screen.findByLabelText("邮箱验证码"), "123456");
      await user.click(screen.getByRole("button", { name: "确认修改邮箱" }));

      expect(await screen.findByText("邮箱修改成功，云端数据已同步")).toBeInTheDocument();
      expect(screen.getByText("new@example.com")).toBeInTheDocument();
      expect(screen.queryByText("old@example.com")).not.toBeInTheDocument();
      expect(screen.getByText("JH-WQAKS")).toBeInTheDocument();
      expect(getSupabase().auth.updateUser).toHaveBeenCalledWith({ email: "new@example.com" });
      expect(getSupabase().auth.verifyOtp).toHaveBeenCalledWith({ email: "new@example.com", token: "123456", type: "email_change" });
    });

    it("服务端邮箱未真正更新时提示换绑未生效，不广播成功", async () => {
      (getSupabase().auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { user: { email: "old@example.com" } }, error: null,
      });
      const user = userEvent.setup();
      renderUserCenter();
      await user.click(await screen.findByRole("button", { name: "修改邮箱" }));
      await user.type(screen.getByLabelText("邮箱地址"), "new@example.com");
      await user.click(screen.getByRole("button", { name: "发送修改验证码" }));
      await user.type(await screen.findByLabelText("邮箱验证码"), "123456");
      await user.click(screen.getByRole("button", { name: "确认修改邮箱" }));

      // verifyOtp 成功但服务端仍是旧邮箱：明确报错，绝不假成功
      expect(await screen.findByRole("alert")).toHaveTextContent(/换绑未生效/);
      expect(screen.queryByText("邮箱修改成功，云端数据已同步")).not.toBeInTheDocument();
      expect(screen.getByText("old@example.com")).toBeInTheDocument();
    });

    it("退出登录保留本机 v3、体验官代码和云端数据", async () => {
      const before = window.localStorage.getItem(STORAGE_KEY);
      const user = userEvent.setup();
      renderUserCenter();
      await user.click(await screen.findByRole("button", { name: "退出登录" }));

      expect(await screen.findByText("已退出登录，本机记录与云端数据均已保留。")).toBeInTheDocument();
      expect(getSupabase().auth.signOut).toHaveBeenCalledTimes(1);
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(before);
      expect(screen.getByText("JH-WQAKS")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "退出登录" })).not.toBeInTheDocument();
    });

    describe("数据授权状态（仅展示，撤回走客服）", () => {
      it("已授权用户：撤回授权入口被移走，仅展示联系客服提示", async () => {
        cloudQuery().maybeSingle.mockResolvedValue({ data: { consent_granted: true }, error: null });
        renderUserCenter();

        expect(await screen.findByText("已授权参与数据研究")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "撤回授权" })).not.toBeInTheDocument();
        expect(screen.getByText(/如需撤回数据授权，请联系平台客服处理/)).toBeInTheDocument();
      });

      it("未授权用户（含建档默认 false）：统一显示未参与与同意参与按钮", async () => {
        cloudQuery().maybeSingle.mockResolvedValue({ data: { consent_granted: false }, error: null });
        renderUserCenter();

        expect(await screen.findByText("当前未参与数据研究")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "同意参与" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "撤回授权" })).not.toBeInTheDocument();
      });

      it("同意参与：经授权弹窗勾选确认后云端写入 consent_granted=true，界面同步翻转", async () => {
        const user = userEvent.setup();
        cloudQuery().maybeSingle.mockResolvedValue({ data: { consent_granted: false }, error: null });
        renderUserCenter();
        await user.click(await screen.findByRole("button", { name: "同意参与" }));

        const dialog = await screen.findByRole("dialog", { name: "开启前，请确认数据授权" });
        await user.click(within(dialog).getByRole("checkbox", { name: /真实数据研究/ }));
        await user.click(within(dialog).getByRole("button", { name: "同意并开启打卡" }));

        expect(cloudQuery().update).toHaveBeenCalledWith(expect.objectContaining({
          consent_granted: true,
          consent_at: expect.any(String),
        }));
        expect(await screen.findByText("已授权参与数据研究")).toBeInTheDocument();
        expect(screen.queryByRole("dialog", { name: "开启前，请确认数据授权" })).not.toBeInTheDocument();
      });
    });
  }); // 外层 describe 的闭合
});   // 最外层 describe 的闭合