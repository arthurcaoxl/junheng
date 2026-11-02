import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { getSupabase } from "../lib/supabase";

function renderApp(initialPath = "/check-in") {
  return render(<MemoryRouter initialEntries={[initialPath]}><App /></MemoryRouter>);
}

function consentDialog() {
  return screen.getByRole("dialog", { name: "数据使用授权" });
}

describe("数据合规授权弹窗", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    // 匿名会话已有 uid：授权写入必须以 uid 定位 checkin_sync 行，不依赖邮箱登录。
    (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { user: { id: "anonymous-uid", email: null } } },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("首次进入打卡页展示授权弹窗，含脱敏/代谢研究关键词与两条协议链接", () => {
    renderApp();
    const dialog = consentDialog();
    expect(within(dialog).getByText(/脱敏/)).toBeInTheDocument();
    expect(within(dialog).getByText(/代谢研究/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "《用户服务协议》" })).toHaveAttribute("href", "/terms");
    expect(within(dialog).getByRole("link", { name: "《隐私政策》" })).toHaveAttribute("href", "/privacy");
  });

  it("默认不勾选：同意按钮禁用；勾选后解除禁用", async () => {
    const user = userEvent.setup();
    renderApp();
    const dialog = consentDialog();
    const agree = within(dialog).getByRole("button", { name: "同意并开启打卡" });
    expect(agree).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox", { name: /我同意平台/ }));
    expect(agree).toBeEnabled();
  });

  it("勾选同意后向云端写入 consent_granted 与 consent_at，并本地留痕", async () => {
    const user = userEvent.setup();
    renderApp();
    const dialog = consentDialog();
    await user.click(within(dialog).getByRole("checkbox", { name: /我同意平台/ }));
    await user.click(within(dialog).getByRole("button", { name: "同意并开启打卡" }));

    const query = getSupabase().from("checkin_sync") as unknown as { update: ReturnType<typeof vi.fn> };
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({
      consent_granted: true,
      consent_at: expect.any(String),
    }));
    expect(window.localStorage.getItem("junheng-consent")).toBe("true");
    expect(screen.queryByRole("dialog", { name: "数据使用授权" })).not.toBeInTheDocument();
  });

  it("点击《隐私政策》跳转至 /privacy 静态页", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(within(consentDialog()).getByRole("link", { name: "《隐私政策》" }));
    expect(await screen.findByRole("heading", { name: "隐私政策" })).toBeInTheDocument();
    expect(screen.getByText(/本地优先/)).toBeInTheDocument();
    expect(screen.getAllByText(/脱敏/).length).toBeGreaterThan(0);
  });

  it("点击《用户服务协议》跳转至 /terms 静态页", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(within(consentDialog()).getByRole("link", { name: "《用户服务协议》" }));
    expect(await screen.findByRole("heading", { name: "用户服务协议" })).toBeInTheDocument();
    expect(screen.getByText(/不构成任何形式的医疗诊断/)).toBeInTheDocument();
  });

  it("已授权用户再次进入不再看到弹窗", () => {
    window.localStorage.setItem("junheng-consent", "true");
    renderApp();
    expect(screen.queryByRole("dialog", { name: "数据使用授权" })).not.toBeInTheDocument();
  });
});
