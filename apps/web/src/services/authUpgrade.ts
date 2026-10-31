import { ensureSession, getSupabase } from "../lib/supabase";
import { normalizeOtpInput } from "./otp";

/** 第一步：匿名账户原地绑定邮箱，"Email Change"模板发 6–8 位数字码（模板已无链接）。 */
export async function upgradeToPermanentAccount(email: string): Promise<void> {
  await ensureSession();
  const { error } = await getSupabase().auth.updateUser({ email });
  if (error) {
    if (error.status === 429 || /rate|limit/i.test(error.message)) {
      throw new Error("发送太频繁，请 1 分钟后再试。");
    }
    // 目标邮箱已被其他账号占用（例如曾在管理后台或其他设备用该邮箱登录过），
    // Supabase 拒绝换绑；此前统一报"绑定请求失败"掩盖了真实原因。
    if (error.code === "email_exists" || /already.*(registered|been)|email_exists|duplicate/i.test(error.message)) {
      throw new Error("该邮箱已被其他账号占用，无法直接换绑。请先用该邮箱登录恢复原账号，或联系运营方协助合并账号。");
    }
    // 脱敏诊断：只保留状态码/错误码/邮箱域名，便于定位 SMTP 或配置问题
    console.error("Email change request failed", {
      status: error.status,
      code: error.code,
      emailDomain: email.split("@")[1] ?? "",
      message: error.message,
    });
    throw new Error("绑定请求失败，请检查邮箱地址或稍后重试。");
  }
}

/** 换绑结果：changed = 服务端邮箱已更新；pending = 双确认开启，仅新邮箱验证通过，还需原邮箱确认。 */
export type EmailUpgradeResult = { status: "changed" } | { status: "pending"; currentEmail: string | null };

/** 第二步：输入邮件中的数字码完成绑定；uid 不变，云端数据无缝继承。 */
export async function confirmEmailUpgrade(email: string, token: string): Promise<EmailUpgradeResult> {
  const code = normalizeOtpInput(token);
  const { error } = await getSupabase().auth.verifyOtp({ email, token: code, type: "email_change" });
  if (error) throw new Error("验证码不正确或已过期，请重新绑定。");
  // Secure email change 开启时，仅验证新邮箱不会完成换绑，verifyOtp 也不报错；
  // 必须核对服务端真实邮箱，避免"假成功"。
  const { data } = await getSupabase().auth.getUser();
  const actual = data.user?.email ?? null;
  if (actual && actual.toLowerCase() !== email.toLowerCase()) {
    return { status: "pending", currentEmail: actual };
  }
  return { status: "changed" };
}

/** 双确认的最后一步：用原邮箱收到的确认码完成换绑，并再次核对服务端邮箱。 */
export async function confirmOldEmailForChange(oldEmail: string, newEmail: string, token: string): Promise<void> {
  const code = normalizeOtpInput(token);
  const { error } = await getSupabase().auth.verifyOtp({ email: oldEmail, token: code, type: "email_change" });
  if (error) throw new Error("原邮箱确认码不正确或已过期，请检查后重试。");
  const { data } = await getSupabase().auth.getUser();
  const actual = data.user?.email;
  if (actual && actual.toLowerCase() !== newEmail.toLowerCase()) {
    throw new Error("换绑尚未生效，请稍后刷新页面再查看。");
  }
}
