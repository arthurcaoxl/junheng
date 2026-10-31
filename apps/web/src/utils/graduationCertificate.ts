import type { CheckInState } from "./checkin";
import { hasContent } from "./checkin";

export const GRADUATION_DAYS = 21;

/** 证书统计全部历史有效记录，允许非连续与跨期累计。 */
export function getLifetimeRecordedDays(state: CheckInState): number {
  return Object.values(state.records).filter(hasContent).length;
}

export function canGraduate(state: CheckInState): boolean {
  return getLifetimeRecordedDays(state) >= GRADUATION_DAYS;
}

export function getCertificateNumber(state: CheckInState): string {
  return `FUNGIBLEND-${state.startDate.slice(0, 4)}-${state.userCode.replace(/^JH-/, "").slice(-5)}`;
}
