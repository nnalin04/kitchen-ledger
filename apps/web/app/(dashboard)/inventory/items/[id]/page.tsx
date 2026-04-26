'use client';

import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { motion } from 'motion/react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { inventoryApi } from '@/lib/api/inventory.api';

const fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

function generateSampleMovements() {
  const today = new Date();
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (29 - i));
    return {
      date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      stock: Math.max(0, Math.round(50 + Math.sin(i / 3) * 20 + Math.random() * 10)),
    };
  });
}

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data, isLoading, error } = useSWR(
    id ? `inventory/items/${id}` : null,
    () => inventoryApi.items.get(id).then((r: { data?: unknown }) => r.data)
  );

  const item = data as any;

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-gray-100 rounded w-64" />
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}
        </div>
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-lg font-medium">Item not found</p>
        <button
          onClick={() => router.push('/inventory')}
          className="mt-4 text-blue-600 hover:text-blue-800 text-sm underline"
        >
          Back to Inventory
        </button>
      </div>
    );
  }

  const isLowStock = (item.currentStock ?? 0) < (item.parLevel ?? 0);
  const stockPct = item.parLevel > 0
    ? Math.min(100, Math.round(((item.currentStock ?? 0) / item.parLevel) * 100))
    : 0;

  const chartData =
    item.movements?.length > 0
      ? item.movements.map((m: any) => ({
          date: new Date(m.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          stock: m.runningBalance ?? m.quantity,
        }))
      : generateSampleMovements();

  const abcColors: Record<string, string> = {
    A: 'bg-green-100 text-green-700',
    B: 'bg-yellow-100 text-yellow-700',
    C: 'bg-gray-100 text-gray-600',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => router.back()}
          className="mt-1 text-gray-400 hover:text-gray-600 transition-colors text-lg"
          aria-label="Go back"
        >
          ←
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{item.name}</h1>
            {item.abcCategory && (
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${abcColors[item.abcCategory] ?? abcColors.C}`}>
                {item.abcCategory} Category
              </span>
            )}
            {item.category && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">
                {item.category}
              </span>
            )}
          </div>
          {item.storageLocation && (
            <p className="text-sm text-gray-500 mt-1">Location: {item.storageLocation}</p>
          )}
        </div>
      </div>

      {/* Low-stock warning */}
      {isLowStock && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
          className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3"
        >
          <span className="text-red-500 font-bold text-lg">!</span>
          <p className="text-red-700 text-sm font-medium">
            Low stock alert — current stock ({item.currentStock} {item.countUnit}) is below PAR level ({item.parLevel}).
          </p>
        </motion.div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: 'Current Stock',
            value: `${item.currentStock ?? 0} ${item.countUnit ?? ''}`,
            sub: isLowStock ? 'Below PAR' : 'In stock',
            accent: isLowStock ? 'text-red-600' : 'text-green-600',
          },
          {
            label: 'PAR Level',
            value: `${item.parLevel ?? '—'} ${item.countUnit ?? ''}`,
            sub: 'Minimum required',
            accent: 'text-gray-700',
          },
          {
            label: 'Avg Cost',
            value: item.avgCost != null ? fmt.format(item.avgCost) : '—',
            sub: `per ${item.purchaseUnit ?? 'unit'}`,
            accent: 'text-gray-700',
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.07 }}
            className="bg-white rounded-xl border border-gray-200 shadow-sm p-5"
          >
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.accent}`}>{stat.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{stat.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Stock meter */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-700">Stock Level vs PAR</span>
          <span className="text-gray-500">{stockPct}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${stockPct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className={`h-full rounded-full ${
              stockPct >= 75 ? 'bg-green-500' : stockPct >= 40 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>0</span>
          <span>PAR: {item.parLevel ?? 0}</span>
        </div>
      </div>

      {/* Movement chart */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Stock Movement (30 days)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={4} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(v: unknown) => [`${v} ${item.countUnit ?? ''}`, 'Stock']}
            />
            <Line
              type="monotone"
              dataKey="stock"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Recipes using this item */}
      {item.recipes && item.recipes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Recipes Using This Item</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Recipe</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Food Cost %</th>
              </tr>
            </thead>
            <tbody>
              {item.recipes.map((r: any) => (
                <tr key={r.id ?? r.name} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">{r.name}</td>
                  <td className="px-4 py-2 text-right">
                    {r.foodCostPct != null ? (
                      <span
                        className={`font-medium ${
                          r.foodCostPct < 30
                            ? 'text-green-600'
                            : r.foodCostPct <= 35
                            ? 'text-yellow-600'
                            : 'text-red-600'
                        }`}
                      >
                        {r.foodCostPct.toFixed(1)}%
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}
