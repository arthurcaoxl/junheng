import { useState, type ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BmiTracker } from "../components/user-center/BmiTracker";
import UserCenter from "../pages/UserCenter";
import { emptyDay, STORAGE_KEY, type CheckInState } from "../utils/checkin";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  LineChart: ({ children, data }: { children: ReactNode; data: { date: string }[] }) => (
    <div data-testid="bmi-line-chart">{children}<span>{data.map((point) => point.date).join(",")}</span></div>
  ),
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

function state(overrides: Partial<CheckInState> = {}): CheckInState {
  return {
    schema: 3,
    userCode: "JH-BMI01",
    startDate: "2026-11-01",
    records: {},
    ...overrides,
  };
}

function day(weight: string) {
  return { ...emptyDay(), weight };
}

type Save = (next: CheckInState) => void | Promise<void>;

function Harness({ initialState, onSave = () => undefined }: { initialState: CheckInState; onSave?: Save }) {
  const [current, setCurrent] = useState(initialState);
  return <BmiTracker state={current} onSave={async (next) => {
    await onSave(next);
    setCurrent(next);
  }} />;
}

describe("BmiTracker", () => {
  beforeEach(() => window.localStorage.clear());

  it("未填身高时展示待完善状态，并能展开语义正确的行内档案表单", async () => {
    const user = userEvent.setup();
    render(<Harness initialState={state()} />);

    const tracker = screen.getByRole("region", { name: "BMI 动态追踪" });
    expect(within(tracker).getByText(/补充身高后/)).toBeInTheDocument();
    expect(within(tracker).getByText("输入身高，系统将自动结合您的体重记录，计算并追踪 BMI 变化。")).toBeInTheDocument();
    expect(within(tracker).queryByText("当前 BMI")).not.toBeInTheDocument();

    await user.click(within(tracker).getByRole("button", { name: "完善基础档案" }));
    const heightInput = within(tracker).getByLabelText("身高（cm）");
    const initialInput = within(tracker).getByLabelText("初始体重（kg，可选）");
    expect(heightInput).toHaveAttribute("type", "text");
    expect(heightInput).toHaveAttribute("inputmode", "numeric");
    expect(heightInput).toHaveAttribute("pattern", "[0-9]*");
    expect(initialInput).toHaveAttribute("type", "text");
    expect(initialInput).toHaveAttribute("inputmode", "decimal");
    expect(initialInput).toHaveAttribute("placeholder", "默认取首日体重");
    expect(within(tracker).getByText("留空将自动采用您本期打卡的第一笔有效体重作为初始值。")).toBeInTheDocument();

    expect(within(tracker).getByRole("button", { name: "保存档案" })).toHaveClass("bmi-primary-button");
    expect(within(tracker).getByRole("button", { name: "重置为自动取值" })).toHaveClass("bmi-text-button");
    expect(within(tracker).getByRole("button", { name: "取消" })).toHaveClass("bmi-text-button");
  });

  it("展示当前、初始和变化量，并精准定位 14–35 量尺指针", () => {
    render(<Harness initialState={state({
      heightCm: "175",
      records: {
        "2026-11-01": day("70"),
        "2026-11-02": day("68"),
      },
    })} />);

    expect(screen.getByTestId("bmi-current")).toHaveTextContent("22.2");
    expect(screen.getByTestId("bmi-initial")).toHaveTextContent("22.9");
    expect(screen.getByTestId("bmi-change")).toHaveTextContent("-0.7");
    expect(screen.getByTestId("bmi-current").parentElement).toHaveTextContent("体重正常");
    expect(screen.getByTestId("bmi-initial").parentElement).toHaveTextContent("基于首条记录");
    expect(screen.getByTestId("bmi-change").parentElement).toHaveTextContent("较首条记录");

    const position = Number.parseFloat(screen.getByTestId("bmi-scale-indicator").style.left);
    expect(position).toBeCloseTo(((68 / (1.75 ** 2)) - 14) / 21 * 100, 6);
  });

  it("自定义初始体重参与计算，并可重置为自动取值", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Harness initialState={state({
      heightCm: "175",
      initialWeightKg: "72",
      records: { "2026-11-01": day("70"), "2026-11-02": day("68") },
    })} onSave={onSave} />);

    expect(screen.getByTestId("bmi-initial")).toHaveTextContent("23.5");
    expect(screen.getByText("自定义初始体重")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "编辑基础档案" }));
    await user.click(screen.getByRole("button", { name: "重置为自动取值" }));
    expect(screen.getByLabelText("初始体重（kg，可选）")).toHaveDisplayValue("");
    await user.click(screen.getByRole("button", { name: "保存档案" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ heightCm: "175" }));
    expect(onSave.mock.calls[0][0]).not.toHaveProperty("initialWeightKg");
    expect(await screen.findByTestId("bmi-initial")).toHaveTextContent("22.9");
    expect(screen.getByTestId("bmi-initial").parentElement).toHaveTextContent("基于首条记录");
    expect(screen.getByRole("status")).toHaveTextContent("身高档案已更新，BMI 已重新计算");
  });

  it("仅一条有效体重时显示量尺但不生成折线图，两条后展示趋势", () => {
    const oneDay = state({ heightCm: "175", records: { "2026-11-01": day("70") } });
    const { rerender } = render(<BmiTracker state={oneDay} onSave={() => undefined} />);

    expect(screen.queryByRole("img", { name: "BMI 动态趋势图" })).not.toBeInTheDocument();
    expect(screen.getByText(/再记录 1 天有效体重/)).toBeInTheDocument();

    rerender(<BmiTracker state={state({
      heightCm: "175",
      records: { "2026-11-01": day("70"), "2026-11-02": day("68") },
    })} onSave={() => undefined} />);
    expect(screen.getByRole("img", { name: "BMI 动态趋势图" })).toBeInTheDocument();
    expect(screen.getByTestId("bmi-line-chart")).toHaveTextContent("11/01,11/02");
    expect(screen.getByText("仅呈现真实打卡日数据")).toBeInTheDocument();
  });

  it("有身高但没有有效体重时给出打卡引导", () => {
    render(<Harness initialState={state({ heightCm: "175" })} />);

    expect(screen.getByTestId("bmi-current")).toHaveTextContent("—");
    expect(screen.getByText(/暂无有效体重记录/)).toBeInTheDocument();
    expect(screen.queryByTestId("bmi-scale-indicator")).not.toBeInTheDocument();
  });

  it("非法身高不会保存，并显示明确错误", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Harness initialState={state()} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "完善基础档案" }));
    await user.type(screen.getByLabelText("身高（cm）"), "0");
    await user.click(screen.getByRole("button", { name: "保存档案" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("请输入有效身高");
  });

  it("保存期间显示加载状态，成功后反馈 Toast", async () => {
    const user = userEvent.setup();
    let resolveSave: (() => void) | undefined;
    const onSave = vi.fn(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
    render(<Harness initialState={state()} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "完善基础档案" }));
    await user.type(screen.getByLabelText("身高（cm）"), "168");
    await user.click(screen.getByRole("button", { name: "保存档案" }));
    expect(screen.getByRole("button", { name: "保存中…" })).toBeDisabled();

    resolveSave!();
    expect(await screen.findByRole("status")).toHaveTextContent("身高档案已更新，BMI 已重新计算");
  });

  it("用户中心将 BMI 放在健康统计之后，并把档案写回 v3", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state({
      records: { "2026-11-01": day("70"), "2026-11-02": day("68") },
    })));
    render(<MemoryRouter><UserCenter /></MemoryRouter>);

    const health = screen.getByRole("region", { name: "本期健康统计" });
    expect(health.nextElementSibling).toHaveAttribute("aria-label", "BMI 动态追踪");

    await user.click(screen.getByRole("button", { name: "完善基础档案" }));
    await user.type(screen.getByLabelText("身高（cm）"), "175");
    await user.click(screen.getByRole("button", { name: "保存档案" }));

    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toMatchObject({ heightCm: "175" });
    expect(await screen.findByTestId("bmi-current")).toHaveTextContent("22.2");
    expect(screen.getByRole("status")).toHaveTextContent("身高档案已更新，BMI 已重新计算");
  });

  it("近 7 天体重腰围双降时渲染高情商反馈，大数字旁可打开肌肉人群风险说明", async () => {
    const user = userEvent.setup();
    const records = Object.fromEntries(Array.from({ length: 7 }, (_, index) => [
      `2026-11-0${index + 1}`,
      { ...emptyDay(), weight: (70 - index * 0.1).toFixed(1), waist: (96 - index * 0.2).toFixed(1) },
    ]));
    render(<Harness initialState={state({ heightCm: "175", records })} />);

    expect(screen.getByText(/精准掉脂肪/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "BMI 适用性说明" }));
    expect(screen.getByRole("dialog", { name: "BMI 适用性说明" })).toHaveTextContent("肌肉");
  });
});
