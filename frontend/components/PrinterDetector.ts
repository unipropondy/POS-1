// components/PrinterDetector.ts
import { NativeModules, Platform } from 'react-native';
import { initPrinter } from 'sunmi-printer-expo';

export class PrinterDetector {
  
  // Check what printer is available
  static async detectPrinter(): Promise<'sunmi' | 'pdf'> {
    if (Platform.OS !== 'android') return 'pdf';
    
    try {
      // ✅ Check for Sunmi printer by trying to initialize
      const sunmiReady = await this.checkSunmiPrinter();
      if (sunmiReady) {
        console.log('✅ Sunmi printer detected');
        return 'sunmi';
      }
      
      // Default to PDF
      console.log('⚠️ No Sunmi printer, using PDF fallback');
      return 'pdf';
      
    } catch (error) {
      console.log('Printer detection error:', error);
      return 'pdf';
    }
  }
  
  static async checkSunmiPrinter(): Promise<boolean> {
    try {
      await initPrinter();
      return true;
    } catch (error) {
      return false;
    }
  }
  
  static async checkPrintService(): Promise<boolean> {
    // Android always has print service
    return Platform.OS === 'android';
  }
}
