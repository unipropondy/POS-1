import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
  Image,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from "../../constants/theme";
import { API_URL } from "../../constants/Config";
import { usePaymentSettingsStore } from "../../stores/paymentSettingsStore";

const { width } = Dimensions.get('window');

interface PayNowPaymentModalProps {
  visible: boolean;
  onClose: () => void;
  amount: number;
  onSuccess: () => void;
  onFailed?: () => void;
}

const PayNowPaymentModal: React.FC<PayNowPaymentModalProps> = ({
  visible,
  onClose,
  amount,
  onSuccess,
  onFailed
}) => {
  const { settings } = usePaymentSettingsStore();

  const handleManualSuccess = () => {
    Alert.alert(
      'Confirm Payment',
      'Have you verified the PayNow transfer on your terminal?',
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

  if (!settings.payNowQrUrl) return null;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>PayNow QR Payment</Text>
              <Text style={styles.subtitle}>{settings.shopName}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={Theme.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Amount Box */}
          <View style={styles.amountContainer}>
            <Text style={styles.amountLabel}>Please Transfer Exactly</Text>
            <Text style={styles.amountValue}>${amount.toFixed(2)}</Text>
          </View>

          {/* Static QR Image */}
          <View style={styles.qrContainer}>
            <View style={styles.qrBox}>
              <Image 
                source={{ 
                  uri: settings.payNowQrUrl.startsWith('data:') 
                    ? settings.payNowQrUrl 
                    : `${API_URL}${settings.payNowQrUrl}` 
                }} 
                style={styles.qrImage}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.qrSubtext}>
              Scan this PayNow QR and enter the amount above
            </Text>
          </View>

          {/* Action Button */}
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
              Alert.alert('Cancel Payment', 'Cancel this PayNow transaction?', [
                { text: 'No', style: 'cancel' },
                {
                  text: 'Yes',
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
  },
  modalContent: {
    width: '90%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: 24,
    ...Theme.shadowLg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Theme.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
  },
  amountContainer: {
    backgroundColor: '#F0F9FF',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  amountLabel: {
    fontSize: 13,
    color: '#0369A1',
    fontWeight: '600',
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 36,
    fontWeight: '900',
    color: '#0284C7',
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  qrBox: {
    width: 250,
    height: 250,
    backgroundColor: '#fff',
    borderRadius: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  qrImage: {
    width: '100%',
    height: '100%',
  },
  qrSubtext: {
    fontSize: 13,
    color: Theme.textSecondary,
    marginTop: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  successButton: {
    flexDirection: 'row',
    backgroundColor: '#22c55e',
    padding: 18,
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
    padding: 12,
    alignItems: 'center',
  },
  failedButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default PayNowPaymentModal;
