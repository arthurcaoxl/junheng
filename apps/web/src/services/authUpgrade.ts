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
    throw new Error("绑定请求失败，请检查邮箱地址或稍后重试。");
  }
}

/** 第二步：输入邮件中的数字码完成绑定；uid 不变，云端数据无缝继承。 */
export async function confirmEmailUpgrade(email: string, token: string): Promise<void> {
  const code = normalizeOtpInput(token);
  const { error } = await getSupabase().auth.verifyOtp({ email, token: code, type: "email_change" });
  if (error) throw new Error("验证码不正确或已过期，请重新绑定。");
}
