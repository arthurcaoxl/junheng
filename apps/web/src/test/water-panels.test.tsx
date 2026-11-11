import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { fetchMyActivationStatus } from "../services/boxCodeActivation";

vi.mock("../services/boxCodeActivation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/boxCodeActivation")>();
  return { ...actual, fetchMyActivationStatus: vi.fn() };
});

async function renderCheckIn() {
  const view = render(<MemoryRouter initialEntries={["/check-in"]}><App /></MemoryRouter>);
  await screen.findByRole("region", { name: "21 天，构建你的脂代谢稳态。" });
  return view;
}

describe("water fluctuation panels", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(fetchMyActivationStatus).mockResolvedValue({ state: "active", requestedAt: null, rejectionHint: null });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps both science panels expanded by default on desktop", async () => {
    await renderCheckIn();
    expect(screen.getByRole("button", { name: "收起 24 小时时间轴" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "收起波动原因" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("heading", { name: "早晨 7:00–8:00" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "碳水与盐分" })).toBeInTheDocument();
  });

  it("collapses and re-expands the timeline panel, persisting the choice", async () => {
    const user = userEvent.setup();
    const first = await renderCheckIn();
    await user.click(screen.getByRole("button", { name: "收起 24 小时时间轴" }));
    const collapsed = screen.getByRole("button", { name: "展开 24 小时时间轴" });
    expect(collapsed).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("heading", { name: "早晨 7:00–8:00" })).not.toBeInTheDocument();
    first.unmount();
    await renderCheckIn();
    expect(screen.getByRole("button", { name: "展开 24 小时时间轴" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "展开 24 小时时间轴" }));
    expect(screen.getByRole("heading", { name: "早晨 7:00–8:00" })).toBeInTheDocument();
  });

  it("collapses both panels by default on narrow screens", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("760"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    await renderCheckIn();
    expect(screen.getByRole("button", { name: "展开 24 小时时间轴" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "展开波动原因" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("heading", { name: "早晨 7:00–8:00" })).not.toBeInTheDocument();
  });

  it("falls back to defaults when stored panel state is invalid", async () => {
    window.localStorage.setItem("junheng-water-info-v1", "{not-json");
    await renderCheckIn();
    expect(screen.getByRole("button", { name: "收起 24 小时时间轴" })).toHaveAttribute("aria-expanded", "true");
  });
});
