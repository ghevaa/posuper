// ============================================================
// POS Yoga — Transaction Reprint Helper
// ============================================================

import { printReceipt, ReceiptData } from './bluetooth-printer';
import { nativePrintReceipt } from './native-ble-printer';
import { Capacitor } from '@capacitor/core';
import toast from 'react-hot-toast';

import { api } from './api';

let cachedSettings: Record<string, string> | null = null;

async function getSettings(): Promise<Record<string, string>> {
  try {
    const res = await api.get<{ data: Record<string, string> }>('/settings');
    cachedSettings = res.data || {};
    return cachedSettings;
  } catch {
    return cachedSettings || {};
  }
}

export async function printTransactionReceipt(txDetail: any, cashierNameFallback = 'Administrator') {
  try {
    const settings = await getSettings();
    const payload: ReceiptData = {
      storeName: settings.store_name || "D'Mac Chicken",
      storeAddress: settings.store_address || undefined,
      storePhone: settings.store_phone || undefined,
      receiptHeader: settings.receipt_header || undefined,
      receiptFooter: settings.receipt_footer || undefined,
      invoiceNo: txDetail.invoiceNo,
      date: new Date(txDetail.createdAt),
      cashierName: txDetail.userName || txDetail.user?.name || cashierNameFallback,
      orderType: txDetail.orderType || 'dine_in',
      tableNo: txDetail.tableNo || undefined,
      items: (txDetail.items || []).map((i: any) => ({
        name: i.productName || i.name,
        qty: Number(i.qty),
        price: Number(i.price),
        variantName: i.variantName || null,
        note: i.note || null,
      })),
      subtotal: Number(txDetail.subtotal || 0),
      discount: Number(txDetail.discount || 0),
      total: Number(txDetail.total || 0),
      paidAmount: Number(txDetail.paidAmount || 0),
      changeAmount: Number(txDetail.changeAmount || 0),
      paymentMethod: txDetail.paymentMethod || 'cash',
    };

    const isAndroidNative = Capacitor.isNativePlatform();
    if (isAndroidNative) {
      await nativePrintReceipt(payload);
    } else {
      await printReceipt(payload);
    }
    toast.success('Struk berhasil dicetak ulang!');
  } catch (err: any) {
    toast.error('Gagal cetak ulang struk: ' + (err.message || 'Error printer'));
  }
}
