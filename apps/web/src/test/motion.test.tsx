import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiquidImage } from "../components/LiquidImage";

describe("LiquidImage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps accessible static media available when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    render(<LiquidImage src="/images/hero.webp" alt="正常三餐搭配菌衡膳食粉的生活场景" width={809} height={1160} />);
    expect(screen.getByRole("img", { name: "正常三餐搭配菌衡膳食粉的生活场景" })).toBeInTheDocument();
    expect(document.querySelector("canvas")).not.toBeInTheDocument();
  });
});
