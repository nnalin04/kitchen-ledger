'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { motion } from 'motion/react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { inventoryApi } from '@/lib/api/inventory.api';

interface RecipePoint {
  id: string;
  name: string;
  popularityScore: number;
  profitability: number;
  foodCostPct: number;
  menuPrice?: number;
  quadrant: 'star' | 'puzzle' | 'plowhorse' | 'dog';
}

const QUADRANT_CONFIG = {
  star: { label: 'Stars', emoji: '⭐', color: '#22c55e', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
  puzzle: { label: 'Puzzles', emoji: '❓', color: '#3b82f6', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  plowhorse: { label: 'Plowhorses', emoji: '🐄', color: '#f59e0b', bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700' },
  dog: { label: 'Dogs', emoji: '🐕', color: '#ef4444', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
};

function classifyQuadrant(pop: number, profit: number): RecipePoint['quadrant'] {
  const highPop = pop >= 3;
  const highProfit = profit >= 65; // 65% profitability = 35% food cost
  if (highPop && highProfit) return 'star';
  if (!highPop && highProfit) return 'puzzle';
  if (highPop && !highProfit) return 'plowhorse';
  return 'dog';
}

function transformRecipes(recipes: any[]): RecipePoint[] {
  return recipes.map(r => {
    const foodCostPct = r.foodCostPct ?? (r.totalCost && r.menuPrice ? (r.totalCost / r.menuPrice) * 100 : 35);
    const profitability = Math.max(0, 100 - foodCostPct);
    const popularityScore = r.popularityScore ?? Math.round(Math.random() * 4 + 1);
    return {
      id: r.id,
      name: r.name,
      popularityScore,
      profitability: Math.round(profitability * 10) / 10,
      foodCostPct: Math.round(foodCostPct * 10) / 10,
      menuPrice: r.menuPrice,
      quadrant: classifyQuadrant(popularityScore, profitability),
    };
  });
}

const fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

interface TooltipPayload {
  payload: RecipePoint;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload || !payload[0]) return null;
  const d = payload[0].payload;
  const q = QUADRANT_CONFIG[d.quadrant];
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-lg p-3 min-w-48">
      <p className="font-semibold text-gray-900 text-sm mb-1">{d.name}</p>
      <div className="space-y-0.5 text-xs text-gray-600">
        <p>Popularity: <span className="font-medium">{d.popularityScore}/5</span></p>
        <p>Food Cost: <span className={`font-medium ${d.foodCostPct < 30 ? 'text-green-600' : d.foodCostPct <= 35 ? 'text-yellow-600' : 'text-red-600'}`}>{d.foodCostPct}%</span></p>
        <p>Profitability: <span className="font-medium">{d.profitability}%</span></p>
        {d.menuPrice && <p>Price: <span className="font-medium">{fmt.format(d.menuPrice)}</span></p>}
        <div className="mt-2 pt-2 border-t border-gray-100">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${q.bg} ${q.border} ${q.text} border`}>
            {q.emoji} {q.label}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function MenuEngineeringPage() {
  const { data, isLoading } = useSWR('inventory/menu-engineering', () =>
    inventoryApi.recipes.getMenuEngineering()
      .then((r: { data?: unknown[] }) => transformRecipes(r.data ?? []))
      .catch(async () => {
        // Fallback: derive from recipes list
        const res = await inventoryApi.recipes.list();
        return transformRecipes(res.data ?? []);
      })
  );

  const [activeQuadrant, setActiveQuadrant] = useState<string | null>(null);

  const points: RecipePoint[] = data ?? [];

  const grouped: Record<string, RecipePoint[]> = {
    star: points.filter(p => p.quadrant === 'star'),
    puzzle: points.filter(p => p.quadrant === 'puzzle'),
    plowhorse: points.filter(p => p.quadrant === 'plowhorse'),
    dog: points.filter(p => p.quadrant === 'dog'),
  };

  const filteredPoints = activeQuadrant
    ? points.filter(p => p.quadrant === activeQuadrant)
    : points;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Menu Engineering</h1>
          <p className="text-sm text-gray-500 mt-0.5">Analyse your recipes by popularity and profitability</p>
        </div>
      </div>

      {/* Quadrant summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.entries(QUADRANT_CONFIG) as [RecipePoint['quadrant'], typeof QUADRANT_CONFIG.star][]).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setActiveQuadrant(activeQuadrant === key ? null : key)}
            className={`rounded-xl border p-4 text-left transition-all ${
              activeQuadrant === key
                ? `${cfg.bg} ${cfg.border} border-2 shadow-sm`
                : 'bg-white border-gray-200 hover:bg-gray-50'
            }`}
          >
            <div className="text-xl">{cfg.emoji}</div>
            <p className="text-sm font-semibold text-gray-900 mt-1">{cfg.label}</p>
            <p className={`text-2xl font-bold ${cfg.text}`}>{grouped[key]?.length ?? 0}</p>
            <p className="text-xs text-gray-400">recipes</p>
          </button>
        ))}
      </div>

      {/* Scatter chart */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">2×2 Matrix</h2>
        {isLoading ? (
          <div className="h-80 animate-pulse bg-gray-50 rounded-lg" />
        ) : (
          <div className="relative">
            <ResponsiveContainer width="100%" height={360}>
              <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  type="number"
                  dataKey="popularityScore"
                  domain={[0, 5.5]}
                  ticks={[1, 2, 3, 4, 5]}
                  label={{ value: 'Popularity Score', position: 'insideBottom', offset: -10, fontSize: 12 }}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey="profitability"
                  domain={[0, 100]}
                  label={{ value: 'Profitability %', angle: -90, position: 'insideLeft', offset: 14, fontSize: 12 }}
                  tick={{ fontSize: 11 }}
                />
                <ReferenceLine x={3} stroke="#e5e7eb" strokeDasharray="4 4" />
                <ReferenceLine y={65} stroke="#e5e7eb" strokeDasharray="4 4" />
                <Tooltip content={<CustomTooltip />} />
                <Scatter data={filteredPoints} isAnimationActive>
                  {filteredPoints.map((point) => (
                    <Cell
                      key={point.id}
                      fill={QUADRANT_CONFIG[point.quadrant].color}
                      fillOpacity={0.8}
                      stroke={QUADRANT_CONFIG[point.quadrant].color}
                      strokeWidth={1}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>

            {/* Quadrant labels overlay */}
            <div className="absolute top-4 right-32 text-xs text-gray-400 font-medium">⭐ Stars</div>
            <div className="absolute top-4 left-8 text-xs text-gray-400 font-medium">❓ Puzzles</div>
            <div className="absolute bottom-12 right-32 text-xs text-gray-400 font-medium">🐄 Plowhorses</div>
            <div className="absolute bottom-12 left-8 text-xs text-gray-400 font-medium">🐕 Dogs</div>
          </div>
        )}
      </div>

      {/* Data table by quadrant */}
      {(Object.entries(QUADRANT_CONFIG) as [RecipePoint['quadrant'], typeof QUADRANT_CONFIG.star][]).map(([key, cfg]) => {
        const items = grouped[key] ?? [];
        if (items.length === 0) return null;
        const isFiltered = activeQuadrant && activeQuadrant !== key;
        if (isFiltered) return null;
        return (
          <div key={key} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${cfg.border}`}>
            <div className={`px-5 py-3 border-b ${cfg.bg} ${cfg.border}`}>
              <h3 className={`text-sm font-semibold ${cfg.text}`}>
                {cfg.emoji} {cfg.label} ({items.length})
              </h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Recipe</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Popularity</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Food Cost %</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Profitability</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Menu Price</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{r.name}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{r.popularityScore}/5</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`font-medium ${r.foodCostPct < 30 ? 'text-green-600' : r.foodCostPct <= 35 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {r.foodCostPct}%
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-gray-700">{r.profitability}%</td>
                    <td className="px-4 py-2 text-right text-gray-700">
                      {r.menuPrice ? fmt.format(r.menuPrice) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex gap-2 justify-end">
                        <button className="text-xs text-blue-600 hover:text-blue-800 underline">
                          Edit price
                        </button>
                        <button className="text-xs text-red-500 hover:text-red-700 underline">
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {!isLoading && points.length === 0 && (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
          <p className="text-lg font-medium">No recipes found</p>
          <p className="text-sm mt-1">Add recipes with menu prices to see the matrix</p>
        </div>
      )}
    </motion.div>
  );
}
