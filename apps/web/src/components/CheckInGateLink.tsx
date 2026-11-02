import type { MouseEvent, PropsWithChildren } from "react";
import { Link, useNavigate } from "react-router";
import { useConsent } from "../hooks/useConsent";
import { ConsentDialog } from "./ConsentDialog";

type CheckInGateLinkProps = PropsWithChildren<{ className?: string }>;

/**
 * 打卡入口统一闸门（Hero 与入口区共用）：
 * 点击先 preventDefault，查云端授权表态——已表态（同意或拒绝）直接放行；
 * 从未表态才弹总授权弹窗，表态后写入云端并放行，绝不重复打扰。
 */
export function CheckInGateLink({ className, children }: CheckInGateLinkProps) {
  const navigate = useNavigate();
  const { promptVisible, busy, ensureConsent, resolve } = useConsent();

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    void ensureConsent(() => navigate("/check-in"));
  };

  return (
    <>
      <Link className={className} to="/check-in" onClick={onClick}>{children}</Link>
      {promptVisible && (
        <ConsentDialog
          busy={busy}
          onAgree={() => void resolve(true)}
          onDecline={() => void resolve(false)}
        />
      )}
    </>
  );
}
