'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { apiClient } from '@/lib/api/client';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface QueryResult {
  question: string;
  answer?: string;
  chart_type?: 'line' | 'bar' | 'table';
  chart_data?: Record<string, unknown>[];
  chart_x_key?: string;
  chart_y_key?: string;
  table_headers?: string[];
  table_rows?: (string | number)[][];
}

const EXAMPLE_PROMPTS = [
  'How much did we spend on vegetables this week?',
  "What's my food cost % for this month?",
  'Show me top 5 wastage items',
  'Which employee worked the most hours?',
  "What was yesterday's net sales?",
  'Which items are below PAR level?',
];

// ── Sub-components ────────────────────────────────────────────────────────────

function InlineTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-700">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700">
            {headers.map(h => (
              <th
                key={h}
                className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <motion.tr
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, duration: 0.18 }}
              className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition-colors"
            >
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-gray-200">
                  {cell}
                </td>
              ))}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultCard({ result }: { result: QueryResult }) {
  const hasChart = result.chart_type === 'line' || result.chart_type === 'bar';
  const xKey = result.chart_x_key ?? 'name';
  const yKey = result.chart_y_key ?? 'value';

  return (
    <motion.div
      key={result.question}
      className="bg-gray-900 rounded-xl border border-gray-700 p-5 space-y-4"
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 h-5 w-5 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center mt-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        </div>
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide leading-relaxed flex-1">
          {result.question}
        </p>
      </div>

      {result.answer && (
        <motion.p
          className="text-gray-100 text-sm leading-relaxed whitespace-pre-wrap pl-7"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          {result.answer}
        </motion.p>
      )}

      {hasChart && result.chart_data && result.chart_data.length > 0 && (
        <motion.div
          className="h-52 pl-7"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
        >
          <ResponsiveContainer width="100%" height="100%">
            {result.chart_type === 'line' ? (
              <LineChart data={result.chart_data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey={xKey} tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#1F2937', border: '1px solid #374151', borderRadius: 8 }}
                  labelStyle={{ color: '#E5E7EB' }}
                  itemStyle={{ color: '#60A5FA' }}
                />
                <Line type="monotone" dataKey={yKey} stroke="url(#lineGradient)" strokeWidth={2.5} dot={false} />
                <defs>
                  <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </LineChart>
            ) : (
              <BarChart data={result.chart_data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey={xKey} tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#1F2937', border: '1px solid #374151', borderRadius: 8 }}
                  labelStyle={{ color: '#E5E7EB' }}
                  itemStyle={{ color: '#60A5FA' }}
                />
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                </defs>
                <Bar dataKey={yKey} fill="url(#barGradient)" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </motion.div>
      )}

      {result.chart_type === 'table' &&
        result.table_headers &&
        result.table_rows && (
          <div className="pl-7">
            <InlineTable headers={result.table_headers} rows={result.table_rows} />
          </div>
        )}
    </motion.div>
  );
}

// ── Animated loading dots ─────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-blue-400"
          animate={{ y: [0, -5, 0], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NaturalLanguageQueryPage() {
  const [question, setQuestion] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentResult, setCurrentResult] = useState<QueryResult | null>(null);
  const [history, setHistory] = useState<QueryResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const submitQuery = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || isLoading) return;
    setError(null);
    setIsLoading(true);
    setQuestion(trimmed);
    try {
      const res = await apiClient.post('/api/ai/query', { question: trimmed });
      const data: QueryResult = { question: trimmed, ...(res.data?.data ?? res.data) };
      setCurrentResult(data);
      setHistory(prev => [data, ...prev].slice(0, 5));
    } catch {
      setError('Query failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') submitQuery(question);
  }

  function handleExampleClick(prompt: string) {
    setQuestion(prompt);
    submitQuery(prompt);
  }

  function handleHistoryClick(item: QueryResult) {
    setQuestion(item.question);
    submitQuery(item.question);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="rounded-xl bg-gradient-to-br from-blue-50 to-violet-50 border border-blue-100/80 p-5"
      >
        <div className="flex items-center gap-3 mb-1">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Ask Anything</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Ask questions about your restaurant in plain English.
            </p>
          </div>
        </div>
      </motion.div>

      <div className="flex gap-5">
        {/* Main column */}
        <div className="flex-1 space-y-5 min-w-0">
          {/* Query bar */}
          <motion.div
            className="relative flex gap-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.07, ease: 'easeOut' }}
          >
            <div className="flex-1 relative">
              <motion.div
                className="absolute -inset-0.5 rounded-xl pointer-events-none"
                animate={{
                  boxShadow: isFocused
                    ? '0 0 0 2px rgba(99,102,241,0.35), 0 4px 16px rgba(99,102,241,0.12)'
                    : '0 0 0 0px rgba(99,102,241,0)',
                }}
                transition={{ duration: 0.2 }}
              />
              <input
                ref={inputRef}
                type="text"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="e.g. What was my food cost % last week?"
                className="w-full h-12 pl-4 pr-4 rounded-xl border border-gray-200 bg-white text-gray-900 text-sm font-mono focus:outline-none focus:border-blue-400 shadow-sm transition-colors placeholder:font-sans"
              />
            </div>
            <motion.button
              onClick={() => submitQuery(question)}
              disabled={isLoading || !question.trim()}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="h-12 px-6 rounded-xl text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center gap-2 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 transition-all"
            >
              {isLoading ? (
                <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  Ask
                </>
              )}
            </motion.button>
          </motion.div>

          {/* Example prompts */}
          <AnimatePresence>
            {!currentResult && !isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  Try asking
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {EXAMPLE_PROMPTS.map((prompt, i) => (
                    <motion.button
                      key={prompt}
                      onClick={() => handleExampleClick(prompt)}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.2 }}
                      whileHover={{ scale: 1.03, y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      className="text-left text-sm px-3.5 py-2.5 rounded-lg border border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 text-gray-600 transition-colors shadow-sm"
                    >
                      <span className="mr-1.5 text-gray-400">›</span>
                      {prompt}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loading */}
          <AnimatePresence>
            {isLoading && (
              <motion.div
                className="bg-gray-900 rounded-xl border border-gray-700 p-6 flex items-center gap-4"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <ThinkingDots />
                <div className="flex-1 min-w-0">
                  <p className="text-gray-200 font-medium text-sm">Thinking...</p>
                  <p className="text-gray-400 text-xs mt-0.5 truncate max-w-xs font-mono">{question}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {error && !isLoading && (
              <motion.div
                className="bg-red-950/60 border border-red-800/60 rounded-xl p-4 flex items-center gap-3"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <p className="text-sm text-red-300">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Result */}
          <AnimatePresence mode="wait">
            {currentResult && !isLoading && (
              <ResultCard key={currentResult.question} result={currentResult} />
            )}
          </AnimatePresence>
        </div>

        {/* History sidebar */}
        <AnimatePresence>
          {history.length > 0 && (
            <motion.div
              className="w-56 flex-shrink-0 space-y-2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                Recent
              </p>
              {history.map((item, i) => (
                <motion.button
                  key={i}
                  onClick={() => handleHistoryClick(item)}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.18 }}
                  whileHover={{ scale: 1.02, x: 2 }}
                  className="w-full text-left text-xs text-gray-600 px-3 py-2.5 rounded-lg border border-gray-200 bg-white hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50/50 transition-colors leading-relaxed line-clamp-2 shadow-sm"
                >
                  {item.question}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
