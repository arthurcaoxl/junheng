import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminCheckInPage from "../pages/AdminCheckIn";
import { getSupabase } from "../lib/supabase";

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

type RadarResult = { data: unknown; error: unknown };

function mockRadar(result: RadarResult | (() => Promise<RadarResult>)) {
  const client = getSupabase();
  (client.rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
    if (name === "admin_checkin_overview") return Promise.resolve({ data: [], error: null });
    if (name === "get_coach_radar_v1") {
      return typeof result === "function" ? result() : Promise.resolve(result);
    }
    return Promise.resolve({ data: [], error: null });
  });
  return client;
}

async function renderReadyPage() {
  render(<AdminCheckInPage />);
  await screen.findByText("已备份体验官");
}

function alertRow(camperCode: string, alertLevel: "red" | "yellow" | "green") {
  return {
    camper_code: camperCode,
    weight_delta: null,
    waist_delta: null,
    bmi: null,
    alert_level: alertLevel,
  };
}

describe("教练雷达 UI", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { user: { id: "coach-uid", email: "coach@example.com" } } },
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("red 行映射五个脱敏字段并渲染红灯文本及类名", async () => {
    mockRadar({
      data: [{
        camper_code: "JH-RADAR-RED",
        weight_delta: -2.34,
        waist_delta: -1.25,
        bmi: 23.45,
        alert_level: "red",
      }],
      error: null,
    });
    await renderReadyPage();

    const radar = await screen.findByRole("region", { name: "教练雷达" });
    const row = within(radar).getByText("JH-RADAR-RED").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row!).getByText("-2.3 kg")).toBeInTheDocument();
    expect(within(row!).getByText("-1.3 cm")).toBeInTheDocument();
    expect(within(row!).getByText("23.5")).toBeInTheDocument();
    expect(within(row!).getByText("红灯")).toHaveClass("status-tag", "status-tag--red");
    expect(within(radar).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "体验官", "体重变化", "腰围变化", "BMI", "状态",
    ]);
  });

  it("yellow 行渲染黄灯文本及 status-tag--yellow", async () => {
    mockRadar({ data: [alertRow("JH-YELLOW", "yellow")], error: null });
    await renderReadyPage();

    expect(await screen.findByText("黄灯")).toHaveClass("status-tag", "status-tag--yellow");
  });

  it("green 行渲染绿灯文本及 status-tag--green", async () => {
    mockRadar({ data: [alertRow("JH-GREEN", "green")], error: null });
    await renderReadyPage();

    expect(await screen.findByText("绿灯")).toHaveClass("status-tag", "status-tag--green");
  });

  it("null 指标显示 -- 绝不显示 0 且真实 0 保持为 0", async () => {
    mockRadar({
      data: [
        alertRow("JH-NULL", "red"),
        { ...alertRow("JH-ZERO", "green"), weight_delta: 0 },
      ],
      error: null,
    });
    await renderReadyPage();

    const nullRow = (await screen.findByText("JH-NULL")).closest("tr");
    expect(nullRow).not.toBeNull();
    expect(within(nullRow!).getAllByText("--")).toHaveLength(3);
    expect(nullRow).not.toHaveTextContent("0");

    const zeroRow = screen.getByText("JH-ZERO").closest("tr");
    expect(within(zeroRow!).getByText("0.0 kg")).toBeInTheDocument();
  });

  it("加载期间显示教练雷达加载状态", async () => {
    let resolveRadar!: (result: RadarResult) => void;
    const pending = new Promise<RadarResult>((resolve) => { resolveRadar = resolve; });
    mockRadar(() => pending);
    await renderReadyPage();

    const loading = screen.queryByText("教练雷达加载中…");
    await act(async () => {
      resolveRadar({ data: [], error: null });
      await pending;
    });
    expect(loading).not.toBeNull();
    expect(screen.queryByText("教练雷达加载中…")).not.toBeInTheDocument();
  });

  it("空结果显示暂无可见营员且不伪造权限结论", async () => {
    mockRadar({ data: [], error: null });
    await renderReadyPage();

    expect(await screen.findByText("暂无可见营员")).toBeInTheDocument();
    expect(screen.getByText("如应有可见营员，请联系管理员确认权限")).toBeInTheDocument();
    expect(screen.queryByText("暂无教练雷达查看权限")).not.toBeInTheDocument();
  });

  it("网络错误显示通用读取失败提示", async () => {
    mockRadar({ data: null, error: { code: "PGRST301", message: "network unavailable" } });
    await renderReadyPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("雷达读取失败，请稍后重试。");
  });

  it("权限错误显示权限不足而非空数据", async () => {
    mockRadar({ data: null, error: { code: "42501", message: "permission denied" } });
    await renderReadyPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("暂无教练雷达查看权限");
    expect(screen.queryByText("暂无可见营员")).not.toBeInTheDocument();
  });

  it("以无参数调用 get_coach_radar_v1 且仅映射五个批准字段", async () => {
    const client = mockRadar({ data: [alertRow("JH-MAPPING", "green")], error: null });
    await renderReadyPage();

    const radar = await screen.findByRole("region", { name: "教练雷达" });
    expect(client.rpc).toHaveBeenCalledWith("get_coach_radar_v1");
    expect(within(radar).getAllByRole("columnheader")).toHaveLength(5);
    expect(within(radar).getByText("JH-MAPPING")).toBeInTheDocument();
    expect(within(radar).getAllByText("--")).toHaveLength(3);
  });
});
