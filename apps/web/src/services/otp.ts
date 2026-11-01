/** Supabase 全环境统一下发 6 位数字验证码：只校验 6 位纯数字。 */
export const OTP_CODE_PATTERN = /^\d{6}$/;

/** 输入框属性建议：maxLength 锁 6 位，配合客户端门禁（isValidOtpCode）做到"位数不够不可点"。 */
export const OTP_INPUT_PROPS = {
  inputMode: "numeric" as const,
  autoComplete: "one-time-code" as const,
  pattern: "[0-9]{6}",
  maxLength: 6,
};

/** 输入净化：去掉空格/连字符等非数字字符（用户从邮件复制时常带格式）。 */
export function normalizeOtpInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function isValidOtpCode(value: string): boolean {
  // 校验时只去非数字、不截断：5 位及以下、7 位及以上必须判为无效
  return OTP_CODE_PATTERN.test(value.replace(/\D/g, ""));
}

/** 输入验证码界面的固定提示（防预取 + 手动输码引导）。 */
export const OTP_INPUT_HINT =
  "为了您的安全，请手动复制并输入邮件中的纯数字验证码（6 位），不要点击邮件中的任何链接（如有）。如未收到，请检查垃圾邮件。";
