import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CoachCodeInventory from "../components/coach/CoachCodeInventory";
import { getSupabase } from "../lib/supabase";

const emptyInventory = {
  availableCount: 0,
  restockPoint: 12,
  needsRestock: true,
  codes: [],
};

describe("教练产品激活码库", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  });

  it("通过真实服务调用库存 RPC 并渲染返回码面", async () => {
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        availableCount: 1,
        restockPoint: 12,
        needsRestock: false,
        codes: [{ codeId: "code-1", code: "JH-EL-REAL", boxSpec: "21_bags", maxCheckins: 21, createdAt: "2026-11-09" }],
      },
      error: null,
    });
    render(<CoachCodeInventory />);

    expect(await screen.findByText("JH-EL-REAL")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "产品激活码库" })).toBeInTheDocument();
    expect(screen.getByText("可用 1 枚")).toBeInTheDocument();
    expect(getSupabase().rpc).toHaveBeenCalledWith("get_my_code_inventory");
  });

  it("库存请求未完成时显示加载状态", () => {
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(<CoachCodeInventory />);

    expect(screen.getByRole("status")).toHaveTextContent("码库加载中");
  });

  it("正常空库存显示暂无激活码而不是错误", async () => {
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: emptyInventory, error: null });
    render(<CoachCodeInventory />);

    expect(await screen.findByText("暂无激活码")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("密钥维护错误显示系统维护且不混入正常空态", async () => {
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: "BOX_CODE_PEPPER_NOT_CONFIGURED" },
    });
    render(<CoachCodeInventory />);

    expect(await screen.findByRole("alert")).toHaveTextContent("系统维护中，请稍后重试。");
    expect(screen.queryByText("暂无激活码")).not.toBeInTheDocument();
  });
});
