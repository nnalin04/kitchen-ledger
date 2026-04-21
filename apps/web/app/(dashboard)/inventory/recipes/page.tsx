'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { inventoryApi } from '@/lib/api/inventory.api';

function FoodCostBadge({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="text-xs text-gray-400">—</span>;
  const color =
    pct < 30
      ? 'bg-green-100 text-green-700'
      : pct <= 35
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-red-100 text-red-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${color}`}>
      {pct.toFixed(1)}%
    </span>
  );
}

export default function RecipesPage() {
  const { data: recipesData, isLoading } = useSWR('inventory/recipes', () =>
    inventoryApi.recipes.list().then(r => r.data ?? [])
  );

  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const recipes: any[] = recipesData ?? [];

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await inventoryApi.recipes.create({ name: newName.trim() });
      setNewName('');
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Recipes</h1>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Add Recipe
        </button>
      </div>

      {/* Recipe cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse space-y-2">
              <div className="h-5 bg-gray-100 rounded w-3/4" />
              <div className="h-4 bg-gray-100 rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : recipes.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {recipes.map((recipe: any) => (
            <div
              key={recipe.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-gray-900 leading-snug">{recipe.name}</p>
                <FoodCostBadge pct={recipe.foodCostPct ?? recipe.food_cost_pct} />
              </div>
              {recipe.category && (
                <p className="text-xs text-gray-400 mt-1">{recipe.category}</p>
              )}
              <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                <span>{recipe.ingredientCount ?? recipe.ingredients?.length ?? 0} ingredients</span>
                {recipe.sellingPrice != null && (
                  <span className="font-medium text-gray-700">₹{recipe.sellingPrice.toFixed(2)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
          <p className="text-lg font-medium">No recipes yet</p>
          <p className="text-sm mt-1">Add your first recipe to track food costs</p>
        </div>
      )}

      {/* Add recipe modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-bold text-gray-900">New Recipe</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Recipe Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Butter Chicken"
                  required
                  autoFocus
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Creating…' : 'Create Recipe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
