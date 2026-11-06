import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { getSupabase } from "../lib/supabase";

// recharts 在 jsdom 中量不到尺寸，用轻量桩代替，专注验证页面交互
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="chart">{children}</div>,
  LineChart: () => null,
  BarChart: () => null,
  Line: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

// jsdom 无 Canvas 2D，海报绘制本身由 recordPoster 专项测试覆盖
vi.mock("../utils/recordPoster", () => ({
  createRecordPoster: vi.fn(() => "data:image/png;base64,poster"),
}));

function renderAdmin() {
  return render(<MemoryRouter initialEntries={["/admin/check-in"]}><App /></MemoryRouter>);
}

describe("admin check-in page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("logs in with email OTP and lists campers without exposing internal UID", async () => {
    const user = userEvent.setup();
    const client = getSupabase();
    (client.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: [{
        auth_user_id: "private-uid-1",
        email: "camper@example.com",
        user_code: "JH-ADMIN1",
        start_date: "2026-10-01",
        records: {
          "2026-10-01": { weight: "80", waist: "", meals: [true, false, false], water: true, movement: false, sleep: false },
          "2026-10-02": { weight: "", waist: "", meals: [false, false, false], water: false, movement: true, sleep: false },
        },
        updated_at: "2026-10-30T10:00:00.000Z",
      }],
      error: null,
    });
    renderAdmin();

    await user.type(screen.getByLabelText("管理员邮箱"), "admin@example.com");
    await user.click(screen.getByRole("button", { name: "获取管理员验证码" }));
    await user.type(await screen.findByLabelText("邮箱验证码"), "123456");
    await user.click(screen.getByRole("button", { name: "登录并查看统计" }));

    expect(await screen.findByText("打卡统计管理")).toBeInTheDocument();
    expect(screen.getByText("JH-ADMIN1")).toBeInTheDocument();
    expect(screen.getByText("camper@example.com")).toBeInTheDocument();
    expect(screen.getByText("2 天")).toBeInTheDocument();
    expect(screen.getByText("D21")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出脱敏 CSV" })).toBeEnabled();
    expect(screen.queryByText(/private-uid/)).not.toBeInTheDocument();
    expect(client.auth.verifyOtp).toHaveBeenCalledWith({ email: "admin@example.com", token: "123456", type: "email" });
    expect(client.rpc).toHaveBeenCalledWith("admin_checkin_overview");
  });

  it("验证码不足 6 位时禁用提交按钮，满 6 位解除禁用", async () => {
    const user = userEvent.setup();
    renderAdmin();
    await user.type(screen.getByLabelText("管理员邮箱"), "gate-admin@example.com");
    await user.click(screen.getByRole("button", { name: "获取管理员验证码" }));
    const codeInput = await screen.findByLabelText("邮箱验证码");
    const submit = screen.getByRole("button", { name: "登录并查看统计" });

    await user.type(codeInput, "12345");
    expect(submit).toBeDisabled();
    expect(getSupabase().auth.verifyOtp).not.toHaveBeenCalled();

    await user.type(codeInput, "6");
    expect(submit).toBeEnabled();
  });

  it("shows a friendly whitelist error for a non-admin email", async () => {
    const user = userEvent.setup();
    const client = getSupabase();
    (client.rpc as ReturnType<typeof vi.fn>).mockRejectedValueOnce({ code: "P0001", message: "当前邮箱不是管理员" });
    renderAdmin();

    await user.type(screen.getByLabelText("管理员邮箱"), "outside@example.com");
    await user.click(screen.getByRole("button", { name: "获取管理员验证码" }));
    await user.type(await screen.findByLabelText("邮箱验证码"), "123456");
    await user.click(screen.getByRole("button", { name: "登录并查看统计" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/没有管理员权限/);
    expect(screen.queryByText("打卡统计管理")).toBeInTheDocument();
    expect(screen.queryByText("JH-ADMIN1")).not.toBeInTheDocument();
  });

  it("shows KPI cards, filters campers and opens the drill-down drawer", async () => {
    const user = userEvent.setup();
    const client = getSupabase();
    (client.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: [
        {
          auth_user_id: "private-uid-1",
          email: "camper@example.com",
          user_code: "JH-ADMIN1",
          start_date: "2026-10-01",
          records: {
            "2026-10-01": { weight: "80", waist: "100", meals: [true, false, false], water: true, movement: false, sleep: false },
          },
          updated_at: "2026-10-30T10:00:00.000Z",
        },
        {
          auth_user_id: "private-uid-2",
          email: null,
          user_code: "JH-GUEST2",
          start_date: "2026-10-01",
          records: {},
          updated_at: "2026-10-30T11:00:00.000Z",
        },
      ],
      error: null,
    });
    renderAdmin();

    await user.type(screen.getByLabelText("管理员邮箱"), "kpis-admin@example.com");
    await user.click(screen.getByRole("button", { name: "获取管理员验证码" }));
    await user.type(await screen.findByLabelText("邮箱验证码"), "123456");
    await user.click(screen.getByRole("button", { name: "登录并查看统计" }));

    // KPI 看板
    expect(await screen.findByText("体验官总数")).toBeInTheDocument();
    expect(screen.getByText("绑定邮箱比例")).toBeInTheDocument();
    expect(screen.getByText("今日打卡人数")).toBeInTheDocument();
    expect(screen.getByText("全营平均体重变化")).toBeInTheDocument();
    expect(screen.getByText("2 人")).toBeInTheDocument();

    // 筛选：仅未绑定邮箱
    await user.click(screen.getByRole("button", { name: "未绑定邮箱" }));
    expect(screen.queryByText("JH-ADMIN1")).not.toBeInTheDocument();
    expect(screen.getByText("JH-GUEST2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "全部" }));

    // 下钻 Drawer：点击体验官行，查看个人明细
    await user.click(screen.getByRole("button", { name: "查看体验官 JH-ADMIN1 的每日明细" }));
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByText("JH-ADMIN1")).toBeInTheDocument();
    expect(within(drawer).getByText(/camper@example.com · 开营 2026-10-01/)).toBeInTheDocument();
    expect(within(drawer).getByText("D21")).toBeInTheDocument();
    expect(screen.queryByText(/private-uid/)).not.toBeInTheDocument();

    // Tab 2：复用前台个人趋势组件
    await user.click(within(drawer).getByRole("tab", { name: "个人趋势" }));
    expect(within(drawer).getByText("体重趋势")).toBeInTheDocument();
    expect(within(drawer).getByText("腰围趋势")).toBeInTheDocument();
    await user.click(within(drawer).getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // 列表快捷操作：一键生成海报，直接落在海报 Tab
    await user.click(screen.getByRole("button", { name: "为体验官 JH-ADMIN1 生成海报" }));
    const posterDrawer = await screen.findByRole("dialog");
    expect(within(posterDrawer).getByRole("tab", { name: "打卡海报" })).toHaveAttribute("aria-selected", "true");
    expect(within(posterDrawer).getByAltText("体验官 JH-ADMIN1 的 21 天打卡海报预览")).toHaveAttribute("src", "data:image/png;base64,poster");
    expect(within(posterDrawer).getByRole("button", { name: "下载 PNG 海报" })).toBeEnabled();
    const { createRecordPoster } = await import("../utils/recordPoster");
    expect(createRecordPoster).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ weight: "80" })]),
      "",
      { userCode: "JH-ADMIN1", startDate: "2026-10-01", endDate: "2026-10-21" },
    );
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("separates current-window totals from out-of-window history", async () => {
    const user = userEvent.setup();
    const client = getSupabase();
    (client.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: [{
        auth_user_id: "private-uid-1",
        email: "camper@example.com",
        user_code: "JH-KEHUJ",
        start_date: "2026-11-01",
        records: {
          "2026-10-30": { weight: "69.1", waist: "96", meals: [false, false, false], water: false, movement: false, sleep: false },
          "2026-10-31": { weight: "68.9", waist: "95.5", meals: [false, false, false], water: false, movement: false, sleep: false },
          "2026-11-01": { weight: "68.7", waist: "95", meals: [false, false, false], water: false, movement: false, sleep: false },
        },
        updated_at: "2026-11-01T10:00:00.000Z",
      }],
      error: null,
    });
    renderAdmin();

    await user.type(screen.getByLabelText("管理员邮箱"), "history-admin@example.com");
    await user.click(screen.getByRole("button", { name: "获取管理员验证码" }));
    await user.type(await screen.findByLabelText("邮箱验证码"), "123456");
    await user.click(screen.getByRole("button", { name: "登录并查看统计" }));
    await user.click(await screen.findByRole("button", { name: "查看体验官 JH-KEHUJ 的每日明细" }));

    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByText(/本期累计 1 天 · 窗口外 2 天/)).toBeInTheDocument();
    const detail = within(drawer).getByRole("tabpanel", { name: "数据明细" });
    expect(detail).toHaveTextContent("当前窗口外另有 2 天有效记录");
    expect(detail).toHaveTextContent("2026-10-30、2026-10-31");
    expect(detail).toHaveTextContent("下方明细、个人趋势与海报仅展示本期 21 天");
  });

  it("登录后挂载独立雷达且雷达失败不影响既有营员列表", async () => {
    const user = userEvent.setup();
    const client = getSupabase();
    (client.rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "admin_checkin_overview") {
        return Promise.resolve({
          data: [{
            auth_user_id: "private-uid-radar",
            email: "camper@example.com",
            user_code: "JH-RADAR-KEEP",
            start_date: "2026-10-01",
            records: {},
            updated_at: "2026-10-30T10:00:00.000Z",
          }],
          error: null,
        });
      }
      if (name === "get_coach_radar_v1") {
        return Promise.resolve({ data: null, error: { code: "PGRST301", message: "network unavailable" } });
      }
      return Promise.resolve({ data: [], error: null });
    });
    renderAdmin();

    await user.type(screen.getByLabelText("管理员邮箱"), "radar-admin@example.com");
    await user.click(screen.getByRole("button", { name: "获取管理员验证码" }));
    await user.type(await screen.findByLabelText("邮箱验证码"), "123456");
    await user.click(screen.getByRole("button", { name: "登录并查看统计" }));

    expect(await screen.findByText("JH-RADAR-KEEP")).toBeInTheDocument();
    expect(await screen.findByText("雷达读取失败，请稍后重试。")).toBeInTheDocument();
    expect(screen.getByText("JH-RADAR-KEEP")).toBeInTheDocument();
  });
});
