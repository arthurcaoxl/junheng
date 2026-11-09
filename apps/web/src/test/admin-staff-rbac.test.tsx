import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { getSupabase } from "../lib/supabase";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: () => null,
  BarChart: () => null,
  Line: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

const staffRow = {
  staff_id: "22222222-2222-4222-8222-222222222222",
  email: "staff@example.com",
  is_active: true,
  version: 3,
  coach_count: 6,
  camper_count: 151,
  assignments: [{
    assignmentId: "33333333-3333-4333-8333-333333333333",
    coachId: "11111111-1111-4111-8111-111111111111",
    coachEmail: "coach@example.com",
    version: 1,
  }],
};

function mockAdminSession() {
  (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { session: { user: { id: "admin-1", email: "admin@example.com" } } },
  });
  (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
    if (name === "admin_get_staff_directory") return Promise.resolve({ data: [staffRow], error: null });
    if (name === "admin_revoke_staff_coach") return Promise.resolve({
      data: { ok: true, assignmentId: staffRow.assignments[0].assignmentId, revoked: true }, error: null,
    });
    if (name === "admin_set_staff_role") return Promise.resolve({
      data: { ok: true, staffId: staffRow.staff_id, email: staffRow.email, isActive: true, version: 1 }, error: null,
    });
    if (name === "admin_assign_staff_coach") return Promise.resolve({
      data: {
        ok: true,
        assignmentId: "44444444-4444-4444-8444-444444444444",
        staffVersion: 3,
        coachCount: 7,
        camperCount: 151,
        warnings: [{ code: "STAFF_CAPACITY_WARNING", type: "coach_count", count: 7, threshold: 5 }],
      },
      error: null,
    });
    if (name === "admin_get_coach_directory") return Promise.resolve({
      data: [{
        coach_id: "11111111-1111-4111-8111-111111111111",
        email: "coach@example.com",
        name: "教练甲",
        phone: "13800000000",
      }],
      error: null,
    });
    return Promise.resolve({ data: [], error: null });
  });
}

async function renderAdminStaff() {
  render(<MemoryRouter initialEntries={["/admin/check-in"]}><App /></MemoryRouter>);
  await userEvent.click(await screen.findByRole("tab", { name: "员工管理区" }));
}

describe("Admin 员工 RBAC 管理区", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    mockAdminSession();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("独立 Tab 只显示员工目录、有效分配和非阻断容量警告", async () => {
    await renderAdminStaff();

    const panel = screen.getByRole("tabpanel", { name: "员工管理区" });
    expect(await within(panel).findByText("staff@example.com")).toBeInTheDocument();
    expect(within(panel).getByText("coach@example.com")).toBeInTheDocument();
    expect(within(panel).getAllByText(/STAFF_CAPACITY_WARNING/)).toHaveLength(2);
    expect(within(panel).getAllByText(/6 名教练/).length).toBeGreaterThan(0);
    expect(within(panel).getAllByText(/151 名体验官/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "批量生成码" })).not.toBeInTheDocument();
    expect(screen.queryByText("JH-ADMIN1")).not.toBeInTheDocument();
  });

  it("撤销分配提交 assignmentId、expectedVersion 和幂等键，服务端返回后刷新", async () => {
    const user = userEvent.setup();
    await renderAdminStaff();

    await user.click(await screen.findByRole("button", { name: "撤销 coach@example.com 的分配" }));
    expect(getSupabase().rpc).toHaveBeenCalledWith("admin_revoke_staff_coach", {
      p_assignment_id: staffRow.assignments[0].assignmentId,
      p_expected_version: 1,
      p_idempotency_key: expect.any(String),
    });
    expect(await screen.findByText("已撤销员工与教练的分配。")).toBeInTheDocument();
  });

  it("新增员工只提交邮箱、启用状态、初始版本和幂等键", async () => {
    const user = userEvent.setup();
    await renderAdminStaff();

    await user.type(screen.getByLabelText("新员工邮箱"), "new-staff@example.com");
    await user.click(screen.getByRole("button", { name: "添加员工" }));
    expect(getSupabase().rpc).toHaveBeenCalledWith("admin_set_staff_role", {
      p_email: "new-staff@example.com",
      p_is_active: true,
      p_expected_version: 0,
      p_idempotency_key: expect.any(String),
    });
  });

  it("分配教练后展示服务端软容量警告而不把第 6 名教练当作失败", async () => {
    const user = userEvent.setup();
    await renderAdminStaff();

    await user.type(screen.getByLabelText("为 staff@example.com 分配教练"), "coach");
    await user.click(await screen.findByRole("option", { name: /coach@example\.com.*教练甲.*13800000000/ }));
    await user.click(screen.getByRole("button", { name: "确认分配教练" }));
    expect(getSupabase().rpc).toHaveBeenCalledWith("admin_assign_staff_coach", {
      p_staff_id: staffRow.staff_id,
      p_coach_id: staffRow.assignments[0].coachId,
      p_expected_version: 3,
      p_idempotency_key: expect.any(String),
    });
    expect(await screen.findByText(/分配成功，但教练数达到 7 名/)).toBeInTheDocument();
  });
});

describe("staff 界面最小权限", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { user: { id: "staff-1", email: "staff@example.com" } } },
    });
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "get_my_access_profile") return Promise.resolve({
        data: [{ role: "staff", can_view_radar: true, can_manage_inventory: false }], error: null,
      });
      if (name === "get_coach_radar_v1") return Promise.resolve({
        data: [{ camper_code: "JH-STAFF", weight_delta: null, waist_delta: null, bmi: null, alert_level: "red" }],
        error: null,
      });
      return Promise.resolve({ data: [], error: null });
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("staff 只看脱敏服务雷达，不渲染也不调用教练云仓", async () => {
    render(<MemoryRouter initialEntries={["/coach"]}><App /></MemoryRouter>);

    expect(await screen.findByText("JH-STAFF")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "员工服务看板" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "教练云仓库存" })).not.toBeInTheDocument();
    expect(getSupabase().rpc).not.toHaveBeenCalledWith("get_my_code_inventory");
    expect(getSupabase().rpc).toHaveBeenCalledWith("get_my_access_profile");
    expect(getSupabase().rpc).toHaveBeenCalledWith("get_coach_radar_v1");
  });
});
