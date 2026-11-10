import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { getSupabase } from "../lib/supabase";

function mockCoachSession() {
  (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { session: { user: { id: "coach-1", email: "coach@example.com" } } },
  });
  (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
    if (name === "get_my_access_profile") return Promise.resolve({
      data: [{ role: "coach", can_view_radar: true, can_manage_inventory: true }], error: null,
    });
    if (name === "get_coach_radar_v1") return Promise.resolve({
      data: [
        { camper_code: "JH-GREEN", weight_delta: -1.2, waist_delta: -2, bmi: 22.1, alert_level: "green" },
        { camper_code: "JH-RED", weight_delta: null, waist_delta: null, bmi: null, alert_level: "red" },
        { camper_code: "JH-YELLOW", weight_delta: 0.2, waist_delta: 0, bmi: 24, alert_level: "yellow" },
      ],
      error: null,
    });
    if (name === "get_coach_campers_v1") return Promise.resolve({
      data: [
        { camper_ref: "relation-green", camper_code: "JH-GREEN", activity_status: "active", followup_status: "pending", followup_note: "", followup_version: 0 },
        { camper_ref: "relation-red", camper_code: "JH-RED", activity_status: "active", followup_status: "pending", followup_note: "", followup_version: 0 },
        { camper_ref: "relation-yellow", camper_code: "JH-YELLOW", activity_status: "active", followup_status: "pending", followup_note: "", followup_version: 0 },
      ],
      error: null,
    });
    if (name === "get_coach_inventory_v3") return Promise.resolve({
      data: {
        availableCount: 2,
        restockPoint: 12,
        needsRestock: true,
        codes: [
          { codeId: "code-green", code: "JH-EL-GREEN", boxSpec: "21_bags", maxCheckins: 21, createdAt: "2026-11-09" },
          { codeId: "code-red", code: "JH-RC-RED", boxSpec: "30_bags", maxCheckins: 30, createdAt: "2026-11-09" },
        ],
      },
      error: null,
    });
    if (name === "coach_push_code_v1") return Promise.resolve({
      data: { ok: true, state: "pending_review", activationId: "activation-1" }, error: null,
    });
    if (name === "admin_checkin_overview") return Promise.resolve({
      data: null,
      error: { code: "P0001", message: "不是管理员" },
    });
    return Promise.resolve({ data: [], error: null });
  });
}

describe("独立教练经营看板", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    mockCoachSession();
  });

  it("在 /coach 真实挂载完整名下列表、分类雷达和逐码推送交互", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/coach"]}><App /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "教练经营看板" })).toBeInTheDocument();
    const allCampers = await screen.findByRole("region", { name: "名下体验官列表" });
    expect(within(allCampers).getByText("JH-GREEN")).toBeInTheDocument();
    expect(within(allCampers).getByText("JH-RED")).toBeInTheDocument();
    expect(within(allCampers).getByText("JH-YELLOW")).toBeInTheDocument();
    const active = screen.getByRole("region", { name: "名下活跃用户" });
    const dormant = screen.getByRole("region", { name: "休眠雷达" });
    const inventory = await screen.findByRole("region", { name: "教练云仓库存" });
    expect(await within(active).findByText("JH-GREEN")).toBeInTheDocument();
    expect(within(active).queryByText("JH-RED")).not.toBeInTheDocument();
    expect(await within(dormant).findByText("JH-RED")).toBeInTheDocument();
    expect(within(dormant).getByText("JH-YELLOW")).toBeInTheDocument();
    expect(await within(inventory).findByText("可用 2 枚")).toBeInTheDocument();
    expect(within(inventory).getByRole("button", { name: "推送激活码 JH-EL-GREEN" })).toBeInTheDocument();
    expect(within(inventory).getByRole("button", { name: "推送激活码 JH-RC-RED" })).toBeInTheDocument();
    await user.selectOptions(within(inventory).getByLabelText("直推目标 JH-EL-GREEN"), "relation-green");
    await user.click(within(inventory).getByRole("button", { name: "推送激活码 JH-EL-GREEN" }));
    expect(getSupabase().rpc).toHaveBeenCalledWith("coach_push_code_v1", expect.objectContaining({
      p_camper_ref: "relation-green",
      p_code_id: "code-green",
    }));
    expect(await screen.findByRole("region", { name: "D1–D21 营期趋势" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "季度推荐提醒" })).toHaveTextContent(/Q\d 服务复盘/);
    expect(screen.queryByRole("button", { name: "批量生成码" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "划拨给教练" })).not.toBeInTheDocument();
  });

  it("准教练可读取本人趋势且不误报无角色、不展示全栈或库存", async () => {
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "get_my_access_profile") return Promise.resolve({ data: [], error: null });
      if (name === "get_my_coach_promotion") return Promise.resolve({ data: { ok: true, state: "probational_coach", version: 1 }, error: null });
      if (name === "get_coach_camp_trends_v1") return Promise.resolve({
        data: Array.from({ length: 21 }, (_, index) => ({
          day_index: index + 1,
          participants: 0,
          weight_samples: 0,
          waist_samples: 0,
          avg_weight_change_percent: null,
          avg_waist_change_percent: null,
          meal_completion_rate: null,
          water_rate: null,
          movement_rate: null,
          sleep_rate: null,
        })),
        error: null,
      });
      return Promise.resolve({ data: [], error: null });
    });
    render(<MemoryRouter initialEntries={["/coach"]}><App /></MemoryRouter>);

    expect(await screen.findByRole("region", { name: "D1–D21 营期趋势" })).toBeInTheDocument();
    expect(await screen.findByRole("table", { name: "D1 至 D21 聚合趋势数据" })).toBeInTheDocument();
    expect(screen.queryByText("当前账号没有有效业务角色。")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "全栈" })).not.toBeInTheDocument();
    expect(getSupabase().rpc).toHaveBeenCalledWith("get_coach_camp_trends_v1", { p_scope: "own" });
    expect(getSupabase().rpc).not.toHaveBeenCalledWith("get_coach_inventory_v3");
  });

  it("静态深链 /coach/index.html 不回退到首页或 Admin", async () => {
    render(<MemoryRouter initialEntries={["/coach/index.html"]}><App /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "教练经营看板" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "打卡统计管理" })).not.toBeInTheDocument();
  });

  it("教练会话被 Admin RPC 拒绝时停留在管理员登录边界外", async () => {
    render(<MemoryRouter initialEntries={["/admin/check-in"]}><App /></MemoryRouter>);

    expect(await screen.findByRole("button", { name: "获取管理员验证码" })).toBeInTheDocument();
    expect(getSupabase().rpc).toHaveBeenCalledWith("admin_checkin_overview");
    expect(screen.queryByRole("button", { name: "导出脱敏 CSV" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "批量生成码" })).not.toBeInTheDocument();
  });
});
