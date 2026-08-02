// ============================================================
// POS Yoga — Native Bluetooth Printer (Capacitor BLE)
// Uses @capacitor-community/bluetooth-le for REAL Bluetooth
// printing on Android with Auto-Reconnect (no re-scan needed!)
// ============================================================

import { BleClient, numbersToDataView } from '@capacitor-community/bluetooth-le';
import type { ReceiptItem, ReceiptData, KitchenTicketData, ClosingReportData } from './bluetooth-printer';
export type { ReceiptItem, ReceiptData, KitchenTicketData, ClosingReportData };

// ESC/POS Command Constants
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const CMD = {
  INIT: [ESC, 0x40],
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  FONT_NORMAL: [ESC, 0x21, 0x00],
  FONT_DOUBLE_H: [ESC, 0x21, 0x10],
  FONT_DOUBLE: [ESC, 0x21, 0x30],
  SET_LINE_SPACING_COMPACT: [ESC, 0x33, 26],
  CUT: [GS, 0x56, 0x00],
  PARTIAL_CUT: [GS, 0x56, 0x01],
  FEED_3: [ESC, 0x64, 0x03],
  FEED_5: [ESC, 0x64, 0x05],
  LINE: [LF],
};

// Common BLE service/characteristic UUIDs for thermal printers
const KNOWN_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];

type PrinterTarget = 'cashier' | 'kitchen';

const SAVED_KEYS: Record<PrinterTarget, { id: string; name: string }> = {
  cashier: { id: 'pos_printer_cashier_id', name: 'pos_printer_cashier_name' },
  kitchen: { id: 'pos_printer_kitchen_id', name: 'pos_printer_kitchen_name' },
};

// Fallback legacy keys migration
if (localStorage.getItem('pos_saved_printer_id') && !localStorage.getItem('pos_printer_cashier_id')) {
  localStorage.setItem('pos_printer_cashier_id', localStorage.getItem('pos_saved_printer_id')!);
  if (localStorage.getItem('pos_saved_printer_name')) {
    localStorage.setItem('pos_printer_cashier_name', localStorage.getItem('pos_saved_printer_name')!);
  }
}

// State per target
interface PrinterState {
  deviceId: string | null;
  writeServiceUuid: string | null;
  writeCharUuid: string | null;
}

const states: Record<PrinterTarget, PrinterState> = {
  cashier: { deviceId: null, writeServiceUuid: null, writeCharUuid: null },
  kitchen: { deviceId: null, writeServiceUuid: null, writeCharUuid: null },
};

let initialized = false;

const textEncoder = new TextEncoder();

function encode(text: string): number[] {
  return Array.from(textEncoder.encode(text));
}

// --- Initialize BLE ---
async function ensureInitialized(): Promise<void> {
  if (!initialized) {
    await BleClient.initialize({ androidNeverForLocation: true });
    initialized = true;
  }
}

export function getSavedPrinterName(target: PrinterTarget = 'cashier'): string | null {
  return localStorage.getItem(SAVED_KEYS[target].name);
}

export function isNativePrinterConnected(target: PrinterTarget = 'cashier'): boolean {
  const st = states[target];
  return !!st.deviceId && !!st.writeServiceUuid && !!st.writeCharUuid;
}

// Connect directly to a specific deviceId (silent auto-reconnect)
async function connectToDeviceId(target: PrinterTarget, deviceId: string, name?: string): Promise<boolean> {
  await ensureInitialized();

  try {
    await BleClient.connect(deviceId, (disconnectedId) => {
      console.log(`Printer ${target} disconnected: ${disconnectedId}`);
      if (states[target].deviceId === disconnectedId) {
        states[target] = { deviceId: null, writeServiceUuid: null, writeCharUuid: null };
      }
    });

    const services = await BleClient.getServices(deviceId);
    let foundService: string | null = null;
    let foundChar: string | null = null;

    for (const service of services) {
      for (const char of service.characteristics) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          foundService = service.uuid;
          foundChar = char.uuid;
          break;
        }
      }
      if (foundChar) break;
    }

    if (!foundService || !foundChar) {
      await BleClient.disconnect(deviceId);
      return false;
    }

    states[target] = {
      deviceId,
      writeServiceUuid: foundService,
      writeCharUuid: foundChar,
    };

    if (name) localStorage.setItem(SAVED_KEYS[target].name, name);
    localStorage.setItem(SAVED_KEYS[target].id, deviceId);
    return true;
  } catch (err) {
    console.warn(`Auto-reconnect to saved ${target} printer failed:`, err);
    return false;
  }
}

export async function connectNativePrinter(target: PrinterTarget = 'cashier'): Promise<string> {
  return ensureNativePrinterConnectedSlot(target, true);
}

export async function ensureNativePrinterConnected(forcePicker = false): Promise<string> {
  return ensureNativePrinterConnectedSlot('cashier', forcePicker);
}

// Ensure connection for specific slot (cashier or kitchen)
export async function ensureNativePrinterConnectedSlot(target: PrinterTarget = 'cashier', forcePicker = false): Promise<string> {
  if (!forcePicker && isNativePrinterConnected(target)) {
    return localStorage.getItem(SAVED_KEYS[target].name) || states[target].deviceId || `Printer ${target}`;
  }

  const savedId = localStorage.getItem(SAVED_KEYS[target].id);
  const savedName = localStorage.getItem(SAVED_KEYS[target].name);

  if (!forcePicker && savedId) {
    const success = await connectToDeviceId(target, savedId, savedName || undefined);
    if (success) {
      return savedName || savedId;
    }
  }

  // If no saved device OR direct connect failed OR forcePicker is true: prompt picker!
  await ensureInitialized();

  if (states[target].deviceId) {
    try { await BleClient.disconnect(states[target].deviceId!); } catch {}
    states[target] = { deviceId: null, writeServiceUuid: null, writeCharUuid: null };
  }

  const device = await BleClient.requestDevice({
    optionalServices: KNOWN_SERVICE_UUIDS,
  });

  if (!device) {
    throw new Error('Tidak ada printer yang dipilih');
  }

  const printerName = device.name || device.deviceId;
  const success = await connectToDeviceId(target, device.deviceId, printerName);
  if (!success) {
    throw new Error('Tidak dapat terhubung atau tidak ditemukan karakteristik tulis pada printer');
  }

  return printerName;
}

export async function disconnectNativePrinterSlot(target: PrinterTarget = 'cashier'): Promise<void> {
  const currentId = states[target].deviceId;
  if (currentId) {
    try {
      await BleClient.disconnect(currentId);
    } catch {}
  }
  states[target] = { deviceId: null, writeServiceUuid: null, writeCharUuid: null };
  localStorage.removeItem(SAVED_KEYS[target].id);
  localStorage.removeItem(SAVED_KEYS[target].name);
}

export function forgetSavedPrinter(target: PrinterTarget = 'cashier'): void {
  disconnectNativePrinterSlot(target);
}

export async function disconnectNativePrinter(): Promise<void> {
  await disconnectNativePrinterSlot('cashier');
  await disconnectNativePrinterSlot('kitchen');
}

// --- Send data (chunked) ---
async function sendDataToTarget(target: PrinterTarget, data: number[]): Promise<void> {
  const st = states[target];
  if (!st.deviceId || !st.writeServiceUuid || !st.writeCharUuid) {
    throw new Error(`Printer ${target === 'cashier' ? 'Kasir' : 'Dapur'} belum dikoneksikan`);
  }

  const CHUNK_SIZE = 100;
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    await BleClient.write(
      st.deviceId,
      st.writeServiceUuid,
      st.writeCharUuid,
      numbersToDataView(chunk),
    );
    await new Promise((r) => setTimeout(r, 30));
  }
}

// --- Format Helpers ---
function formatCurrency(amount: number): string {
  return 'Rp ' + amount.toLocaleString('id-ID');
}

// --- Print Receipt ---
export async function nativePrintReceipt(receipt: ReceiptData): Promise<void> {
  await ensureNativePrinterConnectedSlot('cashier');

  const paperWidth = receipt.paperSize === '58mm' ? 32 : 48;

  const padLine = (left: string, right: string): string => {
    const spaces = paperWidth - left.length - right.length;
    return left + ' '.repeat(Math.max(1, spaces)) + right;
  };
  const dashLine = (): string => '-'.repeat(paperWidth);
  const doubleLine = (): string => '='.repeat(paperWidth);

  const data: number[] = [];
  const addCmd = (cmd: number[]) => data.push(...cmd);
  const addLine = (text: string) => data.push(...encode(text + '\n'));

  // Init & Line Spacing
  addCmd(CMD.INIT);
  addCmd(CMD.SET_LINE_SPACING_COMPACT);

  // Top margin feed
  addLine('');

  // Store header
  addCmd(CMD.ALIGN_CENTER);
  addCmd(CMD.FONT_DOUBLE_H);
  addCmd(CMD.BOLD_ON);
  addLine(receipt.storeName);
  addCmd(CMD.FONT_NORMAL);
  addCmd(CMD.BOLD_OFF);
  addCmd(CMD.LINE);

  // Invoice info
  addCmd(CMD.ALIGN_LEFT);
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
  }

  addLine(dashLine());

  // Totals
  addCmd(CMD.BOLD_ON);
  if (receipt.discount && receipt.discount > 0) {
    addLine(padLine('Subtotal', formatCurrency(receipt.subtotal)));
    addLine(padLine('Diskon', '-' + formatCurrency(receipt.discount)));
  }
  addLine(padLine('TOTAL', formatCurrency(receipt.total)));
  addCmd(CMD.BOLD_OFF);

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
  addCmd(CMD.ALIGN_CENTER);
  addLine('Terima Kasih!');
  addLine('Selamat Menikmati');
  addLine(doubleLine());

  // 3 Feed Lines to push text past tear bar
  addLine('');
  addLine('');
  addLine('');
  addCmd(CMD.FEED_3);
  addCmd(CMD.PARTIAL_CUT);

  await sendDataToTarget('cashier', data);
}

// --- Print Kitchen Ticket ---
export async function nativePrintKitchenTicket(ticket: KitchenTicketData): Promise<void> {
  await ensureNativePrinterConnectedSlot('kitchen');

  const paperWidth = ticket.paperSize === '80mm' ? 48 : 32;
  const dashLine = (): string => '-'.repeat(paperWidth);
  const doubleLine = (): string => '='.repeat(paperWidth);

  const data: number[] = [];
  const addCmd = (cmd: number[]) => data.push(...cmd);
  const addLine = (text: string) => data.push(...encode(text + '\n'));

  addCmd(CMD.INIT);
  addCmd(CMD.SET_LINE_SPACING_COMPACT);

  // Top margin feed
  addLine('');

  addCmd(CMD.ALIGN_CENTER);
  addCmd(CMD.FONT_DOUBLE);
  addCmd(CMD.BOLD_ON);
  const typeHeader = ticket.orderType === 'take_away'
    ? '*** BAWA PULANG ***'
    : `*** DINE IN ${ticket.tableNo ? `(MEJA ${ticket.tableNo})` : ''} ***`;
  addLine(typeHeader);
  addCmd(CMD.FONT_NORMAL);
  addCmd(CMD.BOLD_OFF);
  addCmd(CMD.LINE);

  addCmd(CMD.ALIGN_LEFT);
  addLine(doubleLine());
  addLine(`No Inv : ${ticket.invoiceNo}`);
  addLine(`Waktu  : ${ticket.date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`);
  if (ticket.cashierName) {
    addLine(`Kasir  : ${ticket.cashierName}`);
  }
  addLine(dashLine());

  addCmd(CMD.BOLD_ON);
  for (const item of ticket.items) {
    const qtyText = `[ ${item.qty}x ] `;
    const hasVariant = item.variantName && !item.name.toLowerCase().includes(`(${item.variantName.toLowerCase()})`);
    const itemName = hasVariant ? `${item.name} (${item.variantName})` : item.name;
    addLine(qtyText + itemName);
    if (item.note) {
      addLine(`   * Catatan: ${item.note}`);
    }
  }
  addCmd(CMD.BOLD_OFF);

  addLine(doubleLine());
  addCmd(CMD.ALIGN_CENTER);
  addLine('--- SOBEK DI SINI ---');
  addLine(doubleLine());

  // 3 Feed Lines to push text past tear bar
  addLine('');
  addLine('');
  addLine('');
  addCmd(CMD.FEED_3);
  addCmd(CMD.PARTIAL_CUT);

  await sendDataToTarget('kitchen', data);
}

// --- Native Shift Closing Report Printing ---
export async function nativePrintClosingReport(report: ClosingReportData): Promise<void> {
  await ensureNativePrinterConnectedSlot('cashier');

  const paperWidth = report.paperSize === '80mm' ? 48 : 32;
  const padLine = (left: string, right: string): string => {
    const spaces = paperWidth - left.length - right.length;
    return left + ' '.repeat(Math.max(1, spaces)) + right;
  };

  const dashLine = (): string => '-'.repeat(paperWidth);
  const doubleLine = (): string => '='.repeat(paperWidth);

  const data: number[] = [];
  const addCmd = (cmd: number[]) => data.push(...cmd);
  const addLine = (text: string) => data.push(...encode(text + '\n'));

  addCmd(CMD.INIT);
  addCmd(CMD.SET_LINE_SPACING_COMPACT);

  addLine('');

  addCmd(CMD.ALIGN_CENTER);
  addCmd(CMD.FONT_DOUBLE_H);
  addCmd(CMD.BOLD_ON);
  addLine('REKAP CLOSING KASIR');
  addCmd(CMD.FONT_NORMAL);
  addCmd(CMD.BOLD_OFF);
  addLine(report.storeName);
  addCmd(CMD.LINE);

  addCmd(CMD.ALIGN_LEFT);
  addLine(doubleLine());
  addLine(`Kasir : ${report.cashierName}`);
  addLine(`Tgl   : ${report.date.toLocaleDateString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })} ${report.date.toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit',
  })}`);
  addLine(dashLine());

  addCmd(CMD.BOLD_ON);
  addLine(padLine('TOTAL OMSET', formatCurrency(report.totalOmset)));
  addLine(padLine('Total Transaksi', String(report.totalTxCount) + ' Tx'));
  addCmd(CMD.BOLD_OFF);
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
  addCmd(CMD.ALIGN_CENTER);
  addLine('--- LAPORAN SHIFT CLOSING ---');
  addLine(doubleLine());

  addLine('');
  addLine('');
  addLine('');
  addCmd(CMD.FEED_3);
  addCmd(CMD.PARTIAL_CUT);

  await sendDataToTarget('cashier', data);
}

// --- Test Print ---
export async function nativeTestPrint(target: PrinterTarget = 'cashier'): Promise<void> {
  await ensureNativePrinterConnectedSlot(target);

  const data: number[] = [];
  data.push(...CMD.INIT);
  data.push(...CMD.ALIGN_CENTER);
  data.push(...CMD.BOLD_ON);
  data.push(...encode('=== TEST PRINT ===\n'));
  data.push(...CMD.BOLD_OFF);
  data.push(...encode(`Printer ${target === 'cashier' ? 'Kasir' : 'Dapur'} Ready!\n`));
  data.push(...encode('\n'));
  data.push(...CMD.FEED_3);
  data.push(...CMD.PARTIAL_CUT);

  await sendDataToTarget(target, data);
}
