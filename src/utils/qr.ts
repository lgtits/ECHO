// QR code 產生（plan §7.1）：純前端、錯誤修正等級 M、四周留白 4 格；QR 裡只有網址。
import QRCode from 'qrcode';

const BASE = {
  errorCorrectionLevel: 'M',
  margin: 4,
  color: { dark: '#1E1E1C', light: '#FFFFFF' },
} as const;

export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { ...BASE, type: 'svg' });
}

export function qrPngDataUrl(text: string, width = 1024): Promise<string> {
  return QRCode.toDataURL(text, { ...BASE, width });
}

function download(href: string, filename: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function downloadPng(text: string, filename: string) {
  download(await qrPngDataUrl(text), filename);
}

export async function downloadSvg(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([await qrSvg(text)], { type: 'image/svg+xml' }));
  download(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
