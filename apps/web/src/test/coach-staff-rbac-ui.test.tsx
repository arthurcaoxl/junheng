import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { getSupabase } from "../lib/supabase";

const radarRows = [{
  camper_code: "JH-STAFF-RBAC",
  weight_delta: -1,
  waist_delta: -2,
  bmi: 22.5,
  alert_level: "green",
  cycle_state: "in_cycle",
}];

function mockSession() {
  (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { session: { user: { id: "actor-1", email: "actor@example.com" } } },
  });
}

function mockRadarAndInventory() {
  (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
    if (name === "get_coach_radar_v1") return Promise.resolve({ data: radarRows, error: null });
    if (name === "get_coach_campers_v1") return Promise.resolve({
      data: [{
        camper_ref: "relation-1",
        camper_code: "JH-STAFF-RBAC",
        activity_status: "active",
        followup_status: "pending",
        followup_note: "",
        followup_version: 0,
      }],
      error: null,
    });
    if (name === "get_coach_inventory_v3") return Promise.resolve({
      data: { ok: true, availableCount: 0, restockPoint: 12, needsRestock: true, codes: [] },
      error: null,
    });
    return Promise.resolve({ data: [], error: null });
  });
}

function renderCoach() {
  return render(<MemoryRouter initialEntries={["/coach"]}><App /></MemoryRouter>);
}

function expectRestrictedUiAbsent() {
  expect(screen.queryByRole("region", { name: "教练云仓库存" })).not.toBeInTheDocument();
  expect(screen.queryByText("产品激活码库")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /补货|云仓|直推|推送激活码/ })).not.toBeInTheDocument();
  expect(document.querySelector("#coach-cloud-inventory")).toBeNull();
}

describe("/coach Staff 最小权限物理边界", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    mockSession();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("服务端角色尚未返回时不闪现云仓、补货、直推或 Coach 专属文案", async () => {
    let resolveProfile: ((value: { data: unknown[]; error: null }) => void) | undefined;
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "get_my_access_profile") {
        return new Promise((resolve) => { resolveProfile = resolve; });
      }
      if (name === "get_coach_radar_v1") return Promise.resolve({ data: radarRows, error: null });
      return Promise.resolve({ data: [], error: null });
    });
    renderCoach();

    await screen.findByText("名下体验官列表加载中…");
    expectRestrictedUiAbsent();
    expect(screen.queryByText(/云仓库存|申请补货|直推码/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "教练经营看板" })).not.toBeInTheDocument();

    resolveProfile?.({
      data: [{ role: "staff", can_view_radar: true, can_manage_inventory: true }],
      error: null,
    });
    expect(await screen.findByRole("heading", { name: "员工服务看板" })).toBeInTheDocument();
  });

  it("Staff 即使拥有库存能力标记也只挂载雷达且不发库存、补货、直推请求", async () => {
    mockRadarAndInventory();
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "get_my_access_profile") return Promise.resolve({
        data: [{ role: "staff", can_view_radar: true, can_manage_inventory: true }],
        error: null,
      });
      if (name === "get_coach_radar_v1") return Promise.resolve({ data: radarRows, error: null });
      return Promise.resolve({ data: [], error: null });
    });
    renderCoach();

    expect(await screen.findByRole("heading", { name: "员工服务看板" })).toBeInTheDocument();
    const radar = await screen.findByRole("region", { name: "名下体验官列表" });
    expect(await within(radar).findByText("JH-STAFF-RBAC")).toBeInTheDocument();
    expectRestrictedUiAbsent();
    expect(screen.queryByText("新注册用户")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "D1–D21 营期趋势" })).not.toBeInTheDocument();

    const calls = (getSupabase().rpc as ReturnType<typeof vi.fn>).mock.calls.map(([name]) => name);
    expect(calls).toContain("get_my_access_profile");
    expect(calls).toContain("get_coach_radar_v1");
    expect(calls).not.toContain("get_coach_inventory_v3");
    expect(calls).not.toContain("get_my_code_inventory");
    expect(calls).not.toContain("request_coach_restock_v1");
    expect(calls).not.toContain("coach_push_code_v1");
    expect(calls).not.toContain("get_coach_campers_v1");
    expect(calls).not.toContain("get_coach_pending_reviews");
    expect(calls).not.toContain("get_coach_camp_trends_v1");
  });

  it("正常 Coach 仍挂载雷达与本人云仓补货入口", async () => {
    mockRadarAndInventory();
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "get_my_access_profile") return Promise.resolve({
        data: [{ role: "coach", can_view_radar: true, can_manage_inventory: true }],
        error: null,
      });
      if (name === "get_coach_radar_v1") return Promise.resolve({ data: radarRows, error: null });
      if (name === "get_coach_campers_v1") return Promise.resolve({
        data: [{
          camper_ref: "relation-1",
          camper_code: "JH-STAFF-RBAC",
          activity_status: "active",
          followup_status: "pending",
          followup_note: "",
          followup_version: 0,
        }],
        error: null,
      });
      if (name === "get_coach_inventory_v3") return Promise.resolve({
        data: { ok: true, availableCount: 0, restockPoint: 12, needsRestock: true, codes: [] },
        error: null,
      });
      return Promise.resolve({ data: [], error: null });
    });
    renderCoach();

    expect(await screen.findByRole("heading", { name: "教练经营看板" })).toBeInTheDocument();
    expect(await within(await screen.findByRole("region", { name: "名下体验官列表" })).findByText("JH-STAFF-RBAC")).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "教练云仓库存" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "申请补货" })).toBeInTheDocument();
    expect((getSupabase().rpc as ReturnType<typeof vi.fn>).mock.calls.map(([name]) => name)).toContain("get_coach_inventory_v3");
  });
});
