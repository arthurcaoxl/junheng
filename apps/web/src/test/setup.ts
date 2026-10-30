import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(cleanup);

if (typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((media: string) => ({
      matches: false,
      media,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// jsdom 的 scrollTo 会打印 Not implemented 噪音，统一替换为可断言的空实现
Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: vi.fn(),
});

// 全局隔离 Supabase：既有基线测试不 import 它，零影响；
// 新增同步测试自动拿到此 stub，无环境变量、无真实网络。
vi.mock("@supabase/supabase-js", () => {
  const query = {
    upsert: vi.fn().mockResolvedValue({ error: null }),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
  };
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      signInAnonymously: vi.fn().mockResolvedValue({
        data: { session: { user: { id: "test-uid" } } }, error: null,
      }),
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      verifyOtp: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn(() => query),
  };
  return { createClient: vi.fn(() => client) };
});
