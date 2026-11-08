import { useEffect, useState } from "react";
import { hasBoxCodeActivation } from "../../services/activationStorage";
import { getMyCoachContact, type CoachContact } from "../../services/coachContact";

export function CoachContactCard({ configured }: { configured: boolean }) {
  const [contact, setContact] = useState<CoachContact | null>(null);
  const activated = hasBoxCodeActivation();

  useEffect(() => {
    if (!configured || !activated) return;
    let alive = true;
    getMyCoachContact().then((value) => {
      if (alive) setContact(value);
    }).catch(() => {
      // 联系方式读取失败不影响本机档案；服务端仍执行归属与脱敏约束。
    });
    return () => { alive = false; };
  }, [activated, configured]);

  if (!configured || !activated) return null;

  return (
    <section className="coach-contact-card sync-panel" aria-labelledby="coach-contact-title">
      <h2 id="coach-contact-title">服务教练</h2>
      <p className="sync-panel-status">您的专属指导联系方式，仅用于本营期服务沟通。</p>
      <dl className="sync-panel-form">
        <div><dt>手机号</dt><dd>{contact?.phone ?? "待教练完善"}</dd></div>
        <div><dt>微信号</dt><dd>{contact?.wechat ?? "待教练完善"}</dd></div>
      </dl>
    </section>
  );
}
