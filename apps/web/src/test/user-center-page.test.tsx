import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { getSupabase } from "../lib/supabase";
import { addDays, emptyDay, STORAGE_KEY, todayKey } from "../utils/checkin";

function renderAt(route = "/user-center") {
  return render(<MemoryRouter initialEntries={[route]}><App /></MemoryRouter>);
}

function seedState(records: Record<string, ReturnType<typeof emptyDay>>, startDate = todayKey()) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    schema: 3, userCode: "JH-WQAKS", startDate, records,
  }));
}

function mockPosterCanvas() {
  const context = {
    fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
    lineTo: vi.fn(), stroke: vi.fn(), strokeRect: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    measureText: vi.fn(() => ({ width: 100 })), closePath: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,poster");
  return context;
}

describe("用户中心本机档案与资产", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("展示会员身份、数据样本天数和核心体重指标变化", () => {
    const startDate = addDays(todayKey(), -1);
    seedState({
      [startDate]: { ...emptyDay(), weight: "70" },
      [todayKey()]: { ...emptyDay(), weight: "69.4" },
    }, startDate);
    window.localStorage.setItem("junheng-checkin-name-v1", "小菌");
    renderAt();

    expect(screen.getByRole("heading", { name: "我的脂代谢追踪档案" })).toBeInTheDocument();
    expect(screen.getByText("小菌")).toBeInTheDocument();
    expect(screen.getByText("JH-WQAKS")).toBeInTheDocument();
    expect(screen.getByText("脂代谢观察员")).toBeInTheDocument();
    expect(screen.getByText(/品牌会员称号，不代表科研或职业身份/)).toBeInTheDocument();
    const stats = screen.getByRole("region", { name: "本期健康统计" });
    expect(within(stats).getByText("数据样本天数")).toBeInTheDocument();
    expect(within(stats).getByText("2")).toBeInTheDocument();
    expect(within(stats).getByText("核心体重指标变化")).toBeInTheDocument();
    expect(within(stats).getByText("-0.6 kg")).toBeInTheDocument();
    expect(screen.queryByText(/核心脂质指标变化/)).not.toBeInTheDocument();
    const userCenter = screen.getByRole("region", { name: "我的脂代谢追踪档案" });
    expect(within(userCenter).getByText("注：菌衡计划·脂代谢研究所为本品牌内部健康管理研究平台，非医疗或国家级学术机构。相关数据与成分科普不作为医疗诊断或治疗依据。")).toBeInTheDocument();
  });

  it("少于两条有效体重时显示统一空态", () => {
    seedState({ [todayKey()]: { ...emptyDay(), weight: "70" } });
    renderAt();
    const stats = screen.getByRole("region", { name: "本期健康统计" });
    expect(within(stats).getByText("—")).toBeInTheDocument();
    expect(within(stats).getByText("记录满 2 天即可计算变化")).toBeInTheDocument();
  });

  it("未配置云端时仍可使用趋势、海报和 CSV", async () => {
    mockPosterCanvas();
    const createObjectURL = vi.spyOn(URL, "createObjectURL");
    const user = userEvent.setup();
    seedState({ [todayKey()]: { ...emptyDay(), weight: "70" } });
    renderAt();

    expect(screen.getByRole("img", { name: "体重趋势图" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "导出记录海报" }));
    expect(screen.getByRole("img", { name: "21 天健康记录海报预览" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "导出打卡 CSV" }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("跨设备同步")).not.toBeInTheDocument();
  });

  it("打卡页只保留个人资产入口，不再渲染趋势和海报", () => {
    renderAt("/check-in");
    expect(screen.getByRole("link", { name: "前往用户中心查看个人资产" })).toHaveAttribute("href", "/user-center");
    expect(screen.queryByRole("button", { name: "导出记录海报" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导出打卡 CSV" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "体重趋势图" })).not.toBeInTheDocument();
  });

  it("累计 20 天时证书保持锁定并显示进度", () => {
    seedState(Object.fromEntries(Array.from({ length: 20 }, (_, index) => [
      addDays("2026-01-01", index), { ...emptyDay(), weight: "70" },
    ])));
    renderAt();
    expect(screen.getByRole("button", { name: "生成结业证书" })).toBeDisabled();
    expect(screen.getByText(/当前进度 20\/21/)).toBeInTheDocument();
  });

  it("非连续累计 21 天可生成证书，空昵称使用会员落款", async () => {
    const context = mockPosterCanvas();
    const user = userEvent.setup();
    seedState(Object.fromEntries([
      ...Array.from({ length: 20 }, (_, index) => [addDays("2026-01-01", index), { ...emptyDay(), weight: "70" }]),
      ["2026-03-15", { ...emptyDay(), weight: "70" }],
    ]));
    renderAt();

    await user.click(screen.getByRole("button", { name: "生成结业证书" }));
    expect(screen.getByRole("img", { name: "21 天会员结业纪念证书预览" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "下载结业证书 PNG" })).toHaveAttribute("download", "菌衡计划-21天会员结业纪念证书.png");
    expect(context.fillText).toHaveBeenCalledWith("脂代谢研究所会员", expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith("FUNGIBLEND-2026-WQAKS", expect.any(Number), expect.any(Number));
  });

  it("Canvas 不可用时仅提示证书错误，趋势和 CSV 仍可用", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const user = userEvent.setup();
    seedState(Object.fromEntries(Array.from({ length: 21 }, (_, index) => [
      addDays("2026-01-01", index), { ...emptyDay(), weight: "70" },
    ])));
    renderAt();

    await user.click(screen.getByRole("button", { name: "生成结业证书" }));
    expect(screen.getByRole("alert")).toHaveTextContent("当前浏览器无法生成结业证书");
    expect(screen.getByRole("region", { name: "21 天身体记录趋势" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出打卡 CSV" })).toBeEnabled();
  });
});

describe("用户中心 D7 与绑定状态", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    const startDate = addDays(todayKey(), -6);
    seedState(Object.fromEntries(Array.from({ length: 7 }, (_, index) => [
      addDays(startDate, index), { ...emptyDay(), weight: "70" },
    ])), startDate);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("匿名 D7 海报先拦截，绑定成功后继续导出", async () => {
    (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { session: null } });
    mockPosterCanvas();
    const user = userEvent.setup();
    renderAt();

    expect(screen.queryByRole("img", { name: "体重趋势图" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "导出记录海报" }));
    expect(screen.getByRole("dialog", { name: "🎉 您的专属健康海报已生成！" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("邮箱地址"), "seven@example.com");
    await user.click(screen.getByRole("button", { name: "立即绑定并查看海报" }));
    await user.type(await screen.findByLabelText("邮箱验证码"), "12345678");
    await user.click(screen.getByRole("button", { name: "完成绑定并查看海报" }));
    expect(await screen.findByRole("img", { name: "21 天健康记录海报预览" })).toBeInTheDocument();
  });

  it("匿名 D7 生成证书先拦截，绑定成功后继续导出", async () => {
    (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { session: null } });
    const startDate = addDays(todayKey(), -6);
    seedState(Object.fromEntries(Array.from({ length: 21 }, (_, index) => [
      addDays(startDate, index), { ...emptyDay(), weight: "70" },
    ])), startDate);
    mockPosterCanvas();
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole("button", { name: "生成结业证书" }));
    expect(screen.getByRole("dialog", { name: "🎉 您的会员结业纪念证书已生成！" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("邮箱地址"), "certificate@example.com");
    await user.click(screen.getByRole("button", { name: "立即绑定并查看证书" }));
    await user.type(await screen.findByLabelText("邮箱验证码"), "12345678");
    await user.click(screen.getByRole("button", { name: "完成绑定并查看证书" }));
    expect(await screen.findByRole("img", { name: "21 天会员结业纪念证书预览" })).toBeInTheDocument();
  });

  it("已绑定邮箱显示研究员称号且资产不再拦截", async () => {
    (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { user: { email: "bound@example.com" } } },
    });
    mockPosterCanvas();
    const user = userEvent.setup();
    renderAt();

    expect(await screen.findByText("研究员")).toBeInTheDocument();
    expect(screen.getByText("bound@example.com")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "体重趋势图" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "导出记录海报" }));
    expect(screen.getByRole("img", { name: "21 天健康记录海报预览" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
