import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Theme } from '../constants/theme';
import { Fonts } from '../constants/Fonts';
import BillPDFGenerator from '../components/BillPDFGenerator';
import { useToast } from '../components/Toast';
import { API_URL } from '@/constants/Config';

export default function CompanySettingsScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [settings, setSettings] = useState({
    name: '',
    address: '',
    gstNo: '',
    gstPercentage: 9,
    phone: '',
    email: '',
    cashierName: '',
    currency: 'SGD',
    currencySymbol: '$',
    companyLogo: '',
    halalLogo: '',
    showCompanyLogo: true,
    showHalalLogo: true,
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const storedId = await AsyncStorage.getItem('userId') || '1';
      setUserId(storedId);
      const data = await BillPDFGenerator.loadSettings(storedId);
      setSettings(data);
    } catch (error) {
      showToast({ type: 'error', message: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const success = await BillPDFGenerator.saveSettings(settings, userId);
      if (success) {
        showToast({ type: 'success', message: 'Settings saved successfully' });
      } else {
        throw new Error('Save failed');
      }
    } catch (error) {
      showToast({ type: 'error', message: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const pickImage = async (type: 'company' | 'halal') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'We need access to your photos to upload a logo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0].uri) {
      setSaving(true);
      const imageUrl = await BillPDFGenerator.uploadImage(result.assets[0].uri);
      if (imageUrl) {
        setSettings({
          ...settings,
          [type === 'company' ? 'companyLogo' : 'halalLogo']: `${API_URL}${imageUrl}`,
        });
        showToast({ type: 'success', message: 'Logo uploaded successfully' });
      } else {
        showToast({ type: 'error', message: 'Failed to upload image' });
      }
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Theme.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shop Settings</Text>
        <TouchableOpacity 
          style={[styles.saveButton, saving && styles.saveButtonDisabled]} 
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          
          {/* Logo Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Branding</Text>
            <View style={styles.logoGrid}>
              <View style={styles.logoItem}>
                <Text style={styles.logoLabel}>Company Logo</Text>
                <TouchableOpacity 
                  style={styles.logoPicker} 
                  onPress={() => pickImage('company')}
                >
                  {settings.companyLogo ? (
                    <Image source={{ uri: settings.companyLogo }} style={styles.logoPreview} />
                  ) : (
                    <Ionicons name="cloud-upload-outline" size={30} color={Theme.textMuted} />
                  )}
                </TouchableOpacity>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleText}>Show on bill</Text>
                  <Switch 
                    value={settings.showCompanyLogo} 
                    onValueChange={(val) => setSettings({...settings, showCompanyLogo: val})}
                    trackColor={{ false: '#ddd', true: Theme.primary }}
                  />
                </View>
              </View>

              <View style={styles.logoItem}>
                <Text style={styles.logoLabel}>Halal Logo</Text>
                <TouchableOpacity 
                  style={styles.logoPicker} 
                  onPress={() => pickImage('halal')}
                >
                  {settings.halalLogo ? (
                    <Image source={{ uri: settings.halalLogo }} style={styles.logoPreview} />
                  ) : (
                    <Ionicons name="ribbon-outline" size={30} color={Theme.textMuted} />
                  )}
                </TouchableOpacity>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleText}>Show on bill</Text>
                  <Switch 
                    value={settings.showHalalLogo} 
                    onValueChange={(val) => setSettings({...settings, showHalalLogo: val})}
                    trackColor={{ false: '#ddd', true: Theme.primary }}
                  />
                </View>
              </View>
            </View>
          </View>

          {/* Shop Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Shop Information</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Company Name</Text>
              <TextInput 
                style={styles.input}
                value={settings.name}
                onChangeText={(val) => setSettings({...settings, name: val})}
                placeholder="Enter shop name"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Address</Text>
              <TextInput 
                style={[styles.input, styles.textArea]}
                value={settings.address}
                onChangeText={(val) => setSettings({...settings, address: val})}
                placeholder="Enter shop address"
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.inputLabel}>Phone</Text>
                <TextInput 
                  style={styles.input}
                  value={settings.phone}
                  onChangeText={(val) => setSettings({...settings, phone: val})}
                  placeholder="+65 ..."
                  keyboardType="phone-pad"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput 
                  style={styles.input}
                  value={settings.email}
                  onChangeText={(val) => setSettings({...settings, email: val})}
                  placeholder="shop@example.com"
                  keyboardType="email-address"
                />
              </View>
            </View>
          </View>

          {/* Tax & Currency */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tax & Currency</Text>
            
            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.inputLabel}>GST Number</Text>
                <TextInput 
                  style={styles.input}
                  value={settings.gstNo}
                  onChangeText={(val) => setSettings({...settings, gstNo: val})}
                  placeholder="Registration No"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>GST (%)</Text>
                <TextInput 
                  style={styles.input}
                  value={settings.gstPercentage.toString()}
                  onChangeText={(val) => setSettings({...settings, gstPercentage: parseFloat(val) || 0})}
                  placeholder="9.0"
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.inputLabel}>Currency Code</Text>
                <TextInput 
                  style={styles.input}
                  value={settings.currency}
                  onChangeText={(val) => setSettings({...settings, currency: val})}
                  placeholder="SGD"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Symbol</Text>
                <TextInput 
                  style={styles.input}
                  value={settings.currencySymbol}
                  onChangeText={(val) => setSettings({...settings, currencySymbol: val})}
                  placeholder="$"
                />
              </View>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.bgMain,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  backButton: {
    padding: 5,
  },
  saveButton: {
    backgroundColor: Theme.primary,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 70,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontFamily: Fonts.bold,
    fontSize: 14,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    ...Theme.shadowSm,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    marginBottom: 20,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  logoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  logoItem: {
    width: '48%',
    alignItems: 'center',
  },
  logoLabel: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    marginBottom: 10,
  },
  logoPicker: {
    width: 100,
    height: 100,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: Theme.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.bgNav,
    overflow: 'hidden',
  },
  logoPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  toggleText: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
  },
  inputGroup: {
    marginBottom: 15,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Theme.bgNav,
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: Theme.textPrimary,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
  },
});
