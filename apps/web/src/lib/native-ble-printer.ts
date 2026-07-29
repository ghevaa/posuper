// ============================================================
// POS Yoga — Native Bluetooth Printer (Capacitor BLE)
// Uses @capacitor-community/bluetooth-le for REAL Bluetooth
// printing on Android with Auto-Reconnect (no re-scan needed!)
// ============================================================

import { BleClient, numbersToDataView } from '@capacitor-community/bluetooth-le';

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

const SAVED_DEVICE_KEY = 'pos_saved_printer_id';
const SAVED_DEVICE_NAME = 'pos_saved_printer_name';

// State
let connectedDeviceId: string | null = null;
let writeServiceUuid: string | null = null;
let writeCharUuid: string | null = null;
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

export function getSavedPrinterName(): string | null {
  return localStorage.getItem(SAVED_DEVICE_NAME);
}

export function isNativePrinterConnected(): boolean {
  return !!connectedDeviceId && !!writeServiceUuid && !!writeCharUuid;
}

// Connect directly to a specific deviceId (silent auto-reconnect)
async function connectToDeviceId(deviceId: string, name?: string): Promise<boolean> {
  await ensureInitialized();

  try {
    await BleClient.connect(deviceId, (disconnectedId) => {
      console.log(`Printer disconnected: ${disconnectedId}`);
      if (connectedDeviceId === disconnectedId) {
        connectedDeviceId = null;
        writeServiceUuid = null;
        writeCharUuid = null;
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

    connectedDeviceId = deviceId;
    writeServiceUuid = foundService;
    writeCharUuid = foundChar;
    if (name) localStorage.setItem(SAVED_DEVICE_NAME, name);
    localStorage.setItem(SAVED_DEVICE_KEY, deviceId);
    return true;
  } catch (err) {
    console.warn('Auto-reconnect to saved printer failed:', err);
    return false;
  }
}

export async function connectNativePrinter(): Promise<string> {
  return ensureNativePrinterConnected(true);
}

// Ensure connection (uses saved printer if available, otherwise prompts picker)
export async function ensureNativePrinterConnected(forcePicker = false): Promise<string> {
  if (!forcePicker && isNativePrinterConnected()) {
    return localStorage.getItem(SAVED_DEVICE_NAME) || connectedDeviceId || 'Printer';
  }

  const savedId = localStorage.getItem(SAVED_DEVICE_KEY);
  const savedName = localStorage.getItem(SAVED_DEVICE_NAME);

  if (!forcePicker && savedId) {
    const success = await connectToDeviceId(savedId, savedName || undefined);
    if (success) {
      return savedName || savedId;
    }
  }

  // If no saved device OR direct connect failed OR forcePicker is true: prompt picker!
  await ensureInitialized();

  if (connectedDeviceId) {
    try { await BleClient.disconnect(connectedDeviceId); } catch {}
    connectedDeviceId = null;
  }

  const device = await BleClient.requestDevice({
    optionalServices: KNOWN_SERVICE_UUIDS,
  });

  if (!device) {
    throw new Error('Tidak ada printer yang dipilih');
  }

  const printerName = device.name || device.deviceId;
  const success = await connectToDeviceId(device.deviceId, printerName);
  if (!success) {
    throw new Error('Tidak dapat terhubung atau tidak ditemukan karakteristik tulis pada printer');
  }

  return printerName;
}

export async function disconnectNativePrinter(): Promise<void> {
  if (connectedDeviceId) {
    try {
      await BleClient.disconnect(connectedDeviceId);
    } catch {}
  }
  connectedDeviceId = null;
  writeServiceUuid = null;
  writeCharUuid = null;
}

export function forgetSavedPrinter(): void {
  disconnectNativePrinter();
  localStorage.removeItem(SAVED_DEVICE_KEY);
  localStorage.removeItem(SAVED_DEVICE_NAME);
}

// --- Send data (chunked) ---
async function sendData(data: number[]): Promise<void> {
  if (!connectedDeviceId || !writeServiceUuid || !writeCharUuid) {
    throw new Error('Printer tidak terhubung');
  }

  const CHUNK_SIZE = 100;
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    await BleClient.write(
      connectedDeviceId,
      writeServiceUuid,
      writeCharUuid,
      numbersToDataView(chunk),
    );
    await new Promise((r) => setTimeout(r, 30));
  }
}

// --- Format Helpers ---
function formatCurrency(amount: number): string {
  return 'Rp ' + amount.toLocaleString('id-ID');
}

// --- Receipt Data Types ---
export interface ReceiptItem {
  name: string;
  qty: number;
  price: number;
  variantName?: string | null;
}

export interface ReceiptData {
  storeName: string;
  invoiceNo: string;
  cashierName: string;
  items: ReceiptItem[];
  subtotal: number;
  total: number;
  paidAmount: number;
  changeAmount: number;
  paymentMethod: string;
  date: Date;
  paperSize?: '58mm' | '80mm';
}

export interface KitchenTicketData {
  invoiceNo: string;
  cashierName: string;
  items: ReceiptItem[];
  date: Date;
  paperSize?: '58mm' | '80mm';
}

// --- Print Receipt ---
export async function nativePrintReceipt(receipt: ReceiptData): Promise<void> {
  await ensureNativePrinterConnected();

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

  // Init
  addCmd(CMD.INIT);

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
  }

  addLine(dashLine());

  // Totals
  addCmd(CMD.BOLD_ON);
  addLine(padLine('TOTAL', formatCurrency(receipt.total)));
  addCmd(CMD.BOLD_OFF);

  const methodLabel = receipt.paymentMethod === 'cash' ? 'Tunai' : 'Online';
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

  // Extra Feed Lines so text is pushed past the printer tear bar
  addLine('');
  addLine('');
  addLine('');
  addLine('');
  addCmd(CMD.FEED_5);
  addCmd(CMD.PARTIAL_CUT);

  await sendData(data);
}

// --- Print Kitchen Ticket ---
export async function nativePrintKitchenTicket(ticket: KitchenTicketData): Promise<void> {
  await ensureNativePrinterConnected();

  const paperWidth = ticket.paperSize === '80mm' ? 48 : 32;
  const dashLine = (): string => '-'.repeat(paperWidth);
  const doubleLine = (): string => '='.repeat(paperWidth);

  const data: number[] = [];
  const addCmd = (cmd: number[]) => data.push(...cmd);
  const addLine = (text: string) => data.push(...encode(text + '\n'));

  addCmd(CMD.INIT);
  addCmd(CMD.ALIGN_CENTER);
  addCmd(CMD.FONT_DOUBLE);
  addCmd(CMD.BOLD_ON);
  addLine('*** NOTA DAPUR ***');
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
  }
  addCmd(CMD.BOLD_OFF);

  addLine(doubleLine());
  addCmd(CMD.ALIGN_CENTER);
  addLine('--- SOBEK DI SINI ---');
  addLine(doubleLine());

  // Extra Feed Lines so text is pushed past the printer tear bar
  addLine('');
  addLine('');
  addLine('');
  addLine('');
  addCmd(CMD.FEED_5);
  addCmd(CMD.PARTIAL_CUT);

  await sendData(data);
}

// --- Test Print ---
export async function nativeTestPrint(): Promise<void> {
  await ensureNativePrinterConnected();

  const data: number[] = [];
  data.push(...CMD.INIT);
  data.push(...CMD.ALIGN_CENTER);
  data.push(...CMD.BOLD_ON);
  data.push(...encode('=== TEST PRINT ===\n'));
  data.push(...CMD.BOLD_OFF);
  data.push(...encode('Printer terhubung!\n'));
  data.push(...encode('POS Yoga Ready\n'));
  data.push(...encode('\n'));
  data.push(...CMD.FEED_3);
  data.push(...CMD.PARTIAL_CUT);

  await sendData(data);
}
