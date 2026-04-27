// components/SunmiPrinterService.ts - PERFECT DESIGN MATCHING YOUR PREVIEW ✅

import { 
  initPrinter, 
  printText, 
  printTextWithSize,
  printImageBase64,
  printQRCode,
  lineWrap, 
  cutPaper
} from 'sunmi-printer-expo';
import { Platform } from 'react-native';
import { API_URL } from '../constants/Config';

class SunmiPrinterService {
  
  static async init(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      console.log('Not Android - cannot use Sunmi printer');
      return false;
    }
    
    try {
      await initPrinter();
      console.log('✅ Sunmi printer initialized');
      return true;
    } catch (error) {
      console.log('❌ Printer init failed:', error);
      return false;
    }
  }
  
  // Convert any image URL to Base64
  private static async urlToBase64(url: string): Promise<string> {
    console.log('🔄 Converting URL to Base64:', url);
    const response = await fetch(url);
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        let base64 = reader.result as string;
        if (base64.includes(',')) {
          base64 = base64.split(',')[1];
        }
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  
  // Print logos (thermal printers can't do side-by-side, so print one after another)
  private static async printLogos(companySettings: any): Promise<void> {
    const hasCompanyLogo = companySettings.showCompanyLogo && companySettings.companyLogo;
    const hasHalalLogo = companySettings.showHalalLogo && companySettings.halalLogo;
    
    // Print company logo
    if (hasCompanyLogo) {
      try {
        let logoUrl = companySettings.companyLogo;
        if (logoUrl && !logoUrl.startsWith('http')) {
          logoUrl = `${API_URL}${logoUrl}`;
        }
        const base64Image = await this.urlToBase64(logoUrl);
        await printImageBase64(base64Image);
        await lineWrap(1);
        console.log('✅ Company logo printed');
      } catch (e) {
        console.log('❌ Company logo failed:', e);
      }
    }
    
    // Print halal logo
    if (hasHalalLogo) {
      try {
        let halalUrl = companySettings.halalLogo;
        if (halalUrl && !halalUrl.startsWith('http')) {
          halalUrl = `${API_URL}${halalUrl}`;
        }
        const base64Image = await this.urlToBase64(halalUrl);
        await printImageBase64(base64Image);
        await lineWrap(1);
        console.log('✅ Halal logo printed');
      } catch (e) {
        console.log('❌ Halal logo failed:', e);
      }
    }
  }
  
  // Center text (full width 32 chars)
  private static async center(text: string): Promise<void> {
    const maxWidth = 32;
    let displayText = text;
    if (displayText.length > maxWidth) {
      displayText = displayText.substring(0, maxWidth - 3) + '...';
    }
    const padding = Math.max(0, Math.floor((maxWidth - displayText.length) / 2));
    const centeredText = ' '.repeat(padding) + displayText;
    await printText(centeredText);
  }
  
  // Left aligned
  private static async left(text: string): Promise<void> {
    await printText(text);
  }
  
  // Divider line (full width 32 chars)
  private static async divider(char: string = '-'): Promise<void> {
    await printText(char.repeat(32));
  }
  
  // Double divider
  private static async doubleDivider(char: string = '='): Promise<void> {
    await printText(char.repeat(32));
  }
  
  // Two columns (for totals)
  private static async twoCols(left: string, right: string): Promise<void> {
    const leftWidth = 20;
    let line = left.substring(0, leftWidth).padEnd(leftWidth, ' ');
    line += right.substring(0, 12).padStart(12, ' ');
    await printText(line);
  }
  
  // Four columns for items (ITEM, QTY, PRICE, TOTAL)
  private static async itemRow(name: string, qty: string, price: string, total: string): Promise<void> {
    const nameWidth = 14;
    const qtyWidth = 4;
    const priceWidth = 6;
    const totalWidth = 8;
    
    let line = name.substring(0, nameWidth).padEnd(nameWidth, ' ');
    line += qty.substring(0, qtyWidth).padStart(qtyWidth, ' ');
    line += price.substring(0, priceWidth).padStart(priceWidth, ' ');
    line += total.substring(0, totalWidth).padStart(totalWidth, ' ');
    await printText(line);
  }
  
  // Item header
  private static async itemHeader(): Promise<void> {
    let line = 'ITEM'.padEnd(14, ' ');
    line += 'QTY'.padStart(4, ' ');
    line += 'PRICE'.padStart(6, ' ');
    line += 'TOTAL'.padStart(8, ' ');
    await printText(line);
  }
  
  static async printReceipt(saleData: any, companySettings: any): Promise<boolean> {
    try {
      await this.init();
      
      const symbol = companySettings.currencySymbol || '$';
      
      // ============ HEADER SECTION ============
      await this.doubleDivider('=');
      await lineWrap(1);
      
      // Print logos
      await this.printLogos(companySettings);
      
      // Company Name - Large and Bold
      await this.center(companySettings.name || 'YOUR STORE');
      await lineWrap(1);
      
      // Address
      if (companySettings.address) {
        const addressLines = companySettings.address.split('\n');
        for (const line of addressLines) {
          if (line.trim()) {
            await this.center(line.trim());
          }
        }
      }
      
      // Phone
      if (companySettings.phone) {
        await this.center(`📞 ${companySettings.phone}`);
      }
      
      // Email
      if (companySettings.email) {
        await this.center(`📧 ${companySettings.email}`);
      }
      
      // GST Number
      if (companySettings.gstNo) {
        await this.center(`GST: ${companySettings.gstNo}`);
      }
      
      await this.doubleDivider('=');
      await lineWrap(1);
      
      // ============ BILL DETAILS ============
      await this.left(`INVOICE NO: ${saleData.invoiceNumber || saleData.id}`);
      await this.left(`DATE: ${new Date().toLocaleString()}`);
      await this.left(`CASHIER: ${saleData.cashier || companySettings.cashierName || 'Staff'}`);
      await this.divider('-');
      
      // ============ ITEMS SECTION ============
      await this.itemHeader();
      await this.divider('-');
      
      // Items loop
      for (const item of saleData.items || []) {
        const itemName = (item.name || '').substring(0, 12);
        const qty = (item.qty || item.quantity || 1).toString();
        const price = `${symbol}${item.price.toFixed(2)}`;
        const total = `${symbol}${(item.price * (item.qty || item.quantity || 1)).toFixed(2)}`;
        
        await this.itemRow(itemName, qty, price, total);
        
        // ✅ Print Modifiers (Addons)
        if (item.modifiers && item.modifiers.length > 0) {
          for (const mod of item.modifiers) {
            await this.left(`   + ${mod.ModifierName || mod.name}`);
          }
        }
        
        // Show unit price if quantity > 1
        if ((item.qty || item.quantity) > 1) {
          await this.left(`    @ ${symbol}${item.price.toFixed(2)} ea`);
        }
      }
      
      await this.divider('-');
      
      // ============ SUBTOTAL & DISCOUNT ============
      let subtotal = saleData.total;
      
      if (saleData.discountAmount && saleData.discountAmount > 0) {
        const originalTotal = saleData.total + saleData.discountAmount;
        await this.twoCols('Sub Total:', `${symbol}${originalTotal.toFixed(2)}`);
        await this.twoCols('Discount:', `-${symbol}${saleData.discountAmount.toFixed(2)}`);
        if (saleData.discountType === 'percentage') {
          await this.left(`    (${saleData.discountValue}% off)`);
        }
        await this.divider('-');
        subtotal = saleData.total;
      } else {
        await this.twoCols('Sub Total:', `${symbol}${subtotal.toFixed(2)}`);
        await this.divider('-');
      }
      
      // ============ GST ============
      if (companySettings.gstPercentage > 0) {
        const gstAmount = subtotal * (companySettings.gstPercentage / (100 + companySettings.gstPercentage));
        const beforeGst = subtotal - gstAmount;
        await this.twoCols('Sub Total (before GST):', `${symbol}${beforeGst.toFixed(2)}`);
        await this.twoCols(`GST (${companySettings.gstPercentage}%):`, `${symbol}${gstAmount.toFixed(2)}`);
        await this.divider('-');
      }
      
      // ============ GRAND TOTAL ============
      await this.twoCols('GRAND TOTAL:', `${symbol}${subtotal.toFixed(2)}`);
      await this.doubleDivider('=');
      
      // ============ PAYMENT ============
      await this.twoCols('PAYMENT:', saleData.paymentMethod || 'Cash');
      
      if (saleData.cashPaid && saleData.cashPaid > 0) {
        await this.twoCols('PAID:', `${symbol}${saleData.cashPaid.toFixed(2)}`);
        if (saleData.change && saleData.change > 0) {
          await this.twoCols('CHANGE:', `${symbol}${saleData.change.toFixed(2)}`);
        }
      }
      
      await lineWrap(1);
      
      // ============ FOOTER ============
      await this.center('THANK YOU! COME AGAIN!');
      await lineWrap(1);
      await this.center('SMARTHAWKER BY UNIPROSG');
      
      if (companySettings.gstPercentage > 0) {
        await this.center(`* Prices include ${companySettings.gstPercentage}% GST`);
      }
      
      await lineWrap(3);
      await cutPaper();
      
      return true;
      
    } catch (error) {
      console.log('❌ Print error:', error);
      return false;
    }
  }
}

export default SunmiPrinterService;
