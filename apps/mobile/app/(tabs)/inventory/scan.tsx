import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { apiClient } from '../../../lib/api/client';
import { Colors, Spacing, FontSize, Radius } from '../../../constants/theme';

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, []);

  const handleBarcode = async ({ data: barcode }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    try {
      const { data } = await apiClient.get(`/api/inventory/items/by-barcode/${barcode}`);
      if (data.item) {
        router.replace({
          pathname: '/(tabs)/inventory/waste',
          params: { prefillItemId: data.item.id },
        });
      } else {
        Alert.alert('Not found', `No item found for barcode: ${barcode}`, [
          { text: 'OK', onPress: () => setScanned(false) },
        ]);
      }
    } catch {
      Alert.alert('Error', 'Could not look up barcode.', [
        { text: 'OK', onPress: () => setScanned(false) },
      ]);
    }
  };

  if (!permission?.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Camera permission required</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarcode}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'qr', 'code128', 'code39'] }}
      >
        <View style={styles.overlay}>
          <View style={styles.frame} />
          <Text style={styles.hint}>Point at a barcode or QR code</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
            <Text style={styles.closeBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  text: { fontSize: FontSize.base, color: Colors.textSecondary },
  btn: { backgroundColor: Colors.primary, padding: Spacing.md, borderRadius: Radius.md },
  btnText: { color: Colors.textInverse, fontWeight: '700' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.xl },
  frame: {
    width: 250,
    height: 180,
    borderWidth: 3,
    borderColor: Colors.textInverse,
    borderRadius: Radius.md,
  },
  hint: { color: Colors.textInverse, fontSize: FontSize.base, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  closeBtn: { position: 'absolute', bottom: 60, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.full },
  closeBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.base },
});
