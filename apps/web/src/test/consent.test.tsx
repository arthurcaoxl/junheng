import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { getSupabase } from "../lib/supabase";

function renderHome() {
  return render(<MemoryRouter initialEntries={["/"]}><App /></MemoryRouter>);
}

type CloudQuery = {
  maybeSingle: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function cloudQuery() {
  return getSupabase().from("checkin_sync") as unknown as CloudQuery;
}

function mockCloudConsent(consent: unknown) {
  cloudQuery().maybeSingle.mockResolvedValueOnce({
    data: consent === null ? null : { consent_granted: consent },
    error: null,
  });
}

function checkInEntryLink() {
  return screen.getAllByRole("link", { name: "开启 21 天脂代谢记录 →" }).at(-1) as HTMLElement;
}

describe("用户数据合规总授权", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    // 匿名身份复用 auth.uid：授权判定与写入均以该 uid 定位 checkin_sync 行
    (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { user: { id: "anonymous-uid" } } },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("新用户（云端从未表态）：点击入口被拦截，弹授权窗，未勾选时同意按钮禁用", async () => {
    const user = userEvent.setup();
    mockCloudConsent(null);
    renderHome();

    await user.click(checkInEntryLink());

    const dialog = await screen.findByRole("dialog", { name: "开启前，请确认数据授权" });
    // 勾选文案一字不差（默认不勾选）
    expect(within(dialog).getByText("☑️ 我同意参与平台真实数据研究（数据将脱敏处理，仅用于行业趋势分析，绝不泄露个人隐私）。")).toBeInTheDocument();
    // 协议链接可跳转现有静态页
    expect(within(dialog).getByRole("link", { name: "《用户服务协议》" })).toHaveAttribute("href", "/terms");
    expect(within(dialog).getByRole("link", { name: "《隐私政策》" })).toHaveAttribute("href", "/privacy");
    // 未勾选：主按钮禁用
    expect(within(dialog).getByRole("button", { name: "同意并开启打卡" })).toBeDisabled();
    // 被拦截：未进入打卡页
    expect(screen.queryByRole("region", { name: "21 天，构建你的脂代谢稳态。" })).not.toBeInTheDocument();
  });

  it("已同意（consent_granted=true）：点击入口直接放行，绝不弹窗", async () => {
    const user = userEvent.setup();
    mockCloudConsent(true);
    renderHome();

    await user.click(checkInEntryLink());

    expect(await screen.findByRole("region", { name: "21 天，构建你的脂代谢稳态。" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "开启前，请确认数据授权" })).not.toBeInTheDocument();
  });

  it("已拒绝（consent_granted=false）：同样永久放行，绝不弹窗", async () => {
    const user = userEvent.setup();
    mockCloudConsent(false);
    renderHome();

    await user.click(checkInEntryLink());

    expect(await screen.findByRole("region", { name: "21 天，构建你的脂代谢稳态。" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "开启前，请确认数据授权" })).not.toBeInTheDocument();
  });

  it("勾选复选框后，同意按钮解除禁用", async () => {
    const user = userEvent.setup();
    mockCloudConsent(null);
    renderHome();
    await user.click(checkInEntryLink());

    const dialog = await screen.findByRole("dialog", { name: "开启前，请确认数据授权" });
    const agree = within(dialog).getByRole("button", { name: "同意并开启打卡" });
    expect(agree).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox", { name: /真实数据研究/ }));
    expect(agree).toBeEnabled();
  });

  it("同意授权：写入云端 consent_granted=true 与 ISO 时间戳，并放行进入打卡页", async () => {
    const user = userEvent.setup();
    mockCloudConsent(null); // ① ensureConsent 查询表态：从未表态
    renderHome();
    await user.click(checkInEntryLink());
    const dialog = await screen.findByRole("dialog", { name: "开启前，请确认数据授权" });

    cloudQuery().maybeSingle.mockResolvedValueOnce({ data: { auth_user_id: "anonymous-uid" }, error: null }); // ② 表态落库前的行存在性检查：行已存在
    await user.click(within(dialog).getByRole("checkbox", { name: /真实数据研究/ }));
    await user.click(within(dialog).getByRole("button", { name: "同意并开启打卡" }));

    expect(cloudQuery().update).toHaveBeenCalledWith(expect.objectContaining({
      consent_granted: true,
      consent_at: expect.any(String),
    }));
    expect(screen.queryByRole("dialog", { name: "开启前，请确认数据授权" })).not.toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "21 天，构建你的脂代谢稳态。" })).toBeInTheDocument();
  });

  it("暂不参与：写入云端 consent_granted=false 与时间戳，并正常放行", async () => {
    const user = userEvent.setup();
    mockCloudConsent(null); // ① ensureConsent 查询表态：从未表态
    renderHome();
    await user.click(checkInEntryLink());
    const dialog = await screen.findByRole("dialog", { name: "开启前，请确认数据授权" });

    cloudQuery().maybeSingle.mockResolvedValueOnce({ data: { auth_user_id: "anonymous-uid" }, error: null }); // ② 行存在性检查：行已存在
    await user.click(within(dialog).getByRole("button", { name: "暂不参与" }));

    expect(cloudQuery().update).toHaveBeenCalledWith(expect.objectContaining({
      consent_granted: false,
      consent_at: expect.any(String),
    }));
    expect(screen.queryByRole("dialog", { name: "开启前，请确认数据授权" })).not.toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "21 天，构建你的脂代谢稳态。" })).toBeInTheDocument();
  });
});
