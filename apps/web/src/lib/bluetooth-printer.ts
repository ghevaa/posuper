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

// --- State ---
let bluetoothDevice: BluetoothDevice | null = null;
let writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
let isConnected = false;

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

export function isPrinterConnected(): boolean {
  return isConnected && !!writeCharacteristic;
}

export async function connectPrinter(): Promise<boolean> {
  if (!isBLESupported()) {
    throw new Error('Bluetooth tidak didukung di browser/app ini. Gunakan Chrome atau aplikasi Android.');
  }

  try {
    // Request device — user picks from dialog
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      // Accept all BLE devices (printer names vary widely)
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICE_UUIDS,
    });

    if (!bluetoothDevice || !bluetoothDevice.gatt) {
      throw new Error('Tidak ada printer yang dipilih');
    }

    // Listen for disconnect
    bluetoothDevice.addEventListener('gattserverdisconnected', () => {
      isConnected = false;
      writeCharacteristic = null;
      console.log('Printer Bluetooth terputus');
    });

    // Connect to GATT server
    const server = await bluetoothDevice.gatt.connect();

    // Try to find writable characteristic from known service/char UUIDs
    const services = await server.getPrimaryServices();

    for (const service of services) {
      try {
        const chars = await service.getCharacteristics();
        for (const char of chars) {
          if (
            char.properties.write ||
            char.properties.writeWithoutResponse
          ) {
            writeCharacteristic = char;
            isConnected = true;
            console.log(`Printer connected: ${bluetoothDevice.name || 'Unknown'}, Service: ${service.uuid}, Char: ${char.uuid}`);
            return true;
          }
        }
      } catch {
        // Skip services we can't read
        continue;
      }
    }

    throw new Error('Tidak ditemukan karakteristik tulis pada printer. Pastikan printer sudah menyala.');
  } catch (err: any) {
    isConnected = false;
    writeCharacteristic = null;
    if (err.name === 'NotFoundError') {
      throw new Error('Tidak ada printer Bluetooth yang ditemukan. Pastikan printer sudah menyala dan mode Bluetooth aktif.');
    }
    throw err;
  }
}

export async function disconnectPrinter(): Promise<void> {
  if (bluetoothDevice?.gatt?.connected) {
    bluetoothDevice.gatt.disconnect();
  }
  isConnected = false;
  writeCharacteristic = null;
  bluetoothDevice = null;
}

// --- Send Data (chunked for BLE MTU limit) ---

async function sendData(data: Uint8Array): Promise<void> {
  if (!writeCharacteristic) {
    throw new Error('Printer tidak terhubung');
  }

  // BLE has MTU limit (~20 bytes default, can be up to 512)
  // Send in chunks of 100 bytes to be safe
  const CHUNK_SIZE = 100;
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    if (writeCharacteristic.properties.writeWithoutResponse) {
      await writeCharacteristic.writeValueWithoutResponse(chunk);
    } else {
      await writeCharacteristic.writeValueWithResponse(chunk);
    }
    // Small delay between chunks to prevent buffer overflow
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

// --- Receipt Printing ---

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
}

export async function printReceipt(receipt: ReceiptData): Promise<void> {
  if (!isPrinterConnected()) {
    // Try to reconnect
    await connectPrinter();
  }

  const lines: Uint8Array[] = [];

  // Helper to add text line
  const addLine = (text: string) => {
    lines.push(encode(text + '\n'));
  };

  // --- Build Receipt ---

  // Init
  lines.push(CMD.INIT);

  // Store header (centered, bold, double size)
  lines.push(CMD.ALIGN_CENTER);
  lines.push(CMD.FONT_DOUBLE_H);
  lines.push(CMD.BOLD_ON);
  addLine(receipt.storeName);
  lines.push(CMD.FONT_NORMAL);
  lines.push(CMD.BOLD_OFF);
  lines.push(CMD.LINE);

  // Invoice & Date
  lines.push(CMD.ALIGN_LEFT);
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

    // Truncate name if too long
    const displayName = itemName.length > PAPER_WIDTH - 2
      ? itemName.substring(0, PAPER_WIDTH - 5) + '...'
      : itemName;

    addLine(displayName);
    const qtyPrice = `  ${item.qty}x ${formatCurrency(item.price)}`;
    const lineTotal = formatCurrency(item.qty * item.price);
    addLine(padLine(qtyPrice, lineTotal));
  }

  addLine(dashLine());

  // Totals
  lines.push(CMD.BOLD_ON);
  addLine(padLine('TOTAL', formatCurrency(receipt.total)));
  lines.push(CMD.BOLD_OFF);

  const methodLabel = receipt.paymentMethod === 'cash' ? 'Tunai' : 'Online';
  addLine(padLine('Bayar (' + methodLabel + ')', formatCurrency(receipt.paidAmount)));

  if (receipt.changeAmount > 0) {
    addLine(padLine('Kembalian', formatCurrency(receipt.changeAmount)));
  }

  addLine(dashLine());

  // Footer
  lines.push(CMD.ALIGN_CENTER);
  addLine('');
  addLine('Terima Kasih!');
  addLine('Selamat Menikmati');
  addLine('');

  // Feed & Cut
  lines.push(CMD.FEED_5);
  lines.push(CMD.PARTIAL_CUT);

  // Concat all and send
  const receiptData = concat(...lines);
  await sendData(receiptData);
}

// --- Quick Test Print ---
export async function testPrint(): Promise<void> {
  if (!isPrinterConnected()) {
    await connectPrinter();
  }

  const data = concat(
    CMD.INIT,
    CMD.ALIGN_CENTER,
    CMD.BOLD_ON,
    encode('=== TEST PRINT ===\n'),
    CMD.BOLD_OFF,
    encode('Printer terhubung!\n'),
    encode('XP-58I Ready\n'),
    encode('\n'),
    CMD.FEED_3,
    CMD.PARTIAL_CUT,
  );

  await sendData(data);
}
