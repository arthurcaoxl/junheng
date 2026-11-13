import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BmiSummaryCards } from "../components/user-center/BmiSummaryCards";
import type { BmiTrackingResult } from "../utils/bmi";

const initialBmi = 70 / (1.75 ** 2);
const currentBmi = 68 / (1.75 ** 2);
const tracking: BmiTrackingResult = {
  initial: { date: "2026-11-01", weightKg: 70, bmi: initialBmi },
  current: { date: "2026-11-02", weightKg: 68, bmi: currentBmi },
  change: currentBmi - initialBmi,
  series: [
    { date: "2026-11-01", weightKg: 70, bmi: initialBmi },
    { date: "2026-11-02", weightKg: 68, bmi: currentBmi },
  ],
};

describe("BmiSummaryCards", () => {
  it("按初始、当前、变化排列，数值不变且适用性说明仍属于当前 BMI", () => {
    const { container } = render(<BmiSummaryCards tracking={tracking} customizedInitial={false} />);
    const articles = Array.from(container.querySelectorAll<HTMLElement>(".bmi-summary-cards > article"));
    const labels = Array.from(container.querySelectorAll(".bmi-summary-cards article > span"))
      .map((label) => label.childNodes[0]?.textContent?.trim());

    expect(labels).toEqual(["初始 BMI", "当前 BMI", "BMI 变化"]);
    expect(screen.getByTestId("bmi-initial")).toHaveTextContent("22.9");
    expect(screen.getByTestId("bmi-current")).toHaveTextContent("22.2");
    expect(screen.getByTestId("bmi-change")).toHaveTextContent("-0.7");
    expect(within(articles[1]).getByRole("button", { name: "BMI 适用性说明" })).toBeInTheDocument();
  });
});
