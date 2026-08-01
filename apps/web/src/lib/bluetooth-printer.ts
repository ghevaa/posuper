// ============================================================
// POS Yoga — Bluetooth Thermal Printer (ESC/POS)
// Compatible with: XP-58I and similar 58mm BLE thermal printers
// ============================================================

// ESC/POS Command Constants
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const CMD = {
  INIT: new Uint8Array([ESC, 0x40]),                    // Initialize printer
  ALIGN_LEFT: new Uint8Array([ESC, 0x61, 0x00]),        // Align left
  ALIGN_CENTER: new Uint8Array([ESC, 0x61, 0x01]),      // Align center
  ALIGN_RIGHT: new Uint8Array([ESC, 0x61, 0x02]),       // Align right
  BOLD_ON: new Uint8Array([ESC, 0x45, 0x01]),           // Bold on
  BOLD_OFF: new Uint8Array([ESC, 0x45, 0x00]),          // Bold off
  FONT_NORMAL: new Uint8Array([ESC, 0x21, 0x00]),       // Normal size
  FONT_DOUBLE_H: new Uint8Array([ESC, 0x21, 0x10]),     // Double height
  FONT_DOUBLE: new Uint8Array([ESC, 0x21, 0x30]),       // Double width+height
  SET_LINE_SPACING_LARGE: new Uint8Array([ESC, 0x33, 40]), // Spacious line spacing (40 dots)
  CUT: new Uint8Array([GS, 0x56, 0x00]),                // Full cut
  PARTIAL_CUT: new Uint8Array([GS, 0x56, 0x01]),        // Partial cut
  FEED_3: new Uint8Array([ESC, 0x64, 0x03]),            // Feed 3 lines
  FEED_5: new Uint8Array([ESC, 0x64, 0x05]),            // Feed 5 lines
  LINE: new Uint8Array([LF]),
};

// BLE Service & Characteristic UUIDs common for thermal printers
const PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Common BLE printer service
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Another common service
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Nordic UART
];
const PRINTER_CHAR_UUIDS = [
  '00002af1-0000-1000-8000-00805f9b34fb', // Common write characteristic
  '49535343-8841-43f4-a8d4-ecbe34729bb3', // Another common write char
  'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f', // Nordic UART TX
];

type PrinterTarget = 'cashier' | 'kitchen';

interface DesktopPrinterState {
  device: BluetoothDevice | null;
  char: BluetoothRemoteGATTCharacteristic | null;
  isConnected: boolean;
}

const desktopStates: Record<PrinterTarget, DesktopPrinterState> = {
  cashier: { device: null, char: null, isConnected: false },
  kitchen: { device: null, char: null, isConnected: false },
};

// --- Text Encoder ---
const textEncoder = new TextEncoder();

function encode(text: string): Uint8Array {
  return textEncoder.encode(text);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLen = arrays.reduce((acc, a) => acc + a.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// --- Connection ---

export function isBLESupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export function isPrinterConnected(target: PrinterTarget = 'cashier'): boolean {
  return desktopStates[target].isConnected && !!desktopStates[target].char;
}

export function getSavedDesktopPrinterName(target: PrinterTarget = 'cashier'): string | null {
  return desktopStates[target].device?.name || null;
}

// Internal: discover writable characteristic on a GATT server
async function discoverWriteChar(target: PrinterTarget, server: BluetoothRemoteGATTServer): Promise<boolean> {
  const services = await server.getPrimaryServices();

  for (const service of services) {
    try {
      const chars = await service.getCharacteristics();
      for (const char of chars) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          desktopStates[target].char = char;
          desktopStates[target].isConnected = true;
          console.log(`Printer ${target} connected: ${desktopStates[target].device?.name || 'Unknown'}, Service: ${service.uuid}, Char: ${char.uuid}`);
          return true;
        }
      }
    } catch {
      continue;
    }
  }
  return false;
}

// Try to silently reconnect to an already-paired device (no picker dialog)
async function tryReconnect(target: PrinterTarget): Promise<boolean> {
  const st = desktopStates[target];
  if (!st.device || !st.device.gatt) return false;

  try {
    const server = await st.device.gatt.connect();
    return await discoverWriteChar(target, server);
  } catch (err) {
    console.warn(`Silent reconnect for ${target} printer failed:`, err);
    return false;
  }
}

// Ensure printer is connected for specific slot
export async function ensureDesktopPrinterConnected(forcePicker = false): Promise<boolean> {
  return ensureDesktopPrinterConnectedSlot('cashier', forcePicker);
}

export async function ensureDesktopPrinterConnectedSlot(target: PrinterTarget = 'cashier', forcePicker = false): Promise<boolean> {
  // Already connected? Just return.
  if (!forcePicker && isPrinterConnected(target)) return true;

  // Try silent reconnect to previously paired device
  if (!forcePicker && desktopStates[target].device) {
    const ok = await tryReconnect(target);
    if (ok) return true;
  }

  // Fall back to picker dialog
  return connectPrinterSlot(target);
}

export async function connectPrinterSlot(target: PrinterTarget = 'cashier'): Promise<boolean> {
  if (!isBLESupported()) {
    throw new Error('Bluetooth tidak didukung di browser/app ini. Gunakan Chrome atau aplikasi Android.');
  }

  try {
    // Request device — user picks from dialog
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICE_UUIDS,
    });

    if (!device || !device.gatt) {
      throw new Error('Tidak ada printer yang dipilih');
    }

    desktopStates[target].device = device;

    // Listen for disconnect
    device.addEventListener('gattserverdisconnected', () => {
      desktopStates[target].isConnected = false;
      desktopStates[target].char = null;
      console.log(`Printer Bluetooth ${target} terputus`);
    });

    // Connect to GATT server
    const server = await device.gatt.connect();

    const found = await discoverWriteChar(target, server);
    if (!found) {
      throw new Error('Tidak ditemukan karakteristik tulis pada printer. Pastikan printer sudah menyala.');
    }
    return true;
  } catch (err: any) {
    desktopStates[target].isConnected = false;
    desktopStates[target].char = null;
    if (err.name === 'NotFoundError') {
      throw new Error('Tidak ada printer Bluetooth yang ditemukan. Pastikan printer sudah menyala dan mode Bluetooth aktif.');
    }
    throw err;
  }
}

export async function connectPrinter(): Promise<boolean> {
  return connectPrinterSlot('cashier');
}

export async function disconnectPrinterSlot(target: PrinterTarget = 'cashier'): Promise<void> {
  const st = desktopStates[target];
  if (st.device?.gatt?.connected) {
    st.device.gatt.disconnect();
  }
  desktopStates[target] = { device: null, char: null, isConnected: false };
}

export async function disconnectPrinter(): Promise<void> {
  await disconnectPrinterSlot('cashier');
  await disconnectPrinterSlot('kitchen');
}

// --- Send Data (chunked for BLE MTU limit) ---

async function sendDataToTarget(target: PrinterTarget, data: Uint8Array): Promise<void> {
  const st = desktopStates[target];
  if (!st.char) {
    throw new Error(`Printer ${target === 'cashier' ? 'Kasir' : 'Dapur'} belum terhubung`);
  }

  const CHUNK_SIZE = 100;
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    if (st.char.properties.writeWithoutResponse) {
      await st.char.writeValueWithoutResponse(chunk);
    } else {
      await st.char.writeValueWithResponse(chunk);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

// --- Format Helpers ---

const PAPER_WIDTH = 32; // Characters per line for 58mm printer

function padLine(left: string, right: string): string {
  const spaces = PAPER_WIDTH - left.length - right.length;
  return left + ' '.repeat(Math.max(1, spaces)) + right;
}

function centerText(text: string): string {
  const padding = Math.max(0, Math.floor((PAPER_WIDTH - text.length) / 2));
  return ' '.repeat(padding) + text;
}

function dashLine(): string {
  return '-'.repeat(PAPER_WIDTH);
}

function formatCurrency(amount: number): string {
  return 'Rp ' + amount.toLocaleString('id-ID');
}

// --- Receipt & Kitchen Printing ---

export interface ReceiptItem {
  name: string;
  qty: number;
  price: number;
  variantName?: string | null;
  note?: string | null;
}

export interface ReceiptData {
  storeName: string;
  invoiceNo: string;
  cashierName: string;
  items: ReceiptItem[];
  subtotal: number;
  discount?: number;
  total: number;
  paidAmount: number;
  changeAmount: number;
  paymentMethod: string;
  orderType?: 'dine_in' | 'take_away';
  tableNo?: string | null;
  note?: string | null;
  date: Date;
  paperSize?: '58mm' | '80mm';
}

export async function printReceipt(receipt: ReceiptData): Promise<void> {
  await ensureDesktopPrinterConnectedSlot('cashier');

  // 80mm = 48 chars/line, 58mm/50mm = 32 chars/line
  const paperWidth = receipt.paperSize === '58mm' ? 32 : 48;

  const padLine = (left: string, right: string): string => {
    const spaces = paperWidth - left.length - right.length;
    return left + ' '.repeat(Math.max(1, spaces)) + right;
  };

  const dashLine = (): string => '-'.repeat(paperWidth);
  const doubleLine = (): string => '='.repeat(paperWidth);

  const lines: Uint8Array[] = [];
  const addLine = (text: string) => {
    lines.push(encode(text + '\n'));
  };

  // Init & Line Spacing
  lines.push(CMD.INIT);
  lines.push(CMD.SET_LINE_SPACING_LARGE);

  // Top margin feed
  addLine('');
  addLine('');

  // Store header
  lines.push(CMD.ALIGN_CENTER);
  lines.push(CMD.FONT_DOUBLE_H);
  lines.push(CMD.BOLD_ON);
  addLine(receipt.storeName);
  lines.push(CMD.FONT_NORMAL);
  lines.push(CMD.BOLD_OFF);
  lines.push(CMD.LINE);

  // Invoice info
  lines.push(CMD.ALIGN_LEFT);
  addLine(doubleLine());
  addLine(`No Inv : ${receipt.invoiceNo}`);
  addLine(`Kasir  : ${receipt.cashierName}`);
  addLine(`Tgl    : ${receipt.date.toLocaleDateString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })} ${receipt.date.toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit',
  })}`);
  if (receipt.orderType) {
    const orderLabel = receipt.orderType === 'take_away' ? 'Bawa Pulang' : `Makan di Tempat${receipt.tableNo ? ` (Meja ${receipt.tableNo})` : ''}`;
    addLine(`Tipe   : ${orderLabel}`);
  }
  addLine(dashLine());
  addLine('');

  // Items
  for (const item of receipt.items) {
    const hasVariant = item.variantName && !item.name.toLowerCase().includes(`(${item.variantName.toLowerCase()})`);
    const itemName = hasVariant ? `${item.name} (${item.variantName})` : item.name;

    const displayName = itemName.length > paperWidth - 2
      ? itemName.substring(0, paperWidth - 5) + '...'
      : itemName;

    addLine(displayName);
    const qtyPrice = `  ${item.qty}x @${formatCurrency(item.price)}`;
    const lineTotal = formatCurrency(item.qty * item.price);
    addLine(padLine(qtyPrice, lineTotal));
    if (item.note) {
      addLine(`   Catatan: ${item.note}`);
    }
    addLine('');
  }

  addLine(dashLine());

  // Totals
  lines.push(CMD.BOLD_ON);
  if (receipt.discount && receipt.discount > 0) {
    addLine(padLine('Subtotal', formatCurrency(receipt.subtotal)));
    addLine(padLine('Diskon', '-' + formatCurrency(receipt.discount)));
  }
  addLine(padLine('TOTAL', formatCurrency(receipt.total)));
  lines.push(CMD.BOLD_OFF);

  const methodLabel = receipt.paymentMethod === 'cash'
    ? 'Tunai'
    : receipt.paymentMethod === 'qris'
    ? 'QRIS'
    : receipt.paymentMethod === 'transfer'
    ? 'Bank Transfer'
    : 'Non-Tunai';
  addLine(padLine('Bayar (' + methodLabel + ')', formatCurrency(receipt.paidAmount)));

  if (receipt.changeAmount > 0) {
    addLine(padLine('Kembalian', formatCurrency(receipt.changeAmount)));
  }

  addLine(doubleLine());

  // Footer
  lines.push(CMD.ALIGN_CENTER);
  addLine('Terima Kasih!');
  addLine('Selamat Menikmati');
  addLine(doubleLine());

  // 10 Extra Feed Lines so text is pushed completely past the printer tear bar
  addLine('');
  addLine('');
  addLine('');
  addLine('');
  addLine('');
  addLine('');
  addLine('');
  addLine('');
  addLine('');
  addLine('');
  lines.push(CMD.FEED_5);
  lines.push(CMD.PARTIAL_CUT);

  const receiptData = concat(...lines);
  await sendDataToTarget('cashier', receiptData);
}

// --- Kitchen Order Ticket Printing (58mm/50mm Dapur) ---
export interface KitchenTicketData {
  invoiceNo: string;
  cashierName: string;
  items: ReceiptItem[];
  orderType?: 'dine_in' | 'take_away';
  tableNo?: string | null;
  note?: string | null;
  date: Date;
  paperSize?: '58mm' | '80mm';
}

export async function printKitchenTicket(data: KitchenTicketData): Promise<void> {
  await ensureDesktopPrinterConnectedSlot('kitchen');

  const paperWidth = data.paperSize === '80mm' ? 48 : 32; // Default 58mm/50mm for kitchen
  const dashLine = (): string => '-'.repeat(paperWidth);
  const doubleLine = (): string => '='.repeat(paperWidth);

  const lines: Uint8Array[] = [];
  const addLine = (text: string) => {
    lines.push(encode(text + '\n'));
  };

  lines.push(CMD.INIT);
  lines.push(CMD.SET_LINE_SPACING_LARGE);

  // Top margin feed
  addLine('');
  addLine('');

  lines.push(CMD.ALIGN_CENTER);
  lines.push(CMD.FONT_DOUBLE);
  lines.push(CMD.BOLD_ON);
  const typeHeader = data.orderType === 'take_away'
    ? '*** BAWA PULANG ***'
    : `*** DINE IN ${data.tableNo ? `(MEJA ${data.tableNo})` : ''} ***`;
  addLine(typeHeader);
  lines.push(CMD.FONT_NORMAL);
  lines.push(CMD.BOLD_OFF);
  lines.push(CMD.LINE);

  lines.push(CMD.ALIGN_LEFT);
  addLine(doubleLine());
  addLine(`No Inv : ${data.invoiceNo}`);
  addLine(`Waktu  : ${data.date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`);
  if (data.cashierName) {
    addLine(`Kasir  : ${data.cashierName}`);
  }
  addLine(dashLine());
  addLine('');

  // Kitchen items in large text
  lines.push(CMD.BOLD_ON);
  for (const item of data.items) {
    const qtyText = `[ ${item.qty}x ] `;
    const hasVariant = item.variantName && !item.name.toLowerCase().includes(`(${item.variantName.toLowerCase()})`);
    const itemName = hasVariant ? `${item.name} (${item.variantName})` : item.name;
    addLine(qtyText + itemName);
    if (item.note) {
      addLine(`   * Catatan: ${item.note}`);
    }
    addLine('');
  }
  lines.push(CMD.BOLD_OFF);

  addLine(doubleLine());
  lines.push(CMD.ALIGN_CENTER);
  addLine('--- SOBEK DI SINI ---');
  addLine(doubleLine());

  // 10 Extra Feed Lines so text is pushed completely past the printer tear bar
  addLine('');
  addLine('');
  addLine('');
  addLine('');
  addLine('');
  addLine('');
  addLine('');
  addLine('');
  addLine('');
  addLine('');
  lines.push(CMD.FEED_5);
  lines.push(CMD.PARTIAL_CUT);

  const ticketData = concat(...lines);
  await sendDataToTarget('kitchen', ticketData);
}

// --- Shift Closing Report Printing ---
export interface ClosingReportData {
  storeName: string;
  cashierName: string;
  date: Date;
  totalTxCount: number;
  totalOmset: number;
  totalCash: number;
  totalQris: number;
  totalTransfer: number;
  totalNonCash: number;
  totalDiscount: number;
  paperSize?: '58mm' | '80mm';
}

export async function printClosingReport(report: ClosingReportData): Promise<void> {
  await ensureDesktopPrinterConnectedSlot('cashier');

  const paperWidth = report.paperSize === '80mm' ? 48 : 32;
  const padLine = (left: string, right: string): string => {
    const spaces = paperWidth - left.length - right.length;
    return left + ' '.repeat(Math.max(1, spaces)) + right;
  };

  const dashLine = (): string => '-'.repeat(paperWidth);
  const doubleLine = (): string => '='.repeat(paperWidth);

  const lines: Uint8Array[] = [];
  const addLine = (text: string) => {
    lines.push(encode(text + '\n'));
  };

  lines.push(CMD.INIT);
  lines.push(CMD.SET_LINE_SPACING_LARGE);

  addLine('');
  addLine('');

  lines.push(CMD.ALIGN_CENTER);
  lines.push(CMD.FONT_DOUBLE_H);
  lines.push(CMD.BOLD_ON);
  addLine('REKAP CLOSING KASIR');
  lines.push(CMD.FONT_NORMAL);
  lines.push(CMD.BOLD_OFF);
  addLine(report.storeName);
  lines.push(CMD.LINE);

  lines.push(CMD.ALIGN_LEFT);
  addLine(doubleLine());
  addLine(`Kasir : ${report.cashierName}`);
  addLine(`Tgl   : ${report.date.toLocaleDateString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })} ${report.date.toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit',
  })}`);
  addLine(dashLine());
  addLine('');

  lines.push(CMD.BOLD_ON);
  addLine(padLine('TOTAL OMSET', formatCurrency(report.totalOmset)));
  addLine(padLine('Total Transaksi', String(report.totalTxCount) + ' Tx'));
  lines.push(CMD.BOLD_OFF);
  addLine(dashLine());

  addLine(padLine('Tunai (Cash)', formatCurrency(report.totalCash)));
  addLine(padLine('QRIS', formatCurrency(report.totalQris)));
  addLine(padLine('Bank Transfer', formatCurrency(report.totalTransfer)));
  addLine(padLine('Total Non-Tunai', formatCurrency(report.totalNonCash)));
  addLine(dashLine());

  if (report.totalDiscount > 0) {
    addLine(padLine('Total Diskon', formatCurrency(report.totalDiscount)));
    addLine(dashLine());
  }

  addLine(doubleLine());
  lines.push(CMD.ALIGN_CENTER);
  addLine('--- LAPORAN SHIFT CLOSING ---');
  addLine(doubleLine());

  addLine('');
  addLine('');
  addLine('');
  addLine('');
  addLine('');
  addLine('');
  addLine('');
  addLine('');
  addLine('');
  addLine('');
  lines.push(CMD.FEED_5);
  lines.push(CMD.PARTIAL_CUT);

  const reportData = concat(...lines);
  await sendDataToTarget('cashier', reportData);
}

// --- Quick Test Print ---
export async function testPrint(target: PrinterTarget = 'cashier'): Promise<void> {
  await ensureDesktopPrinterConnectedSlot(target);

  const data = concat(
    CMD.INIT,
    CMD.ALIGN_CENTER,
    CMD.BOLD_ON,
    encode('=== TEST PRINT ===\n'),
    CMD.BOLD_OFF,
    encode(`Printer ${target === 'cashier' ? 'Kasir' : 'Dapur'} Ready!\n`),
    encode('\n'),
    CMD.FEED_3,
    CMD.PARTIAL_CUT,
  );

  await sendDataToTarget(target, data);
}
