// frontend/src/components/UniversalPrinter.ts - COMPLETE WITH DISCOUNT SUPPORT ✅

import { Alert, Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import SunmiPrinterService from './SunmiPrinterService';
import BillPDFGenerator from './BillPDFGenerator';
import { PrinterDetector } from './PrinterDetector';

// Printer types
export type PrinterType = 
  | 'thermal'
  | 'receipt'
  | 'label'
  | 'laser'
  | 'bluetooth'
  | 'network'
  | 'usb'
  | 'unknown';

interface PrinterInfo {
  type: PrinterType;
  name: string;
  address?: string;
  isDefault: boolean;
  paperSize?: '58mm' | '80mm' | 'A4' | 'label';
}

interface DiscountInfo {
  applied: boolean;
  type: 'percentage' | 'fixed';
  value: number;
  amount: number;
}

class UniversalPrinter {
  
  private static detectedPrinters: PrinterInfo[] = [];
  private static defaultPrinter: PrinterInfo | null = null;

  static async detectAllPrinters(): Promise<PrinterInfo[]> {
    const printers: PrinterInfo[] = [];
    if (Platform.OS !== 'android') return printers;
    
    try {
      // Android Print Service
      try {
        const hasPrintService = await this.checkAndroidPrintService();
        if (hasPrintService) {
          printers.push({ type: 'laser', name: 'Android Print Service', isDefault: false, paperSize: 'A4' });
        }
      } catch (e) {}

      this.detectedPrinters = printers;
      this.defaultPrinter = printers.find(p => p.type === 'thermal') || printers[0] || null;
      return printers;
    } catch (error) {
      return [];
    }
  }

  static async openCashDrawer(): Promise<boolean> {
    // Currently disabled to prevent crashes with uninstalled native modules
    // Use sunmi-printer-expo for this if supported in future
    console.log('Cash drawer opening requested');
    return false;
  }

  private static getPrintWidth(printer: PrinterInfo): number {
    switch (printer.paperSize) {
      case '58mm': return 164;
      case '80mm': return 226;
      case 'A4': return 612;
      case 'label': return 300;
      default: return 226;
    }
  }

  // ==================== SALES REPORT ====================
static async printSalesReport(reportData: any, userId?: string | number, t?: any): Promise<boolean> {
  try {
    const company = await BillPDFGenerator.loadSettings(userId);
    const html = this.generateSalesReportHTML(reportData, company);
    
    // ✅ Save as PDF (no preview)
    const { uri } = await Print.printToFileAsync({ html });
    console.log('📄 Sales report saved at:', uri);
    
    // ✅ Optionally share the PDF
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri);
    }
    
    return true;
  } catch (error) {
    console.log('Sales report error:', error);
    return false;
  }
}
  private static generateSalesReportHTML(data: any, company: any): string {
    const symbol = company.currencySymbol || '$';
    return `<!DOCTYPE html><html><head><style>
      body { font-family: monospace; padding: 20px; max-width: 800px; margin: 0 auto; }
      .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
      .company-name { font-size: 24px; font-weight: bold; }
      .report-title { font-size: 20px; font-weight: bold; margin: 15px 0; text-align: center; }
      .section-title { font-size: 16px; font-weight: bold; margin: 15px 0 10px; background: #f0f0f0; padding: 5px; }
      table { width: 100%; border-collapse: collapse; margin: 10px 0; }
      th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
      .amount { text-align: right; }
      .summary-box { display: inline-block; width: 30%; padding: 10px; margin: 5px; background: #f9f9f9; text-align: center; border-radius: 5px; }
      .footer { margin-top: 30px; text-align: center; font-size: 12px; border-top: 1px solid #ddd; padding-top: 10px; }
    </style></head><body>
      <div class="header"><div class="company-name">${company.name || 'POS SYSTEM'}</div><div>${company.address || ''}</div><div>GST: ${company.gstNo || 'N/A'}</div><div class="report-title">SALES REPORT</div><div>Period: ${data.period || 'Today'}</div></div>
      <div style="text-align:center"><div class="summary-box"><div>Total Sales</div><div style="font-size:24px">${data.summary?.totalSales || 0}</div></div>
      <div class="summary-box"><div>Total Items</div><div style="font-size:24px">${data.summary?.totalItems || 0}</div></div>
      <div class="summary-box"><div>Total Revenue</div><div style="font-size:24px">${symbol}${(data.summary?.totalRevenue || 0).toFixed(2)}</div></div></div>
      <div class="section-title">💳 PAYMENT BREAKDOWN</div>${this.generateTableFromObject(data.paymentBreakdown || {}, symbol)}</div>
      <div class="footer"><p>© ${new Date().getFullYear()} UNIPRO SOFTWARES SG PTE LTD</p></div>
    </body></html>`;
  }

  // ==================== CATEGORY REPORT ====================
  static async printCategoryReport(
  categories: any[], selectedCategory: string | null, categoryItems: any[], categoryTransactions: any[],
  userId?: string | number, t?: any, options?: any
): Promise<boolean> {
  try {
    const company = await BillPDFGenerator.loadSettings(userId);
    const html = selectedCategory 
      ? this.generateCategoryDetailHTML(selectedCategory, categoryItems, categoryTransactions, company, options)
      : this.generateAllCategoriesHTML(categories, company, options);
    
    // ✅ Save as PDF (no preview)
    const { uri } = await Print.printToFileAsync({ html });
    console.log('📄 Category report saved at:', uri);
    
    // ✅ Optionally share the PDF
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri);
    }
    
    return true;
  } catch (error) { 
    console.log('Category report error:', error);
    return false; 
  }
}
  private static generateCategoryDetailHTML(categoryName: string, items: any[], transactions: any[], company: any, options?: any): string {
    const symbol = company.currencySymbol || '$';
    const groupTransactions = (tx: any[]) => {
      const grouped: any = {};
      tx.forEach(t => { if (!grouped[t.saleId]) grouped[t.saleId] = { id: t.saleId, date: t.saleDate, items: [], total: 0 }; grouped[t.saleId].items.push({ name: t.name, quantity: t.quantity, price: t.price }); grouped[t.saleId].total += t.price * t.quantity; });
      return Object.values(grouped).sort((a: any,b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    };
    return `<!DOCTYPE html><html><head><style>
      body { font-family: Arial; padding: 20px; max-width: 800px; margin: 0 auto; }
      .header { text-align: center; border-bottom: 2px solid #000; margin-bottom: 20px; }
      .category-title { font-size: 22px; font-weight: bold; text-align: center; margin: 20px 0; }
      .section-title { font-size: 18px; font-weight: bold; margin: 20px 0 10px; background: #f0f0f0; padding: 8px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      th, td { padding: 8px; border-bottom: 1px solid #eee; }
      .amount { text-align: right; }
      .transaction-card { border: 1px solid #ddd; border-radius: 5px; padding: 15px; margin-bottom: 15px; }
      .footer { margin-top: 30px; text-align: center; font-size: 12px; border-top: 1px solid #ddd; padding-top: 10px; }
    </style></head><body>
      <div class="header"><div class="company-name">${company.name || 'Store'}</div><div>${company.address || ''}</div><div>GST: ${company.gstNo || 'N/A'}</div></div>
      <div class="category-title">📦 ${categoryName}</div>
      <div style="display:flex;justify-content:space-around;margin:20px 0;padding:15px;background:#f9f9f9;border-radius:5px">
        <div><div>Total Items</div><div style="font-size:18px;font-weight:bold">${items.length}</div></div>
        <div><div>Quantity Sold</div><div style="font-size:18px;font-weight:bold">${items.reduce((s,i)=>s+(i.quantity||0),0)}</div></div>
        <div><div>Total Revenue</div><div style="font-size:18px;font-weight:bold">${symbol}${items.reduce((s,i)=>s+(i.revenue||0),0).toFixed(2)}</div></div>
      </div>
      <div class="section-title">📋 Items Sold</div>${this.generateItemsTable(items, symbol)}
      <div class="section-title">📄 Transaction History</div>${transactions.length ? groupTransactions(transactions).map((sale:any) => `<div class="transaction-card"><div><strong>#${sale.id}</strong> - ${symbol}${sale.total.toFixed(2)}</div><div>${new Date(sale.date).toLocaleString()}</div>${sale.items.map((item:any) => `<div>• ${item.name} x${item.quantity} - ${symbol}${(item.price*item.quantity).toFixed(2)}</div>`).join('')}</div>`).join('') : '<p>No transactions</p>'}
      <div class="footer"><p>End of Report</p></div>
    </body></html>`;
  }

  private static generateAllCategoriesHTML(categories: any[], company: any, options?: any): string {
    const symbol = company.currencySymbol || '$';
    const summary = options?.summary || { totalSales: 0, totalItems: 0, totalRevenue: 0, paymentBreakdown: {} };
    return `<!DOCTYPE html><html><head><style>
      body { font-family: Arial; padding: 20px; max-width: 800px; margin: 0 auto; }
      .header { text-align: center; border-bottom: 2px solid #000; margin-bottom: 20px; }
      .summary-section { display: flex; justify-content: space-between; margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 5px; }
      .category-card { margin-bottom: 20px; border: 1px solid #ddd; border-radius: 5px; padding: 15px; }
      .category-name { font-size: 18px; font-weight: bold; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { padding: 8px; border-bottom: 1px solid #eee; }
      .amount { text-align: right; }
      .footer { margin-top: 30px; text-align: center; font-size: 12px; border-top: 1px solid #ddd; padding-top: 10px; }
    </style></head><body>
      <div class="header"><div class="company-name">${company.name || 'Store'}</div><div>${company.address || ''}</div><div>GST: ${company.gstNo || 'N/A'}</div><div class="report-title">📊 CATEGORY WISE SALES</div></div>
      <div class="summary-section"><div><div>Total Sales</div><div>${summary.totalSales}</div></div><div><div>Total Items</div><div>${summary.totalItems}</div></div><div><div>Total Revenue</div><div>${symbol}${summary.totalRevenue.toFixed(2)}</div></div></div>
      <div><h3>💳 PAYMENT BREAKDOWN</h3>${Object.entries(summary.paymentBreakdown).map(([m,a]) => `<div>${m}: ${symbol}${(a as number).toFixed(2)}</div>`).join('')}</div>
      ${categories.map(cat => `<div class="category-card"><div class="category-name">${cat.name}</div><div>Revenue: ${symbol}${(cat.totalRevenue||0).toFixed(2)} | Items: ${cat.totalQuantity||0}</div>${this.generateItemsTable(cat.items || [], symbol)}</div>`).join('')}
      <div class="footer"><p>© ${new Date().getFullYear()} UNIPRO SOFTWARES SG PTE LTD</p></div>
    </body></html>`;
  }

  private static generateItemsTable(items: any[], symbol: string): string {
    if (!items.length) return '<p>No items</p>';
    return `<table><thead><tr><th>Item</th><th class="amount">Qty</th><th class="amount">Price</th><th class="amount">Total</th></tr></thead><tbody>${items.map(i => `<tr><td>${i.name}</td><td class="amount">${i.quantity||0}</td><td class="amount">${symbol}${(i.price||0).toFixed(2)}</td><td class="amount">${symbol}${(i.revenue||0).toFixed(2)}</td></tr>`).join('')}</tbody></table>`;
  }

  private static generateTableFromObject(obj: Record<string, any>, symbol: string): string {
    const entries = Object.entries(obj);
    if (!entries.length) return '<p>No data</p>';
    return `<table><tbody>${entries.map(([k,v]) => `<tr><td>${k}</td><td class="amount">${symbol}${(v as number).toFixed(2)}</td></tr>`).join('')}</tbody></table>`;
  }

  // ==================== MAIN SMART PRINT WITH DISCOUNT ====================
static async smartPrint(
  saleData: any, 
  outletId?: string | number,
  t?: any, 
  discountInfo?: DiscountInfo, 
  preferredType?: PrinterType,
  isReprint: boolean = false
): Promise<boolean> {
  try {
    const company = await BillPDFGenerator.loadSettings(outletId);
    
    // ✅ 1. Try WiFi Printer if IP is configured
    if (company.printerIp && company.printerIp.trim().length > 0) {
      console.log(`🌐 Attempting WiFi print to: ${company.printerIp}`);
      try {
        const printed = await this.printNetwork(saleData, outletId, { 
          type: 'network', 
          name: 'WiFi Printer', 
          address: company.printerIp,
          isDefault: true 
        } as PrinterInfo, discountInfo);
        
        if (printed) {
          Alert.alert('✅ Success', 'Receipt printed via WiFi!');
          return true;
        }
      } catch (wifiError) {
        console.log('❌ WiFi Print failed, falling back...', wifiError);
      }
    }

    // ✅ 2. Auto-detect local printer type (Sunmi)
    const printerType = await PrinterDetector.detectPrinter();
    
    if (printerType === 'sunmi') {
      const printed = await this.printThermalReceipt(saleData, outletId, undefined, discountInfo);
      if (printed) {
        Alert.alert('✅ Success', 'Receipt printed via Sunmi!');
        return true;
      }
    }
    
    // ✅ 3. Fallback to PDF/Web
    return await this.offerPDFFallback(saleData, outletId, t, discountInfo);
    
  } catch (error) { 
    console.log('SmartPrint error:', error);
    return await this.offerPDFFallback(saleData, outletId, t, discountInfo); 
  }
}
  // ==================== THERMAL PRINTING WITH DISCOUNT ====================
private static async printThermalReceipt(
  saleData: any, 
  userId?: string | number, 
  printer?: PrinterInfo, 
  discountInfo?: DiscountInfo
): Promise<boolean> {
  try {
    // ✅ STEP 1: Try Sunmi direct print (NO preview)
    const sunmiReady = await SunmiPrinterService.init();
    if (sunmiReady) {
      const company = await BillPDFGenerator.loadSettings(userId);
      
      // ✅ Pass discount to saleData for Sunmi printer
      const enhancedSaleData = { ...saleData };
      if (discountInfo?.applied && discountInfo.amount > 0) {
        enhancedSaleData.discountAmount = discountInfo.amount;
        enhancedSaleData.discountType = discountInfo.type;
        enhancedSaleData.discountValue = discountInfo.value;
        enhancedSaleData.originalTotal = saleData.total + discountInfo.amount;
      }
      
      const printed = await SunmiPrinterService.printReceipt(enhancedSaleData, company);
      if (printed) {
        console.log('✅ Printed with Sunmi printer - NO PREVIEW');
        return true;
      }
    }
    
    // ✅ STEP 2: If Sunmi fails, create PDF (no preview)
    const company = await BillPDFGenerator.loadSettings(userId);
    const html = await BillPDFGenerator.generateHTML(saleData, userId, discountInfo);
    const { uri } = await Print.printToFileAsync({ 
      html, 
      width: this.getPrintWidth(printer || { paperSize: '58mm' } as PrinterInfo) 
    });
    
    console.log('📄 PDF saved at:', uri);
    return true;
    
  } catch (error) { 
    console.log('Thermal print error:', error);
    return false; 
  }
}
  // ==================== NETWORK PRINTING ====================
  private static async printNetwork(saleData: any, userId?: string | number, printer?: PrinterInfo, discountInfo?: DiscountInfo): Promise<boolean> {
    try {
      // Use thermal printer IP printing
      const ThermalPrinter = require('react-native-thermal-printer');
      const company = await BillPDFGenerator.loadSettings(userId);
      const text = this.formatThermalTextWithDiscount(saleData, company, discountInfo);
      
      await ThermalPrinter.default.printIP(printer?.address || '', { 
        text,
        width: 384, // 58mm
        characterSet: 'PC437'
      });
      return true;
    } catch (error) { 
      console.log('❌ Network print error:', error);
      return false; 
    }
  }

  private static formatThermalTextWithDiscount(saleData: any, company: any, discountInfo?: DiscountInfo): string {
    const symbol = company.currencySymbol || '$';
    const hasDiscount = discountInfo?.applied && discountInfo.amount > 0;
    const originalTotal = hasDiscount ? (saleData.total || 0) + discountInfo.amount : (saleData.total || 0);
    
    let text = '[C]================================\n';
    text += `[L]Bill No: ${saleData.invoiceNumber || saleData.id || ''}\n`;
    text += `[L]Date: ${new Date().toLocaleDateString()}\n`;
    text += '[L]--------------------------------\n';
    
    saleData.items?.forEach((item: any) => {
      const name = (item.name || '').substring(0, 18).padEnd(18);
      const qty = (item.quantity || 1).toString().padStart(3);
      const total = `${symbol}${(item.price * item.quantity).toFixed(2)}`.padStart(10);
      text += `[L]${name}${qty}${total}\n`;
    });
    
    text += '[L]--------------------------------\n';
    if (hasDiscount) {
      text += `[R]ORIGINAL: ${symbol}${originalTotal.toFixed(2)}\n`;
      text += `[R]DISCOUNT: -${symbol}${discountInfo.amount.toFixed(2)}\n`;
    }
    text += `[R]TOTAL: ${symbol}${saleData.total.toFixed(2)}\n`;
    text += '[C]================================\n';
    text += '[C]THANK YOU! COME AGAIN!\n\n\n';
    return text;
  }

  // ==================== PDF FALLBACK WITH DISCOUNT ====================
  static async offerPDFFallback(saleData: any, userId?: string | number, t?: any, discountInfo?: DiscountInfo): Promise<boolean> {
    if (Platform.OS === 'web') {
      // ✅ WEB: Fail-proof Iframe printing (ignores popup blockers)
      try {
        const html = await BillPDFGenerator.generateHTML(saleData, userId, discountInfo);
        
        let frame = document.getElementById('print-iframe') as HTMLIFrameElement;
        if (!frame) {
          frame = document.createElement('iframe');
          frame.id = 'print-iframe';
          frame.style.display = 'none';
          document.body.appendChild(frame);
        }

        const doc = frame.contentWindow?.document || frame.contentDocument;
        if (doc) {
          doc.open();
          doc.write(html);
          doc.close();

          // Wait for images to load in the iframe
          frame.contentWindow?.addEventListener('load', () => {
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
          });
          
          // Fallback if load event doesn't fire
          setTimeout(() => {
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
          }, 1000);
        }
        return true;
      } catch (err) {
        console.error('Web print error:', err);
        return false;
      }
    }

    return new Promise((resolve) => {
      Alert.alert(t?.printerNotFound || '🖨️ No Printer Available', t?.wantPDF || 'Save as PDF?', [
        { text: t?.no || 'No', onPress: () => resolve(false), style: 'cancel' },
        { text: t?.yes || 'Yes', onPress: async () => {
            try {
              const html = await BillPDFGenerator.generateHTML(saleData, userId, discountInfo);
              
              if (Platform.OS === 'ios') {
                await Print.printAsync({ html });
              } else {
                const { uri } = await Print.printToFileAsync({ html, width: 226 });
                if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
              }
              resolve(true);
            } catch (error) {
              console.error('PDF Fallback Error:', error);
              resolve(false); 
            }
          }
        }
      ]);
    });
  }

  // ==================== UTILITIES ====================
  private static async checkAndroidPrintService(): Promise<boolean> { return Platform.OS === 'android'; }

  static async testAllPrinters(): Promise<void> {
    const printers = await this.detectAllPrinters();
    let message = `📋 Found ${printers.length} printer(s):\n\n`;
    printers.forEach((p, i) => { message += `${i+1}. ${p.name}\n   Type: ${p.type}\n   Paper: ${p.paperSize || 'Unknown'}\n   Default: ${p.isDefault ? '✅' : '❌'}\n\n`; });
    Alert.alert('Printer Detection', message);
  }
}

export default UniversalPrinter;
