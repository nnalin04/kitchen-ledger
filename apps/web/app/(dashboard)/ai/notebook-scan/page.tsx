'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { apiClient } from '@/lib/api/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ── Types ─────────────────────────────────────────────────────────────────────

type ContextType = 'inventory_count' | 'expense_receipt';
type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface MatchedItem {
  id: string;
  extractedName: string;
  matchedItemName: string;
  matchedItemId: string;
  quantity: number;
  unit: string;
  confidence: number;
  included: boolean;
}

interface UnmatchedItem {
  id: string;
  rawText: string;
  selectedItemId: string | null;
}

interface OcrJobResult {
  jobId: string;
  status: JobStatus;
  matchedItems?: MatchedItem[];
  unmatchedItems?: UnmatchedItem[];
  overallConfidence?: number;
}

interface InventoryItem {
  id: string;
  name: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function confidenceBadge(score: number) {
  if (score >= 85) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        {score.toFixed(0)}% High
      </span>
    );
  }
  if (score >= 70) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        {score.toFixed(0)}% Medium
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
      {score.toFixed(0)}% Low
    </span>
  );
}

const PROGRESS_VALUES: Record<JobStatus, number> = {
  pending: 25,
  processing: 65,
  completed: 100,
  failed: 100,
};

function AnimatedProgressBar({ status }: { status: JobStatus }) {
  const progress = PROGRESS_VALUES[status];
  const isFailed = status === 'failed';
  return (
    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
      <motion.div
        className={`h-2 rounded-full ${isFailed ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 to-violet-500'}`}
        initial={{ width: '5%' }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  );
}

// ── Upload Icon ───────────────────────────────────────────────────────────────

function UploadIcon({ hovering }: { hovering: boolean }) {
  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-blue-400"
      animate={{ y: hovering ? -4 : 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 18 }}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </motion.svg>
  );
}

// ── Checkmark Icon ────────────────────────────────────────────────────────────

function CheckmarkIcon() {
  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 20 }}
    >
      <polyline points="20 6 9 17 4 12" />
    </motion.svg>
  );
}

// ── Processing Spinner ────────────────────────────────────────────────────────

function ProcessingSpinner() {
  return (
    <div className="relative h-10 w-10 flex-shrink-0">
      <motion.div className="absolute inset-0 rounded-full border-2 border-violet-800/60" />
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-2 w-2 rounded-full bg-blue-400" />
      </div>
    </div>
  );
}

// ── Dark card wrapper ─────────────────────────────────────────────────────────

function DarkCard({
  children,
  className = '',
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-xl ${className}`}
      style={{
        background: 'rgba(14,18,35,0.95)',
        boxShadow: '0 0 0 1px rgba(30,41,59,0.8)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NotebookScanPage() {
  const shouldReduce = useReducedMotion();
  const [contextType, setContextType] = useState<ContextType>('inventory_count');
  const [isDragging, setIsDragging] = useState(false);
  const [dropZoneHovering, setDropZoneHovering] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'polling' | 'done' | 'error'>('idle');
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [result, setResult] = useState<OcrJobResult | null>(null);
  const [matchedItems, setMatchedItems] = useState<MatchedItem[]>([]);
  const [unmatchedItems, setUnmatchedItems] = useState<UnmatchedItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commitSuccess, setCommitSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    apiClient.get('/api/inventory/items?limit=200')
      .then((r: { data: { data?: unknown; [k: string]: unknown } }) => {
        const items = r.data?.data ?? r.data ?? [];
        setInventoryItems(Array.isArray(items) ? items : []);
      })
      .catch(() => {});
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  const startPolling = useCallback((jobId: string) => {
    setUploadStatus('polling');
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiClient.get(`/api/ai/jobs/${jobId}`);
        const job: OcrJobResult = res.data?.data ?? res.data;
        setJobStatus(job.status);
        if (job.status === 'completed') {
          clearInterval(pollRef.current!);
          setResult(job);
          setMatchedItems(
            (job.matchedItems ?? []).map(item => ({ ...item, included: true }))
          );
          setUnmatchedItems(job.unmatchedItems ?? []);
          setUploadStatus('done');
        } else if (job.status === 'failed') {
          clearInterval(pollRef.current!);
          setUploadStatus('error');
          setError('OCR processing failed. Please try again.');
        }
      } catch {
        clearInterval(pollRef.current!);
        setUploadStatus('error');
        setError('Failed to check job status.');
      }
    }, 2000);
  }, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setSelectedFile(file);
    setUploadStatus('uploading');
    setJobStatus('pending');

    try {
      const form = new FormData();
      form.append('file', file);
      const uploadRes = await apiClient.post('/api/files/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const fileUrl: string = uploadRes.data?.data?.url ?? uploadRes.data?.url;

      const ocrRes = await apiClient.post('/api/ai/ocr/receipt', {
        file_url: fileUrl,
        context_type: contextType,
      });
      const jobId: string = ocrRes.data?.data?.job_id ?? ocrRes.data?.job_id;
      setJobStatus('pending');
      startPolling(jobId);
    } catch {
      setUploadStatus('error');
      setError('Upload failed. Please check the file and try again.');
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function toggleIncluded(id: string) {
    setMatchedItems(prev =>
      prev.map(item => item.id === id ? { ...item, included: !item.included } : item)
    );
  }

  function updateQuantity(id: string, qty: string) {
    const num = parseFloat(qty);
    if (isNaN(num)) return;
    setMatchedItems(prev =>
      prev.map(item => item.id === id ? { ...item, quantity: num } : item)
    );
  }

  function setUnmatchedSelection(id: string, itemId: string) {
    setUnmatchedItems(prev =>
      prev.map(item => item.id === id ? { ...item, selectedItemId: itemId } : item)
    );
  }

  async function handleCommit() {
    if (!result) return;
    const jobId = result.jobId;
    const selected = matchedItems.filter(i => i.included).map(i => ({
      matched_item_id: i.matchedItemId,
      quantity: i.quantity,
      unit: i.unit,
    }));
    const resolved = unmatchedItems
      .filter(i => i.selectedItemId && i.selectedItemId !== '__new__')
      .map(i => ({ matched_item_id: i.selectedItemId!, raw_text: i.rawText }));

    try {
      await apiClient.post(`/api/ai/ocr/notebook/${jobId}/commit`, {
        items: [...selected, ...resolved],
      });
      setCommitSuccess(true);
      setTimeout(() => {
        setCommitSuccess(false);
        showToast(`${selected.length + resolved.length} items updated`);
        setResult(null);
        setMatchedItems([]);
        setUnmatchedItems([]);
        setSelectedFile(null);
        setUploadStatus('idle');
        setJobStatus(null);
      }, 800);
    } catch {
      setError('Commit failed. Please try again.');
    }
  }

  const isProcessing = uploadStatus === 'uploading' || uploadStatus === 'polling';

  return (
    <div
      className="min-h-screen p-6"
      style={{ background: 'linear-gradient(160deg, #020617 0%, #0a0f1e 50%, #020617 100%)' }}
    >
      <div className="space-y-6 max-w-5xl">
        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              className="fixed top-5 right-5 z-50 bg-emerald-600 text-white px-5 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2"
              initial={{ opacity: 0, y: -12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.2 }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              {toast}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: shouldReduce ? 0 : 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <div className="flex items-center gap-3 mb-1">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <line x1="10" y1="9" x2="8" y2="9" />
              </svg>
            </div>
            <h1 className="font-serif text-2xl text-slate-100">Notebook / Receipt Scan</h1>
          </div>
          <p className="text-sm text-slate-400 mt-1 ml-11">
            Upload a photo or PDF — AI extracts and matches items automatically.
          </p>
        </motion.div>

        {/* Context toggle */}
        <motion.div
          initial={{ opacity: 0, y: shouldReduce ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.07, ease: 'easeOut' }}
        >
          <DarkCard className="p-5 space-y-3">
            <p className="text-xs font-semibold tracking-[0.12em] text-slate-400 uppercase">
              What are you scanning?
            </p>
            <div className="flex gap-3">
              {([
                {
                  value: 'inventory_count', label: 'Inventory Count', icon: (
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                  ),
                },
                {
                  value: 'expense_receipt', label: 'Expense Receipt', icon: (
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                  ),
                },
              ] as const).map(opt => (
                <motion.button
                  key={opt.value}
                  onClick={() => setContextType(opt.value)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                    contextType === opt.value
                      ? 'border-blue-500/60 bg-blue-500/15 text-blue-300 shadow-sm'
                      : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                  }`}
                >
                  <span className={contextType === opt.value ? 'text-blue-400' : 'text-slate-500'}>
                    {opt.icon}
                  </span>
                  {opt.label}
                </motion.button>
              ))}
            </div>
          </DarkCard>
        </motion.div>

        {/* Drop zone */}
        <AnimatePresence>
          {uploadStatus === 'idle' && (
            <motion.div
              initial={{ opacity: 0, y: shouldReduce ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.25, delay: 0.1, ease: 'easeOut' }}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              onMouseEnter={() => setDropZoneHovering(true)}
              onMouseLeave={() => setDropZoneHovering(false)}
              className="flex flex-col items-center justify-center gap-4 rounded-xl p-14 cursor-pointer transition-colors"
              style={{
                background: isDragging
                  ? 'rgba(59,130,246,0.08)'
                  : dropZoneHovering
                    ? 'rgba(14,18,35,0.98)'
                    : 'rgba(14,18,35,0.95)',
                border: isDragging
                  ? '2px dashed rgba(59,130,246,0.6)'
                  : dropZoneHovering
                    ? '2px dashed rgba(99,102,241,0.5)'
                    : '2px dashed rgba(30,41,59,0.9)',
                transition: 'border-color 0.2s ease, background-color 0.2s ease',
              }}
            >
              <UploadIcon hovering={dropZoneHovering || isDragging} />
              <div className="text-center">
                <p className="font-semibold text-slate-200">Drag & drop or click to browse</p>
                <p className="text-sm text-slate-500 mt-1">JPG, PNG, WEBP, PDF — max 20 MB</p>
              </div>
              <span className="px-4 py-1.5 rounded-full bg-blue-500/15 text-blue-400 text-xs font-medium border border-blue-500/30">
                Powered by AI OCR
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={onFileChange}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Processing state */}
        <AnimatePresence>
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0, y: shouldReduce ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <DarkCard className="p-6 space-y-5">
                <div className="flex items-center gap-4">
                  <ProcessingSpinner />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-100">
                      {uploadStatus === 'uploading' ? 'Uploading file...' : 'AI is reading your document...'}
                    </p>
                    <p className="text-sm text-slate-500 mt-0.5 truncate font-mono">{selectedFile?.name}</p>
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 capitalize">
                    {jobStatus ?? 'uploading'}
                  </span>
                </div>
                <AnimatedProgressBar status={jobStatus ?? 'pending'} />
                <p className="text-xs text-slate-600 font-mono">
                  This usually takes 10–20 seconds for handwritten pages.
                </p>
              </DarkCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error state */}
        <AnimatePresence>
          {uploadStatus === 'error' && (
            <motion.div
              className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 flex items-start gap-3"
              style={{ boxShadow: '0 0 0 1px rgba(239,68,68,0.15)' }}
              initial={{ opacity: 0, y: shouldReduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <div>
                <p className="text-sm text-red-400 font-medium">{error}</p>
                <button
                  className="mt-1.5 text-sm text-red-500 underline hover:text-red-400"
                  onClick={() => { setUploadStatus('idle'); setError(null); setSelectedFile(null); }}
                >
                  Try again
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <AnimatePresence>
          {uploadStatus === 'done' && result && (
            <motion.div
              className="space-y-5"
              initial={{ opacity: 0, y: shouldReduce ? 0 : 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              {/* Overall confidence */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                  Overall confidence:
                </span>
                <div className="scale-110 origin-left">
                  {confidenceBadge(result.overallConfidence ?? 0)}
                </div>
                <button
                  className="ml-auto text-xs text-slate-500 hover:text-slate-300 underline transition-colors"
                  onClick={() => { setUploadStatus('idle'); setResult(null); setSelectedFile(null); }}
                >
                  Scan another
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Matched Items */}
                <DarkCard className="overflow-hidden">
                  <div className="p-4 border-b border-slate-800/80">
                    <h2 className="font-semibold text-slate-200 flex items-center gap-2 text-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      Matched Items
                      <span className="text-xs text-slate-500 font-normal">
                        ({matchedItems.filter(i => i.included).length} selected)
                      </span>
                    </h2>
                  </div>
                  {matchedItems.length === 0 ? (
                    <div className="p-8 flex flex-col items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(71,85,105,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <p className="text-sm text-slate-500">No matched items found.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800/60">
                      {matchedItems.map((item, i) => (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, x: shouldReduce ? 0 : -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04, duration: 0.2 }}
                          className={`p-3 flex items-center gap-3 transition-opacity ${item.included ? '' : 'opacity-40'}`}
                        >
                          <input
                            type="checkbox"
                            checked={item.included}
                            onChange={() => toggleIncluded(item.id)}
                            className="h-4 w-4 rounded accent-blue-500 flex-shrink-0 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-200 truncate">
                              {item.matchedItemName}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              Extracted: &ldquo;{item.extractedName}&rdquo;
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={e => updateQuantity(item.id, e.target.value)}
                              className="w-16 text-sm bg-slate-800 border border-slate-700 text-slate-100 rounded-lg px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 font-mono"
                              min="0"
                              step="0.01"
                            />
                            <span className="text-xs text-slate-500 w-6">{item.unit}</span>
                          </div>
                          <div className="flex-shrink-0">
                            {confidenceBadge(item.confidence)}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </DarkCard>

                {/* Unmatched Items */}
                <DarkCard className="overflow-hidden">
                  <div className="p-4 border-b border-slate-800/80">
                    <h2 className="font-semibold text-slate-200 flex items-center gap-2 text-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      Unmatched Items
                      <span className="text-xs text-slate-500 font-normal">
                        ({unmatchedItems.length})
                      </span>
                    </h2>
                  </div>
                  {unmatchedItems.length === 0 ? (
                    <div className="p-8 flex flex-col items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      <p className="text-sm text-slate-300 font-medium">All items were matched.</p>
                      <p className="text-xs text-slate-500">Great scan quality!</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800/60">
                      {unmatchedItems.map((item, i) => (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, x: shouldReduce ? 0 : 8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04, duration: 0.2 }}
                          className="p-3 space-y-2"
                        >
                          <p className="text-sm text-slate-400 italic">&ldquo;{item.rawText}&rdquo;</p>
                          <Select
                            value={item.selectedItemId ?? ''}
                            onValueChange={(val: string) => setUnmatchedSelection(item.id, val)}
                          >
                            <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200">
                              <SelectValue placeholder="Match to item or skip" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-700 text-slate-200">
                              <SelectItem value="__new__" className="focus:bg-slate-800">
                                + Create New Item
                              </SelectItem>
                              {inventoryItems.map(inv => (
                                <SelectItem key={inv.id} value={inv.id} className="focus:bg-slate-800">
                                  {inv.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </DarkCard>
              </div>

              {/* Commit button */}
              <div className="flex justify-end">
                <motion.button
                  onClick={handleCommit}
                  disabled={
                    commitSuccess ||
                    (matchedItems.filter(i => i.included).length === 0 &&
                      unmatchedItems.filter(i => i.selectedItemId && i.selectedItemId !== '__new__').length === 0)
                  }
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white shadow-sm transition-all disabled:cursor-not-allowed ${
                    commitSuccess
                      ? 'bg-emerald-600'
                      : 'bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:opacity-50'
                  }`}
                >
                  <AnimatePresence mode="wait">
                    {commitSuccess ? (
                      <motion.span
                        key="success"
                        className="flex items-center gap-2"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <CheckmarkIcon />
                        Committed!
                      </motion.span>
                    ) : (
                      <motion.span key="idle" className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        Commit Selected Items
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
