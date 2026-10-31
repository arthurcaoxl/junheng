export const LEGACY_DOMAIN_HOSTNAME = "rtrzqrxly4mlo.ok.kimi.link";
export const CURRENT_DOMAIN_ORIGIN = "https://junheng.ok.kimi.link";

export function shouldRedirectLegacyDomain(hostname: string): boolean {
  return hostname.toLowerCase() === LEGACY_DOMAIN_HOSTNAME;
}

export function getDomainRedirectUrl(hostname: string, pathname: string, search: string): string | null {
  if (!shouldRedirectLegacyDomain(hostname)) return null;
  return `${CURRENT_DOMAIN_ORIGIN}${pathname}${search}`;
}
