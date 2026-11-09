import { render, screen, within } from "@testing-library/react";
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
    if (name === "get_my_code_inventory") return Promise.resolve({
      data: { availableCount: 8, restockPoint: 12, needsRestock: true, codes: [] },
      error: null,
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

  it("在 /coach 展示活跃用户、休眠雷达、云仓和季度提醒双栏", async () => {
    render(<MemoryRouter initialEntries={["/coach"]}><App /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "教练经营看板" })).toBeInTheDocument();
    const active = screen.getByRole("region", { name: "名下活跃用户" });
    const dormant = screen.getByRole("region", { name: "休眠雷达" });
    const inventory = await screen.findByRole("region", { name: "教练云仓库存" });
    expect(await within(active).findByText("JH-GREEN")).toBeInTheDocument();
    expect(within(active).queryByText("JH-RED")).not.toBeInTheDocument();
    expect(await within(dormant).findByText("JH-RED")).toBeInTheDocument();
    expect(within(dormant).getByText("JH-YELLOW")).toBeInTheDocument();
    expect(await within(inventory).findByText("可用 8 枚")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "季度推荐提醒" })).toHaveTextContent(/Q\d 服务复盘/);
    expect(screen.queryByRole("button", { name: "批量生成码" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "划拨给教练" })).not.toBeInTheDocument();
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
