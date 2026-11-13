import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import AdminSeedWhitelist from "../components/admin/AdminSeedWhitelist";
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

const missing = {
  ok: true,
  configExists: false,
  emails: [],
  updatedAt: null,
};
const existing = {
  ok: true,
  configExists: true,
  emails: ["member@example.test"],
  updatedAt: "2026-11-13T01:00:00.000000+00:00",
};

type RpcMock = ReturnType<typeof vi.fn>;

function rpcMock(): RpcMock {
  return getSupabase().rpc as RpcMock;
}

function mockWhitelistRpc(initial: unknown = missing) {
  let current = initial;
  rpcMock().mockImplementation((name: string) => {
    if (name === "admin_get_seed_user_whitelist") return Promise.resolve({ data: current, error: null });
    if (name === "admin_checkin_overview") return Promise.resolve({ data: [], error: null });
    return Promise.resolve({ data: [], error: null });
  });
  return {
    setCurrent(value: unknown) { current = value; },
  };
}

describe("Admin 种子用户白名单", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    rpcMock().mockReset();
  });

  it("展示加载与缺失配置空态，新增时规范化邮箱并提交缺失版本", async () => {
    const user = userEvent.setup();
    let current: unknown = missing;
    rpcMock().mockImplementation((name: string, payload?: Record<string, unknown>) => {
      if (name === "admin_get_seed_user_whitelist") return Promise.resolve({ data: current, error: null });
      if (name === "admin_add_seed_user_whitelist_email") {
        expect(payload).toEqual({
          p_email: "new.person@example.test",
          p_expected_config_exists: false,
          p_expected_updated_at: null,
        });
        current = {
          ok: true,
          changed: true,
          reason: null,
          configExists: true,
          emails: ["new.person@example.test"],
          updatedAt: "2026-11-13T01:01:00.000000+00:00",
          auditId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          auditedAt: "2026-11-13T01:01:00.000000+00:00",
        };
        return Promise.resolve({ data: current, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    });
    render(<AdminSeedWhitelist />);

    expect(screen.getByText("白名单加载中…")).toBeInTheDocument();
    expect(await screen.findByText("尚未添加白名单邮箱。")).toBeInTheDocument();
    await user.type(screen.getByLabelText("白名单邮箱"), "  New.Person@Example.TEST  ");
    await user.click(screen.getByRole("button", { name: "添加邮箱" }));

    expect(await screen.findByText("new.person@example.test")).toBeInTheDocument();
    expect(screen.getByText("邮箱已添加到种子用户白名单。")).toBeInTheDocument();
    expect(screen.getByLabelText("白名单邮箱")).toHaveValue("");
  });

  it("重复添加展示服务端 no-op 原因，不伪造新增成功", async () => {
    const user = userEvent.setup();
    mockWhitelistRpc(existing);
    rpcMock().mockImplementation((name: string) => {
      if (name === "admin_get_seed_user_whitelist") return Promise.resolve({ data: existing, error: null });
      if (name === "admin_add_seed_user_whitelist_email") return Promise.resolve({
        data: { ...existing, changed: false, reason: "ALREADY_EXISTS", auditId: null, auditedAt: null },
        error: null,
      });
      return Promise.resolve({ data: [], error: null });
    });
    render(<AdminSeedWhitelist />);

    await user.type(await screen.findByLabelText("白名单邮箱"), "MEMBER@example.test");
    await user.click(screen.getByRole("button", { name: "添加邮箱" }));

    expect(await screen.findByText("该邮箱已在白名单中，无需重复添加。")).toBeInTheDocument();
    expect(screen.queryByText("邮箱已添加到种子用户白名单。")).not.toBeInTheDocument();
    expect(screen.getAllByText("member@example.test")).toHaveLength(1);
  });

  it("写入期间禁用表单并展示 busy，完成后恢复", async () => {
    const user = userEvent.setup();
    let resolveAdd: ((value: unknown) => void) | undefined;
    const current = {
      ok: true,
      changed: true,
      reason: null,
      configExists: true,
      emails: ["busy@example.test"],
      updatedAt: "2026-11-13T01:02:00.000000+00:00",
      auditId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      auditedAt: "2026-11-13T01:02:00.000000+00:00",
    };
    rpcMock().mockImplementation((name: string) => {
      if (name === "admin_get_seed_user_whitelist") return Promise.resolve({
        data: current.emails.length ? current : missing,
        error: null,
      });
      if (name === "admin_add_seed_user_whitelist_email") return new Promise((resolve) => {
        resolveAdd = resolve;
      });
      return Promise.resolve({ data: [], error: null });
    });
    render(<AdminSeedWhitelist />);

    await user.type(await screen.findByLabelText("白名单邮箱"), "busy@example.test");
    await user.click(screen.getByRole("button", { name: "添加邮箱" }));
    expect(screen.getByRole("button", { name: "添加中…" })).toBeDisabled();
    expect(screen.getByLabelText("白名单邮箱")).toBeDisabled();

    resolveAdd?.({ data: current, error: null });
    expect(await screen.findByText("busy@example.test")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加邮箱" })).toBeEnabled();
  });

  it("删除必须先确认，并携带当前 etag；最后一项删除后显示空态", async () => {
    const user = userEvent.setup();
    let current: unknown = existing;
    rpcMock().mockImplementation((name: string, payload?: Record<string, unknown>) => {
      if (name === "admin_get_seed_user_whitelist") return Promise.resolve({ data: current, error: null });
      if (name === "admin_remove_seed_user_whitelist_email") {
        expect(payload).toEqual({
          p_email: "member@example.test",
          p_expected_config_exists: true,
          p_expected_updated_at: existing.updatedAt,
        });
        current = {
          ok: true,
          changed: true,
          reason: null,
          configExists: true,
          emails: [],
          updatedAt: "2026-11-13T01:03:00.000000+00:00",
          auditId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          auditedAt: "2026-11-13T01:03:00.000000+00:00",
        };
        return Promise.resolve({ data: current, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    });
    render(<AdminSeedWhitelist />);

    await user.click(await screen.findByRole("button", { name: "移除 member@example.test" }));
    expect(screen.getByRole("dialog", { name: "确认移除白名单邮箱" })).toBeInTheDocument();
    expect(rpcMock()).not.toHaveBeenCalledWith("admin_remove_seed_user_whitelist_email", expect.anything());
    await user.click(screen.getByRole("button", { name: "确认移除" }));

    expect(await screen.findByText("尚未添加白名单邮箱。")).toBeInTheDocument();
    expect(screen.getByText("邮箱已从种子用户白名单移除。")).toBeInTheDocument();
  });

  it("SQLSTATE 40001 显示精确友好提示，列表保持服务端旧快照", async () => {
    const user = userEvent.setup();
    mockWhitelistRpc(existing);
    rpcMock().mockImplementation((name: string) => {
      if (name === "admin_get_seed_user_whitelist") return Promise.resolve({ data: existing, error: null });
      if (name === "admin_add_seed_user_whitelist_email") return Promise.resolve({
        data: null,
        error: { code: "40001", message: "SEED_USER_WHITELIST_VERSION_CONFLICT" },
      });
      return Promise.resolve({ data: [], error: null });
    });
    render(<AdminSeedWhitelist />);

    await user.type(await screen.findByLabelText("白名单邮箱"), "other@example.test");
    await user.click(screen.getByRole("button", { name: "添加邮箱" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("数据已过期，请刷新重试");
    expect(screen.getByText("member@example.test")).toBeInTheDocument();
    expect(screen.queryByText("other@example.test")).not.toBeInTheDocument();
  });

  it("读取权限错误与非法邮箱均有明确反馈，非法输入不调用写入 RPC", async () => {
    const user = userEvent.setup();
    rpcMock().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "FORBIDDEN" },
    });
    const { unmount } = render(<AdminSeedWhitelist />);
    expect(await screen.findByRole("alert")).toHaveTextContent("当前账号没有白名单管理权限。");
    unmount();

    mockWhitelistRpc(existing);
    render(<AdminSeedWhitelist />);
    await user.type(await screen.findByLabelText("白名单邮箱"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "添加邮箱" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("请输入有效邮箱。");
    expect(rpcMock()).not.toHaveBeenCalledWith("admin_add_seed_user_whitelist_email", expect.anything());
  });

  it("只在生产调度面板挂载白名单管理区", async () => {
    const user = userEvent.setup();
    mockWhitelistRpc(missing);
    (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { user: { id: "admin-1", email: "admin@example.test" } } },
    });
    render(<MemoryRouter initialEntries={["/admin/check-in"]}><App /></MemoryRouter>);

    expect(await screen.findByRole("tab", { name: "生产调度" })).toBeInTheDocument();
    expect(rpcMock()).not.toHaveBeenCalledWith("admin_get_seed_user_whitelist");
    await user.click(screen.getByRole("tab", { name: "生产调度" }));

    expect(await screen.findByRole("heading", { name: "种子用户白名单" })).toBeInTheDocument();
    expect(rpcMock()).toHaveBeenCalledWith("admin_get_seed_user_whitelist");
  });
});
