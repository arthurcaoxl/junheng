import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  assignStaffCoach,
  fetchAdminStaffDirectory,
  revokeStaffCoach,
  setStaffRole,
  type StaffAssignment,
  type StaffMember,
} from "../../services/adminStaff";
import type { AdminCoachDirectoryEntry } from "../../services/adminCoachDirectory";
import CoachEmailSearchSelect from "./CoachEmailSearchSelect";

function capacityWarnings(staff: StaffMember): string[] {
  const warnings: string[] = [];
  if (staff.coachCount > 5) warnings.push(`STAFF_CAPACITY_WARNING：已分配 ${staff.coachCount} 名教练，超过 5 名软容量参考。`);
  if (staff.camperCount > 150) warnings.push(`STAFF_CAPACITY_WARNING：覆盖 ${staff.camperCount} 名体验官，超过 150 名软容量参考。`);
  return warnings;
}

export default function AdminStaffManagement() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [email, setEmail] = useState("");
  const [coachDrafts, setCoachDrafts] = useState<Record<string, AdminCoachDirectoryEntry | null>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const rows = await fetchAdminStaffDirectory();
    setStaff(rows);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchAdminStaffDirectory().then((rows) => {
      if (alive) setStaff(rows);
    }).catch((cause: unknown) => {
      if (alive) setError(cause instanceof Error ? cause.message : "员工目录读取失败。");
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const message = await action();
      await load();
      setNotice(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "员工权限操作失败。");
    } finally {
      setBusy(false);
    }
  };

  const addStaff = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await setStaffRole(email, true, 0);
      setEmail("");
      return "员工已添加，默认仅拥有被分配教练的脱敏雷达权限。";
    });
  };

  const toggleStaff = (member: StaffMember) => {
    void run(async () => {
      await setStaffRole(member.email, !member.isActive, member.version);
      return member.isActive ? "员工已停用，新请求立即失去业务权限。" : "员工已恢复，仍仅限当前有效分配范围。";
    });
  };

  const assign = (member: StaffMember) => {
    const coach = coachDrafts[member.staffId];
    if (!coach) return;
    void run(async () => {
      const result = await assignStaffCoach(member, coach);
      setCoachDrafts((current) => ({ ...current, [member.staffId]: null }));
      const coachWarning = result.warnings.find((warning) => warning.type === "coach_count");
      if (coachWarning) return `分配成功，但教练数达到 ${coachWarning.count} 名，请复盘服务容量。`;
      if (result.warnings.length) return "分配成功，服务容量已超过软参考，请安排治理跟进。";
      return "员工与教练的分配已创建。";
    });
  };

  const revoke = (assignment: StaffAssignment) => {
    void run(async () => {
      await revokeStaffCoach(assignment);
      return "已撤销员工与教练的分配。";
    });
  };

  return (
    <section className="admin-block admin-staff-management" aria-labelledby="admin-staff-title">
      <div className="admin-block-heading">
        <h2 id="admin-staff-title">员工角色与教练分配</h2>
        <span>最小权限 · 服务端鉴权 · 全量审计</span>
      </div>
      <p className="admin-intro">员工只能查看当前分配教练名下的脱敏雷达；不能查看产品激活码库、库存、财务或其他 Admin 界面。</p>

      <form className="admin-staff-add" onSubmit={addStaff}>
        <label htmlFor="new-staff-email">新员工邮箱</label>
        <input id="new-staff-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <button type="submit" className="admin-primary" disabled={busy}>添加员工</button>
      </form>

      {loading && <p role="status">员工目录加载中…</p>}
      {!loading && staff.length === 0 && <p className="admin-empty">尚未配置员工。</p>}
      <div className="admin-staff-list">
        {staff.map((member) => (
          <article className="admin-staff-card" key={member.staffId}>
            <div className="admin-staff-card-heading">
              <div>
                <h3>{member.email}</h3>
                <p>{member.isActive ? "员工 · 已启用" : "员工 · 已停用"} · {member.coachCount} 名教练 · {member.camperCount} 名体验官</p>
              </div>
              <button type="button" className="admin-secondary" disabled={busy} onClick={() => toggleStaff(member)}>
                {member.isActive ? "停用员工" : "恢复员工"}
              </button>
            </div>

            {capacityWarnings(member).map((warning) => <p className="admin-error admin-capacity-warning" key={warning}>{warning}</p>)}

            <ul className="admin-staff-assignments" aria-label={`${member.email} 的教练分配`}>
              {member.assignments.map((assignment) => (
                <li key={assignment.assignmentId}>
                  <span>{assignment.coachEmail}</span>
                  <button
                    type="button"
                    className="admin-secondary"
                    aria-label={`撤销 ${assignment.coachEmail} 的分配`}
                    disabled={busy || !member.isActive}
                    onClick={() => revoke(assignment)}
                  >
                    撤销分配
                  </button>
                </li>
              ))}
            </ul>

            {member.isActive && (
              <div className="admin-staff-assign-form">
                <CoachEmailSearchSelect
                  id={`staff-coach-${member.staffId}`}
                  label={`为 ${member.email} 分配教练`}
                  selectedId={coachDrafts[member.staffId]?.coachId ?? ""}
                  disabled={busy}
                  onSelect={(coach) => setCoachDrafts((current) => ({ ...current, [member.staffId]: coach }))}
                />
                <button type="button" className="admin-primary" disabled={busy || !coachDrafts[member.staffId]} onClick={() => assign(member)}>
                  确认分配教练
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}
    </section>
  );
}
