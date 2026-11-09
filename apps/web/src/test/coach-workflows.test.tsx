import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CoachDashboardPanels from "../components/coach/CoachDashboardPanels";
import CoachCodeInventory from "../components/coach/CoachCodeInventory";
import AdminCodePool from "../components/admin/AdminCodePool";
import CamperDrawer from "../components/admin/CamperDrawer";
import { getSupabase } from "../lib/supabase";
import { fetchCoachCampers } from "../services/coachRadar";
import type { AdminCamper } from "../services/adminCheckin";

const radarRows = [
  { camper_code: "JH-NEW", weight_delta: null, waist_delta: null, bmi: null, alert_level: "red" },
  { camper_code: "JH-ACTIVE", weight_delta: -1.2, waist_delta: -2, bmi: 22.1, alert_level: "green" },
  { camper_code: "JH-DORMANT", weight_delta: 0.2, waist_delta: 0, bmi: 24, alert_level: "yellow" },
];

const camperRows = [
  { camper_ref: "relation-new", camper_code: "JH-NEW", activity_status: "new_registered", followup_status: "pending", followup_note: "", followup_version: 0 },
  { camper_ref: "relation-active", camper_code: "JH-ACTIVE", activity_status: "active", followup_status: "contacted", followup_note: "已鼓励", followup_version: 2 },
  { camper_ref: "relation-dormant", camper_code: "JH-DORMANT", activity_status: "active", followup_status: "waiting_reply", followup_note: "等待回复", followup_version: 1 },
];

function mockRpc(overrides: Record<string, { data: unknown; error: unknown }> = {}) {
  (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
    if (name in overrides) return Promise.resolve(overrides[name]);
    if (name === "get_my_access_profile") return Promise.resolve({
      data: [{ role: "coach", can_view_radar: true, can_manage_inventory: true }], error: null,
    });
    if (name === "get_coach_radar_v1") return Promise.resolve({ data: radarRows, error: null });
    if (name === "get_coach_campers_v1") return Promise.resolve({ data: camperRows, error: null });
    if (name === "get_my_code_inventory") return Promise.resolve({ data: { availableCount: 0, restockPoint: 12, needsRestock: true, codes: [] }, error: null });
    if (name === "admin_get_coach_restock_requests_v1") return Promise.resolve({ data: [], error: null });
    return Promise.resolve({ data: null, error: null });
  });
}

const camper: AdminCamper = {
  authUserId: "private-camper-uid",
  email: "camper@example.com",
  userCode: "JH-ADMIN1",
  startDate: "2026-10-01",
  updatedAt: "2026-10-30T10:00:00.000Z",
  records: {},
  recordedDays: 0,
};

describe("教练营员口径与跟进备注", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  });

  it("列表 RPC 不接受范围参数，并只映射服务端返回的本人营员与活跃口径", async () => {
    mockRpc();
    const result = await fetchCoachCampers();
    expect(result).toHaveLength(3);
    expect(result.slice(0, 2)).toMatchObject([
      { camperRef: "relation-new", activityStatus: "new_registered", followupVersion: 0 },
      { camperRef: "relation-active", activityStatus: "active", followupNote: "已鼓励" },
    ]);
    expect(getSupabase().rpc).toHaveBeenCalledWith("get_coach_campers_v1");
  });

  it("新注册、活跃和休眠分开展示，红灯新用户不再被叫作休眠或活跃", async () => {
    mockRpc();
    render(<CoachDashboardPanels />);

    const registered = await screen.findByRole("region", { name: "新注册用户" });
    const active = screen.getByRole("region", { name: "名下活跃用户" });
    const dormant = screen.getByRole("region", { name: "休眠雷达" });
    expect(within(registered).getByText("JH-NEW")).toBeInTheDocument();
    expect(within(active).getByText("JH-ACTIVE")).toBeInTheDocument();
    expect(within(dormant).getByText("JH-DORMANT")).toBeInTheDocument();
    expect(within(dormant).queryByText("JH-NEW")).not.toBeInTheDocument();
    expect(registered).toHaveTextContent("当前 21 天窗口内尚无有效打卡");
    expect(active).toHaveTextContent("1 人 · 窗口内有有效打卡且当前绿灯");
  });

  it("教练保存备注只提交当前 camper_ref、状态、备注和乐观版本", async () => {
    const user = userEvent.setup();
    mockRpc({
      set_coach_camper_followup_v1: { data: { ok: true, followupStatus: "contacted", note: "已电话跟进", version: 3 }, error: null },
    });
    render(<CoachDashboardPanels />);
    const active = await screen.findByRole("region", { name: "名下活跃用户" });

    await user.selectOptions(within(active).getByLabelText("跟进状态 JH-ACTIVE"), "waiting_reply");
    const note = within(active).getByLabelText("跟进备注 JH-ACTIVE");
    await user.clear(note);
    await user.type(note, "已电话跟进");
    await user.click(within(active).getByRole("button", { name: "保存 JH-ACTIVE 跟进" }));

    expect(getSupabase().rpc).toHaveBeenCalledWith("set_coach_camper_followup_v1", {
      p_camper_ref: "relation-active",
      p_followup_status: "waiting_reply",
      p_note: "已电话跟进",
      p_expected_version: 2,
    });
    expect(await within(active).findByText("跟进已保存")).toBeInTheDocument();
  });

  it("真实营员为空时展示明确隔离的虚构 Demo，不计数也不发写请求", async () => {
    mockRpc({
      get_coach_radar_v1: { data: [], error: null },
      get_coach_campers_v1: { data: [], error: null },
    });
    render(<CoachDashboardPanels />);

    const demo = await screen.findByRole("region", { name: "演示数据，非真实统计" });
    expect(demo).toHaveTextContent("DEMO-NEW");
    expect(demo).toHaveTextContent("DEMO-ACTIVE");
    expect(demo).toHaveTextContent("虚构库存");
    expect(screen.getByRole("region", { name: "新注册用户" })).toHaveTextContent("0 人");
    expect(screen.getByRole("region", { name: "名下活跃用户" })).toHaveTextContent("0 人");
    expect(getSupabase().rpc).not.toHaveBeenCalledWith("set_coach_camper_followup_v1", expect.anything());
    expect(demo.querySelector("button")).toBeNull();
  });
});

describe("教练无码补货与直推码", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  });

  it("无码时把补货需求提交到受控 RPC", async () => {
    const user = userEvent.setup();
    mockRpc({ request_coach_restock_v1: { data: { ok: true, status: "pending" }, error: null } });
    render(<CoachCodeInventory />);
    await screen.findByText("暂无未激活码。");

    await user.type(screen.getByLabelText("补货需求说明"), "本周无码，申请补货");
    await user.click(screen.getByRole("button", { name: "申请补货" }));
    expect(getSupabase().rpc).toHaveBeenCalledWith("request_coach_restock_v1", { p_note: "本周无码，申请补货" });
    expect(await screen.findByText("补货申请已提交，等待 Admin 处理")).toBeInTheDocument();
  });

  it("直推只提交本人营员 relation_ref、库存 code_id 和幂等键，不提交码面或 coach_id", async () => {
    const user = userEvent.setup();
    mockRpc({
      get_my_code_inventory: {
        data: { availableCount: 1, restockPoint: 12, needsRestock: true, codes: [{ codeId: "code-1", code: "JH-EL-AB23", boxSpec: "21_bags", maxCheckins: 21, createdAt: "2026-11-08" }] },
        error: null,
      },
      coach_push_code_v1: { data: { ok: true, state: "pending_review", activationId: "activation-1" }, error: null },
    });
    render(<CoachCodeInventory campers={[{ camperRef: "relation-new", camperCode: "JH-NEW", activityStatus: "new_registered", followupStatus: "pending", followupNote: "", followupVersion: 0 }]} />);
    await screen.findByText("JH-EL-AB23");

    await user.selectOptions(screen.getByLabelText("直推目标 JH-EL-AB23"), "relation-new");
    await user.click(screen.getByRole("button", { name: "直推 JH-EL-AB23" }));
    const call = vi.mocked(getSupabase().rpc).mock.calls.find(([name]) => name === "coach_push_code_v1");
    expect(call?.[1]).toMatchObject({ p_camper_ref: "relation-new", p_code_id: "code-1" });
    expect(call?.[1]).toHaveProperty("p_idempotency_key");
    expect(JSON.stringify(call?.[1])).not.toContain("JH-EL-AB23");
    expect(JSON.stringify(call?.[1])).not.toContain("coach_id");
    expect(await screen.findByText("已提交 Admin 审核，库存将在审核通过时扣减")).toBeInTheDocument();
  });

  it("Admin 能读取补货需求并显式关闭，且 fulfilled 与 rejected 走同一受控接口", async () => {
    const user = userEvent.setup();
    mockRpc({
      admin_get_coach_restock_requests_v1: {
        data: [{ request_id: "request-1", coach_id: "coach-opaque-id", note: "需要补货", status: "pending", created_at: "2026-11-09T01:00:00Z" }], error: null,
      },
      admin_resolve_coach_restock_request_v1: { data: { ok: true, status: "fulfilled" }, error: null },
    });
    render(<AdminCodePool />);
    const requests = await screen.findByRole("region", { name: "教练补货需求" });
    expect(within(requests).getByText("需要补货")).toBeInTheDocument();
    await user.click(within(requests).getByRole("button", { name: "确认已补货" }));
    expect(getSupabase().rpc).toHaveBeenCalledWith("admin_resolve_coach_restock_request_v1", { p_request_id: "request-1", p_decision: "fulfilled" });
  });
});

describe("Admin 体验官跟进", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  });

  it("Admin 读取并保存同一营员备注，UID 只作为 RPC 参数而不展示", async () => {
    const user = userEvent.setup();
    mockRpc({
      admin_get_camper_followup_v1: { data: { followupStatus: "pending", note: "", version: 0 }, error: null },
      admin_set_camper_followup_v1: { data: { ok: true, followupStatus: "resolved", note: "问题已解决", version: 1 }, error: null },
    });
    render(<CamperDrawer camper={camper} onClose={() => {}} />);
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Admin 跟进状态"), "resolved");
    await user.type(within(dialog).getByLabelText("Admin 跟进备注"), "问题已解决");
    await user.click(within(dialog).getByRole("button", { name: "保存 Admin 跟进" }));

    expect(getSupabase().rpc).toHaveBeenCalledWith("admin_set_camper_followup_v1", {
      p_camper_id: "private-camper-uid",
      p_followup_status: "resolved",
      p_note: "问题已解决",
      p_expected_version: 0,
    });
    expect(dialog).not.toHaveTextContent("private-camper-uid");
  });

  it("未绑定教练时显示不可编辑空态，不渲染表单或红字权限错误", async () => {
    mockRpc({
      admin_get_camper_followup_v1: { data: null, error: { code: "42501", message: "FORBIDDEN" } },
    });
    render(<CamperDrawer camper={camper} onClose={() => {}} />);

    expect(await screen.findByText("暂未绑定教练，分配后可跟进")).toBeInTheDocument();
    expect(screen.queryByLabelText("Admin 跟进状态")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Admin 跟进备注")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存 Admin 跟进" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(getSupabase().rpc).not.toHaveBeenCalledWith("admin_set_camper_followup_v1", expect.anything());
  });
});
