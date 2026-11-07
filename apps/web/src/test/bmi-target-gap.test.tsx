import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BmiTracker } from "../components/user-center/BmiTracker";
import { emptyDay, type CheckInState } from "../utils/checkin";

function stateWithWeight(heightCm: string | undefined, weight: string | undefined): CheckInState {
  return {
    schema: 3,
    userCode: "JH-BMI01",
    startDate: "2026-11-01",
    heightCm,
    records: weight === undefined ? {} : {
      "2026-11-01": { ...emptyDay(), weight },
    },
  };
}

function renderTracker(state: CheckInState) {
  return render(<BmiTracker state={state} onSave={() => undefined} />);
}

describe("BMI 目标差距数据看板", () => {
  it("超重时使用鼓励式文案并保留弱化后的差距数据", () => {
    renderTracker(stateWithWeight("175", "80"));

    const banner = screen.getByTestId("bmi-target-gap");
    const copy = banner.querySelector(".bmi-target-gap-copy") as HTMLElement;
    expect(banner).toHaveAttribute("data-state", "reduce");
    expect(copy).toBeInTheDocument();
    expect(within(copy).getByText("你正在向健康体重稳步迈进")).toHaveClass("bmi-target-gap-label");
    expect(within(copy).queryByText(/距离健康体重还需减脂/)).not.toBeInTheDocument();
    expect(within(copy).getByText("6.5 kg")).toHaveClass("bmi-target-gap-value");
    expect(within(copy).getByText("6.5 kg").tagName).toBe("STRONG");
  });

  it("正常时健康状态与超重上限空间紧凑成组，并保持看板位于三卡片和量尺之间", () => {
    renderTracker(stateWithWeight("175", "68"));

    const banner = screen.getByTestId("bmi-target-gap");
    const copy = banner.querySelector(".bmi-target-gap-copy") as HTMLElement;
    expect(banner).toHaveAttribute("data-state", "safe");
    expect(copy).toBeInTheDocument();
    expect(within(copy).getByText("✅ 已处于健康体重范围")).toHaveClass("bmi-target-gap-label");
    expect(within(copy).getByText("距超重上限还有 5.5 kg")).toHaveClass("bmi-target-gap-value");
    expect(document.querySelector(".bmi-summary-cards")?.nextElementSibling).toBe(banner);
    expect(banner.nextElementSibling).toHaveClass("bmi-scale");
  });

  it("偏瘦时只展示营养提示，不展示减脂数字", () => {
    renderTracker(stateWithWeight("175", "50"));

    const banner = screen.getByTestId("bmi-target-gap");
    expect(banner).toHaveAttribute("data-state", "underweight");
    expect(within(banner).getByText("请注意营养补充，当前偏瘦")).toHaveClass("bmi-target-gap-copy");
    expect(banner.querySelector("strong")).toBeNull();
  });

  it("减脂时并存展示目标进度条与剩余差距数字", () => {
    const state: CheckInState = {
      schema: 3,
      userCode: "JH-BMI01",
      startDate: "2026-11-01",
      heightCm: "175",
      records: {
        "2026-11-01": { ...emptyDay(), weight: "80.5" },
        "2026-11-02": { ...emptyDay(), weight: "77" },
      },
    };
    render(<BmiTracker state={state} onSave={() => undefined} />);

    const progress = screen.getByRole("progressbar", { name: "目标进度" });
    expect(progress).toHaveAttribute("aria-valuenow", "50");
    expect(progress).toHaveAttribute("aria-valuemin", "0");
    expect(progress).toHaveAttribute("aria-valuemax", "100");
    // 独立且高对比度的整体轨道：未完成部分不能被深背景吞掉
    expect(progress).toHaveClass("bmi-target-progress-track");
    expect(progress.querySelector(".bmi-target-progress-fill")).toBeInTheDocument();
    // 目标 = BMI 24 推导 = 73.5kg；剩余差距与进度并存展示
    const banner = screen.getByTestId("bmi-target-gap");
    expect(within(banner).getByText("3.5 kg")).toHaveClass("bmi-target-gap-value");
  });

  it("无身高或无有效体重时不展示目标差距", () => {
    const { rerender } = renderTracker(stateWithWeight("175", undefined));
    expect(screen.queryByTestId("bmi-target-gap")).not.toBeInTheDocument();

    rerender(<BmiTracker state={stateWithWeight(undefined, "70")} onSave={() => undefined} />);
    expect(screen.queryByTestId("bmi-target-gap")).not.toBeInTheDocument();
  });
});
