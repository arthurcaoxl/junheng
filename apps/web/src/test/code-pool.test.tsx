import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../lib/supabase";
import {
  allocateCodesToCoach,
  fetchMyCodeInventory,
  generatePlatformCodes,
} from "../services/codePool";
import AdminCodePool from "../components/admin/AdminCodePool";
import CoachCodeInventory from "../components/coach/CoachCodeInventory";

vi.mock("../services/codePool", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/codePool")>();
  return {
    ...actual,
    generatePlatformCodes: vi.fn(actual.generatePlatformCodes),
    allocateCodesToCoach: vi.fn(actual.allocateCodesToCoach),
    fetchMyCodeInventory: vi.fn(actual.fetchMyCodeInventory),
  };
});

describe("产品激活码库服务与界面", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  });

  it.each([1, 2, 25])("生成 RPC 接受任意正整数盒数 %i", async (count) => {
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { ok: true, generatedCount: count }, error: null,
    });
    await expect(generatePlatformCodes(count, "21_bags", "PAY-20261108-01")).resolves.toBe(count);
    expect(getSupabase().rpc).toHaveBeenCalledWith("generate_platform_codes", {
      p_count: count,
      p_box_spec: "21_bags",
      p_offline_receipt_no: "PAY-20261108-01",
    });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("非正整数盒数 %s 在前端拦截", async (count) => {
    await expect(generatePlatformCodes(count, "21_bags", "PAY-20261108-01")).rejects.toThrow("生成盒数必须为正整数");
    expect(getSupabase().rpc).not.toHaveBeenCalled();
  });

  it("INVALID_CODE_COUNT 不再错译为 24 倍数业务限制", async () => {
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: "INVALID_CODE_COUNT" },
    });
    await expect(generatePlatformCodes(1, "21_bags", "PAY-20261108-01")).rejects.toThrow("产品激活码库操作失败，请稍后重试。");
    await expect(generatePlatformCodes(1, "21_bags", "PAY-20261108-01")).rejects.not.toThrow("24");
  });

  it("空白线下凭证在前端拦截且不调用生成 RPC", async () => {
    await expect(generatePlatformCodes(1, "21_bags", "  ")).rejects.toThrow("请填写线下打款凭证号");
    expect(getSupabase().rpc).not.toHaveBeenCalled();
  });

  it("划拨 RPC 只提交目标教练和数量", async () => {
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { ok: true, allocatedCount: 12 }, error: null,
    });
    await expect(allocateCodesToCoach("coach-uuid", 12)).resolves.toBe(12);
    expect(getSupabase().rpc).toHaveBeenCalledWith("allocate_codes_to_coach", {
      p_coach_id: "coach-uuid",
      p_count: 12,
    });
  });

  it("Admin 表单必须填写凭证才能发码并可划拨给教练", async () => {
    const user = userEvent.setup();
    vi.mocked(generatePlatformCodes).mockResolvedValue(24);
    vi.mocked(allocateCodesToCoach).mockResolvedValue(12);
    render(<AdminCodePool />);

    await user.click(screen.getByRole("button", { name: "批量生成码" }));
    expect(generatePlatformCodes).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText("生成盒数"));
    await user.type(screen.getByLabelText("生成盒数"), "24");
    await user.selectOptions(screen.getByLabelText("盒规格"), "21_bags");
    await user.type(screen.getByLabelText("激活码审批号"), "PAY-OFFLINE-88");
    await user.click(screen.getByRole("button", { name: "批量生成码" }));
    expect(generatePlatformCodes).toHaveBeenCalledWith(24, "21_bags", "PAY-OFFLINE-88");

    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ coach_id: "coach-uuid", email: "coach@example.com", name: "教练甲", phone: "13800000000" }], error: null,
    });
    await user.type(screen.getByLabelText("划拨教练邮箱"), "coach");
    await user.click(await screen.findByRole("option", { name: /coach@example\.com.*教练甲.*13800000000/ }));
    await user.type(screen.getByLabelText("划拨数量"), "12");
    await user.click(screen.getByRole("button", { name: "划拨给教练" }));
    expect(allocateCodesToCoach).toHaveBeenCalledWith("coach-uuid", 12);
  });

  it("Vault pepper 未配置时云仓显示系统维护中而不是通用码池错误", async () => {
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: "BOX_CODE_PEPPER_NOT_CONFIGURED" },
    });

    await expect(fetchMyCodeInventory()).rejects.toThrow("系统维护中，请稍后重试。");
  });

  it("教练端列出未激活码并复制码面", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.mocked(fetchMyCodeInventory).mockResolvedValue({
      availableCount: 1,
      restockPoint: 12,
      needsRestock: true,
      codes: [{ codeId: "code-1", code: "JH-EL-AB23", boxSpec: "21_bags", maxCheckins: 21, createdAt: "2026-11-08" }],
    });
    render(<CoachCodeInventory />);

    expect(await screen.findByText("JH-EL-AB23")).toBeInTheDocument();
    expect(screen.getByText("可用 1 枚")).toBeInTheDocument();
    expect(screen.getByText("库存低于补货点，请及时补货")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "复制 JH-EL-AB23" }));
    expect(writeText).toHaveBeenCalledWith("JH-EL-AB23");
    expect(await screen.findByText("已复制")).toBeInTheDocument();
  });
});
