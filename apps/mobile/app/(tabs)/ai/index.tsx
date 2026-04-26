import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '../../../lib/api/client';
import { Colors, Spacing, FontSize, Radius } from '../../../constants/theme';

interface QueryResult {
  question: string;
  answer: string;
  timestamp: Date;
}

const SUGGESTIONS = [
  'How much waste did we log this week?',
  'What were the top expenses this month?',
  'Which items are below PAR level?',
  'What is our food cost percentage?',
];

export default function AIScreen() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<QueryResult[]>([]);

  const ask = async (q?: string) => {
    const query = (q ?? question).trim();
    if (!query) return;

    setLoading(true);
    setQuestion('');

    try {
      const { data } = await apiClient.post('/api/ai/query', { question: query });
      setHistory((prev) => [{ question: query, answer: data.answer, timestamp: new Date() }, ...prev]);
    } catch (e: any) {
      setHistory((prev) => [
        { question: query, answer: 'Could not get an answer. Check your connection.', timestamp: new Date() },
        ...prev,
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={styles.title}>AI Assistant</Text>

        {history.length === 0 && (
          <View style={styles.suggestions}>
            <Text style={styles.suggestLabel}>Try asking:</Text>
            {SUGGESTIONS.map((s) => (
              <TouchableOpacity key={s} style={styles.suggestion} onPress={() => ask(s)}>
                <Text style={styles.suggestionText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <ScrollView contentContainerStyle={styles.history} style={{ flex: 1 }}>
          {history.map((item, i) => (
            <View key={i} style={styles.exchange}>
              <View style={styles.question}>
                <Text style={styles.questionText}>{item.question}</Text>
              </View>
              <View style={styles.answer}>
                <Text style={styles.answerText}>{item.answer}</Text>
              </View>
            </View>
          ))}
          {loading && (
            <View style={styles.thinking}>
              <ActivityIndicator color={Colors.primary} size="small" />
              <Text style={styles.thinkingText}>Thinking...</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={question}
            onChangeText={setQuestion}
            placeholder="Ask about your restaurant..."
            placeholderTextColor={Colors.textDisabled}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={() => ask()}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !question.trim() && styles.sendBtnDisabled]}
            onPress={() => ask()}
            disabled={!question.trim() || loading}
          >
            <Text style={styles.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.textPrimary, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  suggestions: { padding: Spacing.md, gap: Spacing.sm },
  suggestLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '500' },
  suggestion: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  suggestionText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '500' },
  history: { padding: Spacing.md, gap: Spacing.md },
  exchange: { gap: Spacing.sm },
  question: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    borderBottomRightRadius: Radius.sm,
    padding: Spacing.md,
    maxWidth: '80%',
  },
  questionText: { fontSize: FontSize.base, color: Colors.textInverse },
  answer: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderBottomLeftRadius: Radius.sm,
    padding: Spacing.md,
    maxWidth: '90%',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  answerText: { fontSize: FontSize.base, color: Colors.textPrimary, lineHeight: 22 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm },
  thinkingText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontStyle: 'italic' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.border },
  sendIcon: { fontSize: 20, color: Colors.textInverse, fontWeight: '700' },
});
