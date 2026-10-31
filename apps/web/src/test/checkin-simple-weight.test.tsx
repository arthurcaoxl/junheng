import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { STORAGE_KEY, todayKey } from "../utils/checkin";

function renderCheckIn() {
  return render(<MemoryRouter initialEntries={["/check-in"]}><App /></MemoryRouter>);
}

function savedState() {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
}

describe("极简体重记录与衣物扣减", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("新用户默认扣除 0.5 kg，且默认只展示早晨与腰围", async () => {
    const user = userEvent.setup();
    renderCheckIn();

    expect(screen.getByText("晨起称重衣物扣减：默认 0.5 kg（可调整）")).toBeInTheDocument();
    expect(screen.queryByLabelText("中午体重")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("晚间体重")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("早晨体重（空腹）"), "68");
    expect(screen.getByText("已扣除衣物 0.5 kg，当前净重 67.5 kg")).toBeInTheDocument();
    expect(screen.getByText("今日体重：67.5 kg")).toBeInTheDocument();
    expect(screen.getByText("（已扣除衣物）")).toBeInTheDocument();

    const state = savedState();
    expect(state.clothesWeight).toBe("0.5");
    expect(state.records[todayKey()].clothes).toBe("0.5");
    expect(state.records[todayKey()].weight).toBe("67.5");
  });

  it("整数净重在总结区也保留一位小数", async () => {
    const user = userEvent.setup();
    renderCheckIn();
    await user.type(screen.getByLabelText("早晨体重（空腹）"), "68.5");
    expect(screen.getByText("今日体重：68.0 kg")).toBeInTheDocument();
  });

  it("衣物编辑取消不落盘，确认后更新今天的扣减与净重", async () => {
    const user = userEvent.setup();
    renderCheckIn();
    await user.type(screen.getByLabelText("早晨体重（空腹）"), "68");

    await user.click(screen.getByRole("button", { name: "修改" }));
    const input = screen.getByLabelText("衣物重量（kg）");
    await user.clear(input);
    await user.type(input, "0.8");
    expect(savedState().clothesWeight).toBe("0.5");
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByLabelText("衣物重量（kg）")).not.toBeInTheDocument();
    expect(screen.getByText("已扣除衣物 0.5 kg，当前净重 67.5 kg")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "修改" }));
    await user.clear(screen.getByLabelText("衣物重量（kg）"));
    await user.type(screen.getByLabelText("衣物重量（kg）"), "0.8");
    await user.click(screen.getByRole("button", { name: "确认" }));

    expect(screen.queryByLabelText("衣物重量（kg）")).not.toBeInTheDocument();
    expect(screen.getByText("已扣除衣物 0.8 kg，当前净重 67.2 kg")).toBeInTheDocument();
    expect(savedState().clothesWeight).toBe("0.8");
    expect(savedState().records[todayKey()].clothes).toBe("0.8");
    expect(savedState().records[todayKey()].weight).toBe("67.2");
  });

  it("展开中晚后仅早晨扣衣物，并用人话展示参考体重", async () => {
    const user = userEvent.setup();
    renderCheckIn();
    await user.type(screen.getByLabelText("早晨体重（空腹）"), "68");
    await user.click(screen.getByRole("button", { name: "+ 记录中午/晚间体重（选填）" }));
    await user.type(screen.getByLabelText("晚间体重"), "69");

    expect(screen.getByText("今日参考体重：67.9 kg")).toBeInTheDocument();
    expect(screen.getByText("系统已结合您全天的水分波动综合计算，建议主要参考早晨的空腹数据。")).toBeInTheDocument();
    expect(screen.queryByText(/按早晨 60%/)).not.toBeInTheDocument();
    const evening = screen.getByLabelText("晚间体重").closest(".weight-node")!;
    expect(within(evening as HTMLElement).queryByText(/净重|扣除衣物/)).not.toBeInTheDocument();
    expect(savedState().records[todayKey()].weight).toBe("67.9");
  });

  it("收起其他时段后隐藏中晚输入但保留已记录数据", async () => {
    const user = userEvent.setup();
    renderCheckIn();
    await user.click(screen.getByRole("button", { name: "+ 记录中午/晚间体重（选填）" }));
    await user.type(screen.getByLabelText("中午体重"), "68.4");
    await user.type(screen.getByLabelText("晚间体重"), "68.8");

    await user.click(screen.getByRole("button", { name: "收起其他时段记录" }));

    expect(screen.queryByLabelText("中午体重")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("晚间体重")).not.toBeInTheDocument();
    expect(savedState().records[todayKey()].weights).toMatchObject({ noon: "68.4", evening: "68.8" });
    await user.click(screen.getByRole("button", { name: "+ 记录中午/晚间体重（选填）" }));
    expect(screen.getByLabelText("中午体重")).toHaveValue(68.4);
    expect(screen.getByLabelText("晚间体重")).toHaveValue(68.8);
  });
});
