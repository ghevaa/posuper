// ============================================================
// POS Yoga — ESC/POS Printer Utility
// ============================================================

// This is a formatter utility. Actual printing happens via:
// - Desktop: Tauri native plugin or browser Web Print API
// - Network: Direct socket to printer IP

export interface ReceiptData {
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  invoiceNo: string;
  cashierName: string;
  date: string;
  items: { name: string; qty: number; price: number; subtotal: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paidAmount: number;
  changeAmount: number;
  footer?: string;
}

export interface KitchenTicketData {
  invoiceNo: string;
  date: string;
  items: { name: string; qty: number; note?: string }[];
}

const LINE_WIDTH = 48; // 80mm paper

function center(text: string): string {
  const pad = Math.max(0, Math.floor((LINE_WIDTH - text.length) / 2));
  return ' '.repeat(pad) + text;
}

function leftRight(left: string, right: string): string {
  const space = LINE_WIDTH - left.length - right.length;
  return left + ' '.repeat(Math.max(1, space)) + right;
}

function separator(): string {
  return '-'.repeat(LINE_WIDTH);
}

function formatCurrency(amount: number): string {
  return `Rp${amount.toLocaleString('id-ID')}`;
}

// Format receipt for text-based printing
export function formatReceipt(data: ReceiptData): string {
  const lines: string[] = [];

  lines.push(center(data.storeName));
  if (data.storeAddress) lines.push(center(data.storeAddress));
  if (data.storePhone) lines.push(center(data.storePhone));
  lines.push(separator());
  lines.push(leftRight('No:', data.invoiceNo));
  lines.push(leftRight('Kasir:', data.cashierName));
  lines.push(leftRight('Tanggal:', data.date));
  lines.push(separator());

  for (const item of data.items) {
    lines.push(item.name);
    lines.push(leftRight(
      `  ${item.qty} x ${formatCurrency(item.price)}`,
      formatCurrency(item.subtotal),
    ));
  }

  lines.push(separator());
  lines.push(leftRight('Subtotal', formatCurrency(data.subtotal)));
  if (data.discount > 0) lines.push(leftRight('Diskon', `-${formatCurrency(data.discount)}`));
  if (data.tax > 0) lines.push(leftRight('Pajak', formatCurrency(data.tax)));
  lines.push(separator());
  lines.push(leftRight('TOTAL', formatCurrency(data.total)));
  lines.push(leftRight('Bayar', formatCurrency(data.paidAmount)));
  lines.push(leftRight('Kembali', formatCurrency(data.changeAmount)));
  lines.push(separator());

  if (data.footer) {
    lines.push(center(data.footer));
  }
  lines.push(center('Terima Kasih'));
  lines.push('');
  lines.push('');

  return lines.join('\n');
}

// Format kitchen ticket
export function formatKitchenTicket(data: KitchenTicketData): string {
  const lines: string[] = [];

  lines.push(center('== PESANAN DAPUR =='));
  lines.push(separator());
  lines.push(leftRight('No:', data.invoiceNo));
  lines.push(leftRight('Waktu:', data.date));
  lines.push(separator());

  for (const item of data.items) {
    lines.push(`${item.qty}x  ${item.name}`);
    if (item.note) lines.push(`     Catatan: ${item.note}`);
  }

  lines.push(separator());
  lines.push('');
  lines.push('');

  return lines.join('\n');
}
