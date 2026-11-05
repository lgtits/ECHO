/**
 * 組出場次的會友網址，QR code 與分享連結都用它（plan §7.1）。
 * 一律以 SITE_URL 為準，不用 window.location，
 * 這樣從 github.io、本機或自訂網域開後台，QR 都指向正式網址。
 */
export function buildSessionUrl(siteUrl: string, code: string): string {
  const base = siteUrl.replace(/\/+$/, '');
  return `${base}/s/${encodeURIComponent(code.toUpperCase())}`;
}

/** 固定入口：永遠導向目前開放中的場次（AC1.7） */
export function buildNowUrl(siteUrl: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/now`;
}
