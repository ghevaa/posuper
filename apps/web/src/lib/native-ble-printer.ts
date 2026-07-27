// ============================================================
// POS Yoga — Native Bluetooth Printer (Capacitor BLE)
// Uses @capacitor-community/bluetooth-le for REAL Bluetooth
// printing on Android (inside Capacitor WebView)
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

// --- Scan & Connect ---
export async function connectNativePrinter(): Promise<string> {
  await ensureInitialized();

  // Disconnect previous if any
  if (connectedDeviceId) {
    try {
      await BleClient.disconnect(connectedDeviceId);
    } catch {}
    connectedDeviceId = null;
  }

  // Request device - shows native Android BLE picker
  const device = await BleClient.requestDevice({
    optionalServices: KNOWN_SERVICE_UUIDS,
  });

  if (!device) {
    throw new Error('Tidak ada printer yang dipilih');
  }

  // Connect
  await BleClient.connect(device.deviceId, (deviceId) => {
    console.log(`Printer disconnected: ${deviceId}`);
    if (connectedDeviceId === deviceId) {
      connectedDeviceId = null;
      writeServiceUuid = null;
      writeCharUuid = null;
    }
  });

  // Discover services & find writable characteristic
  const services = await BleClient.getServices(device.deviceId);

  let foundService: string | null = null;
  let foundChar: string | null = null;

  for (const service of services) {
    for (const char of service.characteristics) {
      if (
        char.properties.write ||
        char.properties.writeWithoutResponse
      ) {
        foundService = service.uuid;
        foundChar = char.uuid;
        break;
      }
    }
    if (foundChar) break;
  }

  if (!foundService || !foundChar) {
    await BleClient.disconnect(device.deviceId);
    throw new Error('Tidak ditemukan karakteristik tulis pada printer. Pastikan printer menyala dan mendukung BLE.');
  }

  connectedDeviceId = device.deviceId;
  writeServiceUuid = foundService;
  writeCharUuid = foundChar;

  console.log(`Native BLE Printer connected: ${device.name || device.deviceId}`);
  console.log(`  Service: ${writeServiceUuid}, Char: ${writeCharUuid}`);

  return device.name || device.deviceId;
}

export function isNativePrinterConnected(): boolean {
  return !!connectedDeviceId && !!writeServiceUuid && !!writeCharUuid;
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
    // Small delay between chunks
    await new Promise((r) => setTimeout(r, 30));
  }
}

// --- Format Helpers ---
function formatCurrency(amount: number): string {
  return 'Rp ' + amount.toLocaleString('id-ID');
}

// --- Receipt Data Types (shared with bluetooth-printer.ts) ---
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
  if (!isNativePrinterConnected()) {
    await connectNativePrinter();
  }

  const paperWidth = receipt.paperSize === '58mm' ? 32 : 48;

  const padLine = (left: string, right: string): string => {
    const spaces = paperWidth - left.length - right.length;
    return left + ' '.repeat(Math.max(1, spaces)) + right;
  };
  const dashLine = (): string => '-'.repeat(paperWidth);

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
  addLine(dashLine());
  addLine(`No: ${receipt.invoiceNo}`);
  addLine(`Kasir: ${receipt.cashierName}`);
  addLine(`Tgl: ${receipt.date.toLocaleDateString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })} ${receipt.date.toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit',
  })}`);
  addLine(dashLine());

  // Items
  for (const item of receipt.items) {
    const itemName = item.variantName
      ? `${item.name} (${item.variantName})`
      : item.name;

    const displayName = itemName.length > paperWidth - 2
      ? itemName.substring(0, paperWidth - 5) + '...'
      : itemName;

    addLine(displayName);
    const qtyPrice = `  ${item.qty}x ${formatCurrency(item.price)}`;
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

  addLine(dashLine());

  // Footer
  addCmd(CMD.ALIGN_CENTER);
  addLine('');
  addLine('Terima Kasih!');
  addLine('Selamat Menikmati');
  addLine('');

  // Feed & Cut
  addCmd(CMD.FEED_5);
  addCmd(CMD.PARTIAL_CUT);

  await sendData(data);
}

// --- Print Kitchen Ticket ---
export async function nativePrintKitchenTicket(ticket: KitchenTicketData): Promise<void> {
  if (!isNativePrinterConnected()) {
    await connectNativePrinter();
  }

  const paperWidth = ticket.paperSize === '80mm' ? 48 : 32;
  const dashLine = (): string => '-'.repeat(paperWidth);

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
  addLine(dashLine());
  addLine(`No Inv: ${ticket.invoiceNo}`);
  addLine(`Waktu : ${ticket.date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`);
  addLine(dashLine());

  addCmd(CMD.BOLD_ON);
  for (const item of ticket.items) {
    const qtyText = `[ ${item.qty}x ] `;
    const itemName = item.variantName ? `${item.name} (${item.variantName})` : item.name;
    addLine(qtyText + itemName);
  }
  addCmd(CMD.BOLD_OFF);

  addLine(dashLine());
  addCmd(CMD.FEED_5);
  addCmd(CMD.PARTIAL_CUT);

  await sendData(data);
}

// --- Test Print ---
export async function nativeTestPrint(): Promise<void> {
  if (!isNativePrinterConnected()) {
    await connectNativePrinter();
  }

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
