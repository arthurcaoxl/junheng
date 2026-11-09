import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CoachEmailSearchSelect from "../components/admin/CoachEmailSearchSelect";
import { getSupabase } from "../lib/supabase";

describe("教练邮箱搜索空态", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], error: null });
  });

  it("RPC 正常返回空数组时显示无匹配教练而不是红字错误", async () => {
    const user = userEvent.setup();
    render(<CoachEmailSearchSelect id="coach-search" label="划拨教练邮箱" selectedId="" onSelect={() => {}} />);

    await user.type(screen.getByLabelText("划拨教练邮箱"), "nobody");

    expect(await screen.findByText("无匹配教练")).toHaveClass("admin-hint");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("教练邮箱搜索失败，请稍后重试。")).not.toBeInTheDocument();
  });
});
