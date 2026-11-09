import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GraduationCert } from "../components/GraduationCert";
import type { CheckInState } from "../utils/checkin";

const state: CheckInState = {
  schema: 3,
  userCode: "JH-COPY1",
  startDate: "2026-01-01",
  records: {},
};

describe("用户中心 21 天见证定稿文案", () => {
  it("逐字展示主标题、副标题和正文", () => {
    render(<GraduationCert state={state} recordName="体验官" onRequest={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "21 天代谢重塑见证" })).toBeInTheDocument();
    expect(screen.getByText("致敬每一份对身体的诚实与坚持")).toBeInTheDocument();
    expect(screen.getByText("21 天，不仅是时间的刻度，更是身体与习惯的重塑。你在这里记录下的每一次腰围与体重的变化，都是对自我健康的庄重承诺。恭喜你，完成本期见证。愿这 21 天的自律，成为你未来健康的基石。")).toBeInTheDocument();
  });
});
