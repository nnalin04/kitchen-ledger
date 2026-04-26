import { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { Audio } from 'expo-av';
import { apiClient } from '../../lib/api/client';
import { Colors, Spacing, FontSize, Radius } from '../../constants/theme';

interface Props {
  commandType: 'waste' | 'stock_count' | 'receipt';
  onResult: (parsed: any) => void;
}

export function VoiceInput({ commandType, onResult }: Props) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const startPulse = () => {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    );
    pulseLoop.current.start();
  };

  const stopPulse = () => {
    pulseLoop.current?.stop();
    pulseAnim.setValue(1);
  };

  const startRecording = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission required', 'Microphone access is needed for voice input.');
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      startPulse();
    } catch (e) {
      Alert.alert('Error', 'Could not start recording.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    stopPulse();
    setProcessing(true);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (!uri) throw new Error('No audio URI');

      const form = new FormData();
      form.append('audio', { uri, type: 'audio/m4a', name: 'voice.m4a' } as any);
      form.append('command_type', commandType);
      form.append('language', 'en');

      const { data } = await apiClient.post('/api/ai/voice/transcribe', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setTranscript(data.transcript);

      if (data.confidence < 0.7) {
        Alert.alert(
          'Did you mean?',
          data.transcript,
          [
            { text: 'No, cancel', style: 'cancel' },
            { text: 'Yes, use this', onPress: () => onResult(data.parsed) },
          ]
        );
      } else {
        onResult(data.parsed);
      }
    } catch (e: any) {
      Alert.alert('Transcription failed', 'Try again or log manually.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <TouchableOpacity
          style={[styles.micBtn, recording && styles.micBtnActive]}
          onPressIn={startRecording}
          onPressOut={stopRecording}
          disabled={processing}
          activeOpacity={0.8}
        >
          {processing ? (
            <ActivityIndicator color={Colors.textInverse} />
          ) : (
            <Text style={styles.micIcon}>{recording ? '🔴' : '🎤'}</Text>
          )}
        </TouchableOpacity>
      </Animated.View>

      <Text style={styles.hint}>
        {processing
          ? 'Transcribing...'
          : recording
          ? 'Release to transcribe'
          : 'Hold to speak'}
      </Text>

      {transcript && !processing && (
        <Text style={styles.transcript} numberOfLines={2}>
          "{transcript}"
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  micBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnActive: { backgroundColor: Colors.danger },
  micIcon: { fontSize: 24 },
  hint: { fontSize: FontSize.xs, color: Colors.textSecondary },
  transcript: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
