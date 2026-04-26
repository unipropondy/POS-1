import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { Theme } from "../../constants/theme";
import { usePaymentSettingsStore } from "../../stores/paymentSettingsStore";

const { width } = Dimensions.get('window');

interface UPIPaymentModalProps {
  visible: boolean;
  onClose: () => void;
  amount: number;
  onSuccess: () => void;
  onFailed?: () => void;
}

const UPIPaymentModal: React.FC<UPIPaymentModalProps> = ({
  visible,
  onClose,
  amount,
  onSuccess,
  onFailed
}) => {
  const { settings } = usePaymentSettingsStore();
  const [showQR, setShowQR] = useState(false);
  
  useEffect(() => {
    if (visible) {
      // Small delay to ensure modal is fully visible before drawing QR
      const timer = setTimeout(() => setShowQR(true), 300);
      return () => clearTimeout(timer);
    } else {
      setShowQR(false);
    }
  }, [visible]);

  const handleManualSuccess = () => {
    Alert.alert(
      'Confirm Payment',
      'Have you verified the payment in your bank account?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Received',
          onPress: () => {
            onSuccess();
            onClose();
          }
        }
      ]
    );
  };

  // Generate UPI URL using the same logic provided in the prompt
  const generateUPIUrl = () => {
    if (!settings.upiId) return '';
    const cleanUpiId = settings.upiId.trim();
    const cleanShopName = settings.shopName.replace(/[&?=]/g, '').trim();
    // cu=INR is standard, but we'll use it as the base
    return `upi://pay?pa=${cleanUpiId}&pn=${encodeURIComponent(cleanShopName)}&am=${amount.toFixed(2)}&cu=INR`;
  };

  if (!settings.upiId) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>UPI QR Payment</Text>
                <Text style={styles.subtitle} numberOfLines={1}>{settings.shopName}</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Amount Box */}
            <View style={styles.amountContainer}>
              <Text style={styles.amountLabel}>Total Amount to Collect</Text>
              <Text style={styles.amountValue}>${amount.toFixed(2)}</Text>
            </View>

            {/* QR Code Container */}
            <View style={styles.qrContainer}>
              {showQR ? (
                <View style={styles.qrBox}>
                  <QRCode
                    value={generateUPIUrl()}
                    size={width > 500 ? 220 : 180}
                    color="#000"
                    backgroundColor="#fff"
                  />
                </View>
              ) : (
                <View style={[styles.qrBox, styles.qrLoader]}>
                  <ActivityIndicator size="large" color={Theme.primary} />
                </View>
              )}
              <Text style={styles.qrSubtext}>
                Ask customer to scan with any UPI App
              </Text>
            </View>

            {/* Instructions */}
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={20} color={Theme.primary} />
              <Text style={styles.infoText}>
                1. Customer scans and pays on their phone.{"\n"}
                2. Verify the notification on your device.{"\n"}
                3. Click "Payment Received" below to finish.
              </Text>
            </View>

            {/* Action Buttons */}
            <TouchableOpacity
              style={styles.successButton}
              onPress={handleManualSuccess}
            >
              <Ionicons name="checkmark-circle" size={24} color="#fff" />
              <Text style={styles.successButtonText}>Payment Received</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.failedButton}
              onPress={() => {
                Alert.alert('Cancel Payment', 'Are you sure you want to cancel this UPI transaction?', [
                  { text: 'No', style: 'cancel' },
                  {
                    text: 'Yes, Cancel',
                    onPress: () => {
                      if (onFailed) onFailed();
                      onClose();
                    }
                  }
                ]);
              }}
            >
              <Text style={styles.failedButtonText}>Cancel Transaction</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 450,
    maxHeight: '90%',
    backgroundColor: '#fff',
    borderRadius: 28,
    overflow: 'hidden',
    ...Theme.shadowLg,
  },
  scrollContent: {
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Theme.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
  },
  amountContainer: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  amountLabel: {
    fontSize: 13,
    color: Theme.textSecondary,
    fontWeight: '600',
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 32,
    fontWeight: '900',
    color: Theme.primary,
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  qrBox: {
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  qrLoader: {
    width: width > 500 ? 250 : 210,
    height: width > 500 ? 250 : 210,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrSubtext: {
    fontSize: 13,
    color: Theme.textSecondary,
    marginTop: 12,
    fontWeight: '500',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#F0F9FF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 24,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#0369A1',
    lineHeight: 18,
  },
  successButton: {
    flexDirection: 'row',
    backgroundColor: '#22c55e',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
  },
  successButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  failedButton: {
    padding: 8,
    alignItems: 'center',
  },
  failedButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default UPIPaymentModal;
