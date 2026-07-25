// ============================================================
// POS Yoga — Receipt Text Generator (for clipboard/share)
// ============================================================

interface ReceiptTextItem {
  productName?: string;
  name?: string;
  qty: number;
  price?: number;
  variantName?: string | null;
}

interface ReceiptTextData {
  storeName?: string;
  invoiceNo: string;
  cashierName?: string;
  items: ReceiptTextItem[];
  subtotal?: number;
  total?: number;
  paidAmount?: number;
  changeAmount?: number;
  paymentMethod?: string;
  date: Date;
}

interface KitchenTicketTextData {
  invoiceNo: string;
  items: { productName: string; variantName?: string | null; qty: number }[];
  date: Date;
}

function formatCurrency(amount: number): string {
  return 'Rp ' + amount.toLocaleString('id-ID');
}

function padLine(left: string, right: string, width: number = 32): string {
  const spaces = width - left.length - right.length;
  return left + ' '.repeat(Math.max(1, spaces)) + right;
}

function dashLine(width: number = 32): string {
  return '-'.repeat(width);
}

/**
 * Generate receipt text for clipboard (cashier receipt)
 */
export function generateReceiptText(data: ReceiptTextData): string {
  const w = 32;
  const lines: string[] = [];

  lines.push((data.storeName || "D'Mac Chicken Crunch").padStart(Math.floor((w + (data.storeName || "D'Mac Chicken Crunch").length) / 2)));
  lines.push('');
  lines.push(dashLine(w));
  lines.push(`No: ${data.invoiceNo}`);
  if (data.cashierName) lines.push(`Kasir: ${data.cashierName}`);
  lines.push(`Tgl: ${data.date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${data.date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`);
  lines.push(dashLine(w));

  for (const item of data.items) {
    const name = item.productName || item.name || '';
    const itemName = item.variantName ? `${name} (${item.variantName})` : name;
    lines.push(itemName);
    const qtyPrice = `  ${item.qty}x ${formatCurrency(item.price || 0)}`;
    const lineTotal = formatCurrency(item.qty * (item.price || 0));
    lines.push(padLine(qtyPrice, lineTotal, w));
  }

  lines.push(dashLine(w));

  if (data.total !== undefined) {
    lines.push(padLine('TOTAL', formatCurrency(data.total), w));
  }
  if (data.paidAmount !== undefined) {
    const methodLabel = data.paymentMethod === 'cash' ? 'Tunai' : 'Online';
    lines.push(padLine(`Bayar (${methodLabel})`, formatCurrency(data.paidAmount), w));
  }
  if (data.changeAmount !== undefined && data.changeAmount > 0) {
    lines.push(padLine('Kembalian', formatCurrency(data.changeAmount), w));
  }

  lines.push(dashLine(w));
  lines.push('');
  lines.push('      Terima Kasih!');
  lines.push('    Selamat Menikmati');

  return lines.join('\n');
}

/**
 * Generate kitchen ticket text for clipboard (no prices!)
 */
export function generateKitchenTicketText(data: KitchenTicketTextData): string {
  const lines: string[] = [];

  lines.push('*** NOTA DAPUR ***');
  lines.push('');
  lines.push('--------------------------------');
  lines.push(`No Inv: ${data.invoiceNo}`);
  lines.push(`Waktu : ${data.date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`);
  lines.push('--------------------------------');

  for (const item of data.items) {
    const itemName = item.variantName ? `${item.productName} (${item.variantName})` : item.productName;
    lines.push(`[ ${item.qty}x ] ${itemName}`);
  }

  lines.push('--------------------------------');

  return lines.join('\n');
}
