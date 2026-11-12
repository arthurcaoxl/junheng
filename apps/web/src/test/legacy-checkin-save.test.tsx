import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CheckInPage from "../pages/CheckInPage";
import { getSupabase } from "../lib/supabase";
import { flushSyncToCloud, MERGED_FLAG_KEY } from "../services/checkinSync";

const ACTIVATED_KEY = "junheng-box-code-activated-v1";

describe("legacy 无码打卡保存", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    window.localStorage.setItem(MERGED_FLAG_KEY, JSON.stringify({
      "test-uid": { dataVersion: "junheng-checkin-v3-union-v1", mergedAt: "2026-11-12T00:00:00.000Z" },
    }));

    const query = getSupabase().from("checkin_sync") as unknown as {
      maybeSingle: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    query.maybeSingle.mockResolvedValue({ data: { user_code: "JH-LEGACY" }, error: null });
    query.update.mockReturnThis();

    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation(async (name: string) => {
      if (name === "get_my_activation_status") {
        return {
          data: { state: "legacy_granted", source: "whitelist", requested_at: null, rejection_hint: null },
          error: null,
        };
      }
      if (name === "verify_checkin") {
        return {
          data: {
            ok: true,
            idempotent: false,
            physicalDay: "2026-11-12",
            maxCheckins: 1,
            usedCheckins: 1,
            remainingCheckins: 0,
            boxSpec: "legacy",
          },
          error: null,
        };
      }
      return { data: null, error: { message: `unexpected RPC: ${name}` } };
    });
  });

  it("remainingCheckins=0 不显示次数用尽、不禁用当天打卡且能成功保存", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><CheckInPage /></MemoryRouter>);

    const water = await screen.findByRole("checkbox", { name: "完成适量饮水" });
    expect(water).toBeEnabled();
    await user.click(water);
    expect(water).toBeChecked();

    await act(async () => {
      await flushSyncToCloud();
    });

    await waitFor(() => {
      expect(getSupabase().rpc).toHaveBeenCalledWith("verify_checkin", expect.objectContaining({
        p_records: expect.any(Object),
      }));
    });
    expect(water).toBeChecked();
    expect(water).toBeEnabled();
    expect(screen.getByRole("button", { name: "修改" })).toBeEnabled();
    expect(screen.queryByText(/次数用尽|额度耗尽/)).not.toBeInTheDocument();
    expect(screen.queryByText(/剩余 \d+\/\d+ 次/)).not.toBeInTheDocument();
    expect(getSupabase().rpc).not.toHaveBeenCalledWith("get_checkin_quota");
    expect(window.localStorage.getItem(ACTIVATED_KEY)).toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
