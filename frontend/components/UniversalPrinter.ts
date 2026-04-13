// components/UniversalPrinter.ts

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert } from "react-native";
import { useGstStore } from "../stores/gstStore"; 

class UniversalPrinter {
  // 🖨️ MAIN PRINT FUNCTION
  static async smartPrint(saleData: any): Promise<boolean> {
    try {
      const html = this.generateReceiptHTMLWithGST(saleData);

      const { uri } = await Print.printToFileAsync({
        html,
        width: 226, // 80mm paper
      });

      await Print.printAsync({ uri });

      return true;
    } catch (error) {
      console.log("❌ Print error:", error);

      Alert.alert("Print Failed", "Saving as PDF instead");

      try {
        const html = this.generateReceiptHTMLWithGST(saleData);

        const { uri } = await Print.printToFileAsync({
          html,
          width: 226,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri);
        }

        return false;
      } catch {
        return false;
      }
    }
  }

  // 🧾 RECEIPT HTML (SINGAPORE STYLE)
  private static generateReceiptHTMLWithGST(saleData: any): string {
    const symbol = "$";
    const date = new Date();

    const items = saleData.items || [];
    const subtotal = saleData.subTotal || saleData.subtotal || 0;
    const discountAmount = saleData.discountAmount || 0;
    
    // Fetch GST settings
    const { enabled: gstEnabled, percentage: gstPercentage, registrationNumber: gstRegNo } = useGstStore.getState();

    const taxableAmount = Math.max(0, subtotal - discountAmount);
    const gstAmount = gstEnabled ? parseFloat((taxableAmount * (gstPercentage / 100)).toFixed(2)) : 0;
    const total = taxableAmount + gstAmount;

    const totalQty = items.reduce(
      (sum: number, i: any) => sum + (i.quantity || i.qty || 1),
      0,
    );

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <style>
        body {
          font-family: monospace;
          width: 72mm;
          margin: 0 auto;
          font-size: 12px;
        }

        .center { text-align: center; }
        .line { border-top: 1px dashed #000; margin: 6px 0; }

        .row {
          display: flex;
          justify-content: space-between;
        }

        .bold { font-weight: bold; }

        table {
          width: 100%;
          font-size: 12px;
        }

        th, td {
          padding: 2px 0;
        }

        .right { text-align: right; }
      </style>
    </head>

    <body>

      <!-- HEADER -->
      <div class="center bold">SMART CAFE POS</div>
      <div class="center">Singapore</div>
      ${gstRegNo ? `<div class="center">GST Reg No: ${gstRegNo}</div>` : ''}

      <div class="line"></div>

      <!-- BILL INFO -->
      <div class="row">
        <span>Receipt No</span>
        <span>${saleData.id || Date.now()}</span>
      </div>

      <div class="row">
        <span>Date</span>
        <span>${date.toLocaleString()}</span>
      </div>

      <div class="line"></div>

      <!-- ITEMS -->
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th class="right">Qty</th>
            <th class="right">Price</th>
            <th class="right">Amt</th>
          </tr>
        </thead>

        <tbody>
          ${items
            .map(
              (item: any) => `
            <tr>
              <td>${item.name}</td>
              <td class="right">${item.quantity}</td>
              <td class="right">${symbol}${item.price.toFixed(2)}</td>
              <td class="right">${symbol}${(item.price * item.quantity).toFixed(2)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>

      <div class="line"></div>

      <!-- TOTALS -->
      <div class="row">
        <span>Total Qty</span>
        <span>${totalQty}</span>
      </div>

      <div class="row">
        <span>Subtotal</span>
        <span>${symbol}${subtotal.toFixed(2)}</span>
      </div>

      ${discountAmount > 0 ? `
      <div class="row">
        <span>Discount</span>
        <span>-${symbol}${discountAmount.toFixed(2)}</span>
      </div>
      ` : ''}

      ${gstEnabled ? `
      <div class="row">
        <span>GST (${gstPercentage}%)</span>
        <span>${symbol}${gstAmount.toFixed(2)}</span>
      </div>
      ` : ''}

      <div class="row bold">
        <span>Grand Total</span>
        <span>${symbol}${total.toFixed(2)}</span>
      </div>

      <div class="line"></div>

      <!-- PAYMENT -->
      <div class="center bold">${saleData.paymentMethod || "CASH"}</div>

      <div class="row">
        <span>Paid</span>
        <span>${symbol}${(saleData.cashPaid || total).toFixed(2)}</span>
      </div>

      <div class="row">
        <span>Change</span>
        <span>${symbol}${(saleData.change || 0).toFixed(2)}</span>
      </div>

      <div class="line"></div>

      <!-- FOOTER -->
      <div class="center">*** THANK YOU ***</div>

    </body>
    </html>
    `;
  }
}

export default UniversalPrinter;
