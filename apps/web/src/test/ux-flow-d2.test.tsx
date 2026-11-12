import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoxCodeActivation } from "../components/BoxCodeActivation";
import { SevenDayCheckIn } from "../components/SevenDayCheckIn";
import CoachDashboardPanels from "../components/coach/CoachDashboardPanels";
import { getSupabase } from "../lib/supabase";

function mockActivationStatus(state: "none" | "pending_review" | "active" | "rejected") {
  (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
    if (name === "get_my_activation_status") return Promise.resolve({
      data: { state, requested_at: state === "none" ? null : "2026-11-09T01:00:00Z", rejection_hint: state === "rejected" ? "contact_coach" : null },
      error: null,
    });
    if (name === "request_box_code_activation") return Promise.resolve({ data: { ok: true, state: "pending_review" }, error: null });
    return Promise.resolve({ data: null, error: null });
  });
}

function renderActivation() {
  return render(<MemoryRouter initialEntries={["/check-in?code=JH-EL-AB23"]}><BoxCodeActivation /></MemoryRouter>);
}

function mockCoachRpc({ withInventoryCode = false, onPendingRead }: { withInventoryCode?: boolean; onPendingRead?: (count: number) => void } = {}) {
  let pendingReads = 0;
  (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
    if (name === "get_my_access_profile") return Promise.resolve({ data: [{ role: "coach", can_view_radar: true, can_manage_inventory: true }], error: null });
    if (name === "get_coach_radar_v1") return Promise.resolve({
      data: [{ camper_code: "JH-CAMPER", weight_delta: null, waist_delta: null, bmi: null, alert_level: "green" }], error: null,
    });
    if (name === "get_coach_campers_v1") return Promise.resolve({
      data: [{ camper_ref: "relation-1", camper_code: "JH-CAMPER", activity_status: "active", followup_status: "pending", followup_note: "", followup_version: 0 }], error: null,
    });
    if (name === "get_coach_inventory_v3") return Promise.resolve({
      data: {
        availableCount: withInventoryCode ? 1 : 0,
        restockPoint: 12,
        needsRestock: false,
        codes: withInventoryCode ? [{ codeId: "code-1", code: "JH-EL-AB23", boxSpec: "21_bags", maxCheckins: 21, createdAt: "2026-11-08" }] : [],
      },
      error: null,
    });
    if (name === "get_coach_pending_reviews") {
      pendingReads += 1;
      onPendingRead?.(pendingReads);
      return Promise.resolve({
        data: [
          { code_id: "code-1", code: "JH-EL-AB23", camper_code: "JH-CAMPER", requested_at: "2026-11-09T01:00:00Z", entry_path: "manual_code", user_id: "private-uid", health: "secret-health" },
          { code_id: "code-2", code: "JH-RC-CD45", camper_code: "JH-CAMPER-2", requested_at: "2026-11-09T02:00:00Z", entry_path: "coach_push" },
        ].slice(0, pendingReads > 1 ? 2 : 1),
        error: null,
      });
    }
    if (name === "coach_push_code_v1") return Promise.resolve({ data: { ok: true, state: "pending_review" }, error: null });
    return Promise.resolve({ data: [], error: null });
  });
}

describe("TASK-10.13 D2 用户激活状态服务端回读", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { session: { user: { id: "user-1", email: null } } } });
  });

  it("服务端 active 纠正本机审核缓存并同步到跨设备空缓存", async () => {
    window.localStorage.setItem("junheng-box-code-pending-review-v1", "true");
    mockActivationStatus("active");
    renderActivation();

    expect(await screen.findByText("已绑定专属教练")).toBeInTheDocument();
    expect(window.localStorage.getItem("junheng-box-code-activated-v1")).toBe("true");
    expect(window.localStorage.getItem("junheng-box-code-pending-review-v1")).toBeNull();
    expect(getSupabase().rpc).toHaveBeenCalledWith("get_my_activation_status");
  });

  it("服务端 none 清除伪造的本机已激活缓存并恢复申请入口", async () => {
    window.localStorage.setItem("junheng-box-code-activated-v1", "true");
    mockActivationStatus("none");
    renderActivation();

    expect(await screen.findByLabelText("产品激活码")).toBeEnabled();
    expect(screen.queryByText("已绑定专属教练")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("junheng-box-code-activated-v1")).toBeNull();
  });

  it("服务端 pending_review 显示审核中并纠正冲突的已激活缓存", async () => {
    window.localStorage.setItem("junheng-box-code-activated-v1", "true");
    mockActivationStatus("pending_review");
    renderActivation();

    expect(await screen.findByText("审核中，暂不能打卡")).toBeInTheDocument();
    expect(screen.queryByLabelText("产品激活码")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("junheng-box-code-activated-v1")).toBeNull();
    expect(window.localStorage.getItem("junheng-box-code-pending-review-v1")).toBe("true");
  });

  it("服务端 rejected 显示联系教练且允许重新提交申请", async () => {
    const user = userEvent.setup();
    mockActivationStatus("rejected");
    renderActivation();

    expect(await screen.findByText("未通过，请联系教练")).toBeInTheDocument();
    const input = screen.getByLabelText("产品激活码");
    expect(input).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "提交激活审核" }));

    expect(await screen.findByText("审核中，暂不能打卡")).toBeInTheDocument();
    expect(getSupabase().rpc).toHaveBeenCalledWith("request_box_code_activation", expect.objectContaining({ p_code: "JH-EL-AB23" }));
  });

  it("状态 RPC 失败时不凭本机标记伪装已激活", async () => {
    window.localStorage.setItem("junheng-box-code-activated-v1", "true");
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: { message: "offline" } });
    renderActivation();

    expect(await screen.findByRole("alert")).toHaveTextContent("激活状态读取失败，请稍后重试。");
    expect(screen.queryByText("已绑定专属教练")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("产品激活码")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("junheng-box-code-activated-v1")).toBeNull();
  });

  it("打卡页挂载也回读 active 并读取真实剩余额度", async () => {
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "get_my_activation_status") return Promise.resolve({ data: { state: "active", requested_at: "2026-11-09T01:00:00Z", rejection_hint: null }, error: null });
      if (name === "get_checkin_quota") return Promise.resolve({ data: { ok: true, maxCheckins: 21, usedCheckins: 6, remainingCheckins: 15, boxSpec: "21_bags" }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    render(<MemoryRouter><SevenDayCheckIn /></MemoryRouter>);

    expect(await screen.findByText("剩余 15/21 次")).toBeInTheDocument();
    expect(getSupabase().rpc).toHaveBeenCalledWith("get_my_activation_status");
  });
});

describe("TASK-10.13 D2 教练在审激活码", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  });

  it("真实读取在审数量、营员、时间与来源且不显示 UID 或健康数据", async () => {
    mockCoachRpc();
    const { container } = render(<CoachDashboardPanels />);

    const reviews = await screen.findByRole("region", { name: "在审激活码" });
    expect(await within(reviews).findByText("在审 1 枚")).toBeInTheDocument();
    expect(within(reviews).getByText("JH-CAMPER")).toBeInTheDocument();
    expect(within(reviews).getByText("2026-11-09T01:00:00Z")).toBeInTheDocument();
    expect(within(reviews).getByText("手动输码")).toBeInTheDocument();
    expect(container.textContent).not.toContain("private-uid");
    expect(container.textContent).not.toContain("secret-health");
    expect(getSupabase().rpc).toHaveBeenCalledWith("get_coach_pending_reviews");
  });

  it("直推成功后重拉在审列表并覆盖教练直推来源", async () => {
    const user = userEvent.setup();
    let pendingReads = 0;
    mockCoachRpc({ withInventoryCode: true, onPendingRead: (count) => { pendingReads = count; } });
    render(<CoachDashboardPanels />);
    expect(await screen.findByLabelText("直推目标 JH-EL-AB23")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("直推目标 JH-EL-AB23"), "relation-1");
    await user.click(screen.getByRole("button", { name: "推送激活码 JH-EL-AB23" }));

    const reviews = await screen.findByRole("region", { name: "在审激活码" });
    expect(await within(reviews).findByText("在审 2 枚")).toBeInTheDocument();
    expect(within(reviews).getByText("教练直推")).toBeInTheDocument();
    await waitFor(() => expect(pendingReads).toBeGreaterThanOrEqual(2));
  });
});
