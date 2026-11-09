import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CoachCampTrends from "../components/coach/CoachCampTrends";
import { getSupabase } from "../lib/supabase";
import type { CoachCampTrendRow } from "../services/coachCampTrends";

function makeRows(overrides: Record<number, Partial<CoachCampTrendRow>> = {}): CoachCampTrendRow[] {
  return Array.from({ length: 21 }, (_, index) => {
    const dayIndex = index + 1;
    return {
      day_index: dayIndex,
      participants: 0,
      weight_samples: 0,
      waist_samples: 0,
      avg_weight_change_percent: null,
      avg_waist_change_percent: null,
      meal_completion_rate: null,
      water_rate: null,
      movement_rate: null,
      sleep_rate: null,
      ...overrides[dayIndex],
    };
  });
}

function mockPromotion(state = "coach") {
  return { data: { ok: true, state, version: 1 }, error: null };
}

function mockRpc({
  promotion = mockPromotion(),
  trends = { own: { data: makeRows(), error: null }, all: { data: makeRows(), error: null } },
}: {
  promotion?: { data: unknown; error: unknown };
  trends?: Record<string, { data: unknown; error: unknown }>;
} = {}) {
  (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string, params?: { p_scope?: string }) => {
    if (name === "get_my_coach_promotion") return Promise.resolve(promotion);
    if (name === "get_coach_camp_trends_v1") {
      return Promise.resolve(trends[params?.p_scope ?? ""] ?? { data: null, error: { message: "UNEXPECTED_SCOPE" } });
    }
    return Promise.resolve({ data: null, error: { message: "UNEXPECTED_RPC" } });
  });
}

function dayRow(table: HTMLElement, day: number): HTMLElement {
  const cell = within(table).getByText(`D${day}`);
  const row = cell.closest("tr");
  if (!row) throw new Error(`Missing D${day} row`);
  return row;
}

describe("教练 D1-D21 真实聚合趋势", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  });

  it("以 own 参数调用 RPC，严格映射 21 日、0 样本和 null 聚合值", async () => {
    const rows = makeRows({
      1: {
        participants: 2,
        weight_samples: 0,
        waist_samples: 1,
        avg_weight_change_percent: null,
        avg_waist_change_percent: -2.5,
        meal_completion_rate: 66.7,
        water_rate: 50,
        movement_rate: 0,
        sleep_rate: 100,
      },
    });
    mockRpc({ trends: { own: { data: rows.map((row, index) => index === 0 ? { ...row, user_id: "private-uid", email: "private@example.com", records: {} } : row), error: null } } });
    render(<CoachCampTrends accessRole="coach" />);

    const table = await screen.findByRole("table", { name: "D1 至 D21 聚合趋势数据" });
    const bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(21);
    expect(bodyRows.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual(Array.from({ length: 21 }, (_, index) => `D${index + 1}`));
    expect(within(dayRow(table, 1)).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "D1", "2", "0", "1", "—", "-2.5%", "66.7%", "50.0%", "0.0%", "100.0%",
    ]);
    expect(within(dayRow(table, 21)).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "D21", "0", "0", "0", "—", "—", "—", "—", "—", "—",
    ]);
    expect(getSupabase().rpc).toHaveBeenCalledWith("get_my_coach_promotion");
    expect(getSupabase().rpc).toHaveBeenCalledWith("get_coach_camp_trends_v1", { p_scope: "own" });
    expect(screen.queryByText("private-uid")).not.toBeInTheDocument();
    expect(screen.queryByText("private@example.com")).not.toBeInTheDocument();
  });

  it("切换全栈后重新请求并渲染 all 的真实返回", async () => {
    const user = userEvent.setup();
    mockRpc({
      trends: {
        own: { data: makeRows({ 1: { participants: 1, weight_samples: 1, avg_weight_change_percent: -1 } }), error: null },
        all: { data: makeRows({ 1: { participants: 8, weight_samples: 8, avg_weight_change_percent: -9.9 } }), error: null },
      },
    });
    render(<CoachCampTrends accessRole="coach" />);
    await screen.findByText("-1.0%");

    await user.click(await screen.findByRole("button", { name: "全栈" }));

    expect(await screen.findByText("-9.9%")).toBeInTheDocument();
    expect(screen.queryByText("-1.0%")).not.toBeInTheDocument();
    expect(getSupabase().rpc).toHaveBeenCalledWith("get_coach_camp_trends_v1", { p_scope: "all" });
    expect(screen.getByRole("button", { name: "全栈" })).toHaveAttribute("aria-pressed", "true");
  });

  it("准教练即使角色档案为 coach 也隐藏全栈并强制 own", async () => {
    mockRpc({ promotion: mockPromotion("probational_coach") });
    render(<CoachCampTrends accessRole="coach" />);

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "全栈" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "本人名下" })).toHaveAttribute("aria-pressed", "true");
    expect(getSupabase().rpc).not.toHaveBeenCalledWith("get_coach_camp_trends_v1", { p_scope: "all" });
  });

  it.each([
    { role: "coach" as const, state: "coach" },
    { role: "admin" as const, state: "camper" },
  ])("$role 保留全栈切换", async ({ role, state }) => {
    mockRpc({ promotion: mockPromotion(state) });
    render(<CoachCampTrends accessRole={role} />);

    expect(await screen.findByRole("button", { name: "全栈" })).toBeInTheDocument();
  });

  it("晋升状态查询失败时保守隐藏全栈并继续请求 own", async () => {
    mockRpc({ promotion: { data: null, error: { message: "NETWORK_ERROR" } } });
    render(<CoachCampTrends accessRole="coach" />);

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "全栈" })).not.toBeInTheDocument();
    expect(getSupabase().rpc).toHaveBeenCalledWith("get_coach_camp_trends_v1", { p_scope: "own" });
    expect(getSupabase().rpc).not.toHaveBeenCalledWith("get_coach_camp_trends_v1", { p_scope: "all" });
  });

  it("趋势请求期间显示加载状态", () => {
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "get_my_coach_promotion") return Promise.resolve(mockPromotion());
      return new Promise(() => {});
    });
    render(<CoachCampTrends accessRole="coach" />);

    expect(screen.getByRole("status")).toHaveTextContent("趋势加载中");
  });

  it("趋势 RPC 失败显示错误而不渲染伪造数据", async () => {
    mockRpc({ trends: { own: { data: null, error: { message: "FORBIDDEN" } } } });
    render(<CoachCampTrends accessRole="coach" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("趋势读取失败，请稍后重试。");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("21 行全空样本显示正常空态并保留 D1-D21 对齐", async () => {
    mockRpc();
    render(<CoachCampTrends accessRole="coach" />);

    expect(await screen.findByText("暂无趋势数据")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("D1")).toBeInTheDocument();
    expect(screen.getByText("D21")).toBeInTheDocument();
  });
});
