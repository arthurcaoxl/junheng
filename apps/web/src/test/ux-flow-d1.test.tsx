import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminCodePool from "../components/admin/AdminCodePool";
import CoachCodeInventory from "../components/coach/CoachCodeInventory";
import { getSupabase } from "../lib/supabase";

const firstCode = { codeId: "code-1", code: "JH-EL-AB23", boxSpec: "21_bags", maxCheckins: 21, createdAt: "2026-11-08" };
const secondCode = { codeId: "code-2", code: "JH-RC-CD45", boxSpec: "21_bags", maxCheckins: 21, createdAt: "2026-11-09" };

function inventory(codes = [firstCode]) {
  return { availableCount: codes.length, restockPoint: 12, needsRestock: false, codes };
}

describe("TASK-10.13 D1 云仓与补货刷新", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  });

  it("手动刷新显示加载，失败后保留旧库存并给出中文错误", async () => {
    const user = userEvent.setup();
    let rejectRefresh!: (reason?: unknown) => void;
    const pendingRefresh = new Promise((_, reject) => { rejectRefresh = reject; });
    const rpc = getSupabase().rpc as ReturnType<typeof vi.fn>;
    rpc.mockResolvedValueOnce({ data: inventory(), error: null }).mockReturnValueOnce(pendingRefresh);
    render(<CoachCodeInventory />);
    expect(await screen.findByText("JH-EL-AB23")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "刷新云仓" }));
    expect(screen.getByRole("button", { name: "刷新中…" })).toBeDisabled();
    rejectRefresh(new Error("offline"));

    expect(await screen.findByRole("alert")).toHaveTextContent("产品激活码库操作失败，请稍后重试。");
    expect(screen.getByText("JH-EL-AB23")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新云仓" })).toBeEnabled();
  });

  it("直推成功后清空目标选择并以第二次真实库存响应为准", async () => {
    const user = userEvent.setup();
    let inventoryReads = 0;
    const rpc = getSupabase().rpc as ReturnType<typeof vi.fn>;
    rpc.mockImplementation((name: string) => {
      if (name === "get_coach_inventory_v3") {
        inventoryReads += 1;
        return Promise.resolve({ data: inventoryReads === 1 ? inventory() : inventory([firstCode, secondCode]), error: null });
      }
      if (name === "coach_push_code_v1") return Promise.resolve({ data: { ok: true, state: "pending_review" }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    render(<CoachCodeInventory campers={[{ camperRef: "relation-1", camperCode: "JH-CAMPER", activityStatus: "active", followupStatus: "pending", followupNote: "", followupVersion: 0 }]} />);
    expect(await screen.findByText("JH-EL-AB23")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("直推目标 JH-EL-AB23"), "relation-1");
    await user.click(screen.getByRole("button", { name: "推送激活码 JH-EL-AB23" }));

    expect(await screen.findByText("JH-RC-CD45")).toBeInTheDocument();
    await waitFor(() => expect(rpc.mock.calls.filter(([name]) => name === "get_coach_inventory_v3")).toHaveLength(2));
    expect(screen.getByLabelText("直推目标 JH-EL-AB23")).toHaveValue("");
  });

  it("Admin 处理补货需求后重拉服务端列表而不是仅本地改状态", async () => {
    const user = userEvent.setup();
    let requestReads = 0;
    const rpc = getSupabase().rpc as ReturnType<typeof vi.fn>;
    rpc.mockImplementation((name: string) => {
      if (name === "admin_get_coach_restock_requests_v1") {
        requestReads += 1;
        return Promise.resolve({
          data: [{ request_id: "request-1", coach_id: "coach-id", note: "需要补货", status: requestReads === 1 ? "pending" : "fulfilled", created_at: "2026-11-09T01:00:00Z" }],
          error: null,
        });
      }
      if (name === "admin_resolve_coach_restock_request_v1") return Promise.resolve({ data: { ok: true, status: "fulfilled" }, error: null });
      return Promise.resolve({ data: [], error: null });
    });
    render(<AdminCodePool />);
    await user.click(await screen.findByRole("button", { name: "确认已补货" }));

    expect(await screen.findByText(/fulfilled/)).toBeInTheDocument();
    expect(requestReads).toBe(2);
  });

  it("划拨成功提示教练端刷新后可见", async () => {
    const user = userEvent.setup();
    const rpc = getSupabase().rpc as ReturnType<typeof vi.fn>;
    rpc.mockImplementation((name: string) => {
      if (name === "admin_get_coach_directory") return Promise.resolve({
        data: [{ coach_id: "coach-id", email: "coach@example.com", name: "教练", phone: null }], error: null,
      });
      if (name === "allocate_codes_to_coach") return Promise.resolve({ data: { allocatedCount: 2 }, error: null });
      return Promise.resolve({ data: [], error: null });
    });
    render(<AdminCodePool />);

    await user.type(screen.getByLabelText("划拨教练邮箱"), "co");
    await user.click(await screen.findByRole("option", { name: /coach@example\.com/ }));
    await user.type(screen.getByLabelText("划拨数量"), "2");
    await user.click(screen.getByRole("button", { name: "划拨给教练" }));

    expect(await screen.findByText("已向教练划拨 2 枚码，教练端刷新后可见。")).toBeInTheDocument();
  });
});
