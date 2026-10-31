import { useState } from "react";
import { useSyncStatus } from "./useSyncStatus";
import { buildWindowRecords, getCampStats, loadState } from "../utils/checkin";

const NAME_STORAGE_KEY = "junheng-checkin-name-v1";

function loadRecordName() {
  try {
    return window.localStorage.getItem(NAME_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** 用户中心只读取 v3 本机档案，不维护第二份打卡记录或同步状态。 */
export function useUserCenterData() {
  const [state] = useState(loadState);
  const [recordName] = useState(loadRecordName);
  const sync = useSyncStatus();
  const records = buildWindowRecords(state);
  const stats = getCampStats(state);

  return { state, recordName, records, stats, ...sync };
}
