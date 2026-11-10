import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CoachDashboardPanels from "../components/coach/CoachDashboardPanels";
import { getSupabase } from "../lib/supabase";

let inventoryReads = 0;

function mockRenewalRadar() {
  (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
    if (name === "get_my_access_profile") return Promise.resolve({ data: [{ role: "coach", can_view_radar: true, can_manage_inventory: true }], error: null });
    if (name === "get_coach_radar_v1") return Promise.resolve({
      data: [
        { camper_code: "JH-GRAD", weight_delta: null, waist_delta: null, bmi: null, alert_level: "red", cycle_state: "cycle_complete_pending_renewal" },
        { camper_code: "JH-RED", weight_delta: null, waist_delta: null, bmi: null, alert_level: "red" },
      ],
      error: null,
    });
    if (name === "get_coach_campers_v1") return Promise.resolve({
      data: [
        { camper_ref: "relation-grad", camper_code: "JH-GRAD", activity_status: "active", followup_status: "pending", followup_note: "", followup_version: 0 },
        { camper_ref: "relation-red", camper_code: "JH-RED", activity_status: "active", followup_status: "pending", followup_note: "", followup_version: 0 },
      ],
      error: null,
    });
    if (name === "get_coach_inventory_v3") {
      const codes = inventoryReads === 0
        ? [{ codeId: "rc-1", code: "JH-RC-CD45", boxSpec: "21_bags", maxCheckins: 21, createdAt: "2026-11-09" }]
        : [];
      inventoryReads += 1;
      return Promise.resolve({
        data: { availableCount: codes.length, restockPoint: 12, needsRestock: false, codes },
        error: null,
      });
    }
    if (name === "get_coach_pending_reviews") return Promise.resolve({ data: [], error: null });
    if (name === "coach_push_code_v1") return Promise.resolve({ data: { ok: true, state: "pending_review" }, error: null });
    return Promise.resolve({ data: [], error: null });
  });
}

describe("TASK-10.13 D3 满期续费引导", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inventoryReads = 0;
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    mockRenewalRadar();
  });

  it("只给服务端满期行添加待续费标签，普通红灯保持原语义", async () => {
    render(<CoachDashboardPanels />);

    const dormant = await screen.findByRole("region", { name: "休眠雷达" });
    const graduate = (await within(dormant).findByText("JH-GRAD")).closest("tr");
    const ordinaryRed = within(dormant).getByText("JH-RED").closest("tr");
    expect(graduate).not.toBeNull();
    expect(ordinaryRed).not.toBeNull();
    expect(within(graduate!).getByText("已满 21 天 · 待续费")).toBeInTheDocument();
    expect(within(graduate!).getByText("红灯")).toHaveClass("status-tag", "status-tag--red");
    expect(within(graduate!).getByText("请线下引导营员本人在用户中心生成见证海报；教练不查看原始健康数据。")).toBeInTheDocument();
    expect(within(ordinaryRed!).getByText("红灯")).toHaveClass("status-tag", "status-tag--red");
    expect(within(ordinaryRed!).queryByText("已满 21 天 · 待续费")).not.toBeInTheDocument();
  });

  it("满期操作滚动到云仓并预选营员，只引导选择 RC 码而不自动直推", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    render(<CoachDashboardPanels />);

    await user.click(await screen.findByRole("button", { name: "云仓直推 RC 充值码 JH-GRAD" }));

    expect(scrollIntoView).toHaveBeenCalled();
    expect(screen.getByLabelText("直推目标 JH-RC-CD45")).toHaveValue("relation-grad");
    expect(screen.getByText("已为 JH-GRAD 预选直推目标，请选择 RC 充值码；提交后仍需 Admin 审核。")).toBeInTheDocument();
    expect(getSupabase().rpc).not.toHaveBeenCalledWith("coach_push_code_v1", expect.anything());
  });

  it("满期预选直推成功并重拉库存后保留成功反馈且清理预选", async () => {
    const user = userEvent.setup();
    render(<CoachDashboardPanels />);

    await user.click(await screen.findByRole("button", { name: "云仓直推 RC 充值码 JH-GRAD" }));
    expect(await screen.findByText("已为 JH-GRAD 预选直推目标，请选择 RC 充值码；提交后仍需 Admin 审核。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "推送激活码 JH-RC-CD45" }));

    expect(await screen.findByText("暂无激活码")).toBeInTheDocument();
    expect(getSupabase().rpc).toHaveBeenCalledWith("coach_push_code_v1", expect.objectContaining({ p_camper_ref: "relation-grad", p_code_id: "rc-1" }));
    expect(screen.getByText("已提交 Admin 审核，库存将在审核通过时扣减")).toBeInTheDocument();
    expect(screen.queryByText("已为 JH-GRAD 预选直推目标，请选择 RC 充值码；提交后仍需 Admin 审核。")).not.toBeInTheDocument();
  });
});
