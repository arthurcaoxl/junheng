import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";

function renderCheckIn() {
  return render(<MemoryRouter initialEntries={["/check-in"]}><App /></MemoryRouter>);
}

describe("water fluctuation panels", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps both science panels expanded by default on desktop", () => {
    renderCheckIn();
    expect(screen.getByRole("button", { name: "收起 24 小时时间轴" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "收起波动原因" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("heading", { name: "早晨 7:00–8:00" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "碳水与盐分" })).toBeInTheDocument();
  });

  it("collapses and re-expands the timeline panel, persisting the choice", async () => {
    const user = userEvent.setup();
    const first = renderCheckIn();
    await user.click(screen.getByRole("button", { name: "收起 24 小时时间轴" }));
    const collapsed = screen.getByRole("button", { name: "展开 24 小时时间轴" });
    expect(collapsed).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("heading", { name: "早晨 7:00–8:00" })).not.toBeInTheDocument();
    first.unmount();
    renderCheckIn();
    expect(screen.getByRole("button", { name: "展开 24 小时时间轴" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "展开 24 小时时间轴" }));
    expect(screen.getByRole("heading", { name: "早晨 7:00–8:00" })).toBeInTheDocument();
  });

  it("collapses both panels by default on narrow screens", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("760"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    renderCheckIn();
    expect(screen.getByRole("button", { name: "展开 24 小时时间轴" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "展开波动原因" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("heading", { name: "早晨 7:00–8:00" })).not.toBeInTheDocument();
  });

  it("falls back to defaults when stored panel state is invalid", () => {
    window.localStorage.setItem("junheng-water-info-v1", "{not-json");
    renderCheckIn();
    expect(screen.getByRole("button", { name: "收起 24 小时时间轴" })).toHaveAttribute("aria-expanded", "true");
  });
});
