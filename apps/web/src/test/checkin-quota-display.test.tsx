import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SevenDayCheckIn } from "../components/SevenDayCheckIn";
import { getSupabase } from "../lib/supabase";

function renderCheckin() {
  return render(<MemoryRouter><SevenDayCheckIn /></MemoryRouter>);
}

describe("打卡页盒码剩余额度", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  });

  it("已激活用户看到服务端返回的剩余次数和总次数", async () => {
    window.localStorage.setItem("junheng-box-code-activated-v1", "true");
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation(async (name: string) => ({
      data: name === "get_checkin_quota" ? {
        ok: true,
        maxCheckins: 21,
        usedCheckins: 6,
        remainingCheckins: 15,
        boxSpec: "21_bags",
      } : name === "get_my_activation_status" ? {
        state: "active",
        requested_at: "2026-11-09T01:00:00Z",
        rejection_hint: null,
      } : null,
      error: null,
    }));

    renderCheckin();

    expect(await screen.findByText("剩余 15/21 次")).toBeInTheDocument();
    expect(getSupabase().rpc).toHaveBeenCalledWith("get_checkin_quota");
  });

  it("未激活用户不伪造默认额度", () => {
    renderCheckin();

    expect(screen.queryByText(/剩余 \d+\/\d+ 次/)).not.toBeInTheDocument();
    expect(getSupabase().rpc).not.toHaveBeenCalledWith("get_checkin_quota");
  });
});
