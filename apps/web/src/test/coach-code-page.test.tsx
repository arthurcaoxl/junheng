import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { getSupabase } from "../lib/supabase";

describe("教练码库页面", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: null },
    });
  });

  it("已登录教练可进入我的码库并读取本人未激活码", async () => {
    (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { user: { id: "coach-1", email: "coach@example.com" } } },
    });
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        availableCount: 1,
        restockPoint: 12,
        needsRestock: true,
        codes: [{ codeId: "code-1", code: "JH-EL-CO23", boxSpec: "21_bags", maxCheckins: 21, createdAt: "2026-11-08" }],
      },
      error: null,
    });
    render(<MemoryRouter initialEntries={["/coach/codes"]}><App /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "我的码库" })).toBeInTheDocument();
    expect(await screen.findByText("JH-EL-CO23")).toBeInTheDocument();
    expect(getSupabase().rpc).toHaveBeenCalledWith("get_my_code_inventory");
  });

  it("未登录访客只看到教练登录入口而看不到码池管理表单", async () => {
    render(<MemoryRouter initialEntries={["/coach/codes"]}><App /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "教练登录" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "批量生成码" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "划拨给教练" })).not.toBeInTheDocument();
  });
});
