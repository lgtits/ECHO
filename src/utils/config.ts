/** 正式網址（plan §7.1）：未設定 QCLI_SITE_URL 時，退回目前網址＋網站路徑，方便本機與原型走查 */
export function siteUrl(): string {
  const env = import.meta.env.QCLI_SITE_URL;
  if (env) return env.replace(/\/+$/, '');
  const base = (import.meta.env.QUASAR_VUE_ROUTER_BASE ?? '/').replace(/\/+$/, '');
  return `${window.location.origin}${base}`;
}

/** 顯示用：去掉 https:// */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '');
}
