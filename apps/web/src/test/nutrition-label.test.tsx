import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import App from "../App";
import { nutritionLabel, nutritionLabelNote } from "../data/nutrition";

describe("nutrition label disclosure", () => {
  it("keeps the full nutrition label collapsed by default", () => {
    render(<MemoryRouter><App /></MemoryRouter>);
    const section = screen.getByRole("region", { name: "一杯的营养密度" });
    const toggle = within(section).getByRole("button", { name: /查看完整营养成分表/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "metrics-label-panel");
    expect(within(section).queryByRole("table")).not.toBeInTheDocument();
  });

  it("expands the label table transcribed from the package on demand", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><App /></MemoryRouter>);
    const section = screen.getByRole("region", { name: "一杯的营养密度" });
    await user.click(within(section).getByRole("button", { name: /查看完整营养成分表/ }));

    const toggle = within(section).getByRole("button", { name: /收起营养成分表/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const table = within(section).getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(nutritionLabel.length + 1);

    const proteinRow = within(table).getByRole("row", { name: /蛋白质/ });
    expect(proteinRow).toHaveTextContent("42.6 克");
    expect(proteinRow).toHaveTextContent("10.7 克");
    expect(within(table).getByRole("row", { name: /左旋肉碱/ })).toHaveTextContent("650 毫克");
    expect(within(section).getByText(nutritionLabelNote)).toBeInTheDocument();
  });

  it("collapses the label again on second click", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><App /></MemoryRouter>);
    const section = screen.getByRole("region", { name: "一杯的营养密度" });
    const toggle = within(section).getByRole("button", { name: /查看完整营养成分表/ });
    await user.click(toggle);
    expect(within(section).getByRole("table")).toBeInTheDocument();
    await user.click(within(section).getByRole("button", { name: /收起营养成分表/ }));
    expect(within(section).queryByRole("table")).not.toBeInTheDocument();
  });

  it("transcribes every label row with both per-100g and per-bag values", () => {
    expect(nutritionLabel).toHaveLength(14);
    for (const row of nutritionLabel) {
      expect(row.per100g.trim().length).toBeGreaterThan(0);
      expect(row.perBag.trim().length).toBeGreaterThan(0);
    }
    expect(nutritionLabel.map((row) => row.name)).toContain("左旋肉碱");
  });
});
