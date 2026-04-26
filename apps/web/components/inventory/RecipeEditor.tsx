'use client';

import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'motion/react';
import { inventoryApi } from '@/lib/api/inventory.api';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  name: z.string().min(1, 'Recipe name is required'),
  category: z.string().optional(),
  menuPrice: z.coerce.number().min(0).optional(),
  servingSize: z.string().optional(),
  prepTime: z.coerce.number().int().min(0).optional(),
  cookTime: z.coerce.number().int().min(0).optional(),
});
type FormData = z.infer<typeof schema>;

interface IngredientRow {
  itemId: string;
  itemName: string;
  quantity: string;
  unit: string;
  wastePct: string;
  avgCost: number;
}

interface Recipe {
  id: string;
  name: string;
  category?: string;
  menuPrice?: number;
  servingSize?: string;
  prepTime?: number;
  cookTime?: number;
  ingredients?: {
    itemId: string;
    itemName: string;
    quantity: number;
    unit: string;
    wastePct?: number;
    avgCost?: number;
  }[];
}

interface Props {
  recipe?: Recipe | null;
  onClose: () => void;
  onSaved: () => void;
}

const fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

function foodCostColor(pct: number): string {
  if (pct < 30) return 'text-green-600';
  if (pct <= 35) return 'text-yellow-600';
  return 'text-red-600';
}

export function RecipeEditor({ recipe, onClose, onSaved }: Props) {
  const isEdit = !!recipe;
  const [submitting, setSubmitting] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    recipe?.ingredients?.map(i => ({
      itemId: i.itemId,
      itemName: i.itemName,
      quantity: String(i.quantity),
      unit: i.unit,
      wastePct: String(i.wastePct ?? 0),
      avgCost: i.avgCost ?? 0,
    })) ?? []
  );
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: recipe?.name ?? '',
      category: recipe?.category ?? '',
      menuPrice: recipe?.menuPrice,
      servingSize: recipe?.servingSize ?? '',
      prepTime: recipe?.prepTime,
      cookTime: recipe?.cookTime,
    },
  });

  const menuPrice = watch('menuPrice') ?? 0;

  const totalCost = ingredients.reduce((sum, row) => {
    const qty = parseFloat(row.quantity) || 0;
    const waste = parseFloat(row.wastePct) || 0;
    return sum + qty * row.avgCost * (1 + waste / 100);
  }, 0);

  const foodCostPct = menuPrice > 0 ? (totalCost / menuPrice) * 100 : 0;

  const searchItems = useCallback(async (q: string) => {
    if (!q) { setSearchResults([]); setShowDropdown(false); return; }
    setSearchLoading(true);
    try {
      const res = await inventoryApi.items.list({ search: q, size: 10 });
      setSearchResults(res.data ?? []);
      setShowDropdown(true);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  function selectItem(item: any) {
    setIngredients(rows => [
      ...rows,
      {
        itemId: item.id,
        itemName: item.name,
        quantity: '1',
        unit: item.recipeUnit ?? item.countUnit ?? 'unit',
        wastePct: '0',
        avgCost: item.avgCost ?? 0,
      },
    ]);
    setSearch('');
    setSearchResults([]);
    setShowDropdown(false);
  }

  function updateIngredient(index: number, field: keyof IngredientRow, value: string) {
    setIngredients(rows =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function removeIngredient(index: number) {
    setIngredients(rows => rows.filter((_, i) => i !== index));
  }

  async function handleCalculateCost() {
    if (!isEdit) return;
    setCalculating(true);
    try {
      const res = await inventoryApi.recipes.calculateCost(recipe.id);
      if (res.data?.ingredients) {
        setIngredients(res.data.ingredients.map((i: any) => ({
          itemId: i.itemId,
          itemName: i.itemName,
          quantity: String(i.quantity),
          unit: i.unit,
          wastePct: String(i.wastePct ?? 0),
          avgCost: i.avgCost ?? 0,
        })));
      }
    } finally {
      setCalculating(false);
    }
  }

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        ...data,
        ingredients: ingredients.map(row => ({
          itemId: row.itemId,
          quantity: parseFloat(row.quantity) || 0,
          unit: row.unit,
          wastePct: parseFloat(row.wastePct) || 0,
        })),
      };
      if (isEdit) {
        await inventoryApi.recipes.update(recipe.id, payload);
      } else {
        await inventoryApi.recipes.create(payload);
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save recipe');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open onOpenChange={open => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit Recipe' : 'New Recipe'}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-6">
          {/* Basic recipe info */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="r-name">Recipe Name <span className="text-red-500">*</span></Label>
              <Input id="r-name" {...register('name')} placeholder="e.g. Butter Chicken" />
              {errors.name && <p className="text-red-600 text-xs">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="r-category">Category</Label>
                <Input id="r-category" {...register('category')} placeholder="e.g. Main Course" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-serving">Serving Size</Label>
                <Input id="r-serving" {...register('servingSize')} placeholder="e.g. 1 plate (300g)" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="r-price">Menu Price (₹)</Label>
                <Input id="r-price" type="number" step="0.01" min={0} {...register('menuPrice')} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-prep">Prep Time (min)</Label>
                <Input id="r-prep" type="number" min={0} {...register('prepTime')} placeholder="15" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-cook">Cook Time (min)</Label>
                <Input id="r-cook" type="number" min={0} {...register('cookTime')} placeholder="30" />
              </div>
            </div>
          </div>

          {/* Ingredients */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Ingredients</h3>
              {isEdit && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={handleCalculateCost}
                  disabled={calculating}
                >
                  {calculating ? 'Calculating…' : 'Calculate Cost'}
                </Button>
              )}
            </div>

            {/* Item search */}
            <div className="relative">
              <Input
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  searchItems(e.target.value);
                }}
                placeholder="Search and add ingredient…"
                onFocus={() => search && setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              />
              {searchLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg className="animate-spin h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                </div>
              )}
              <AnimatePresence>
                {showDropdown && searchResults.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute z-50 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-48 overflow-y-auto"
                  >
                    {searchResults.map((item: any) => (
                      <button
                        key={item.id}
                        type="button"
                        onMouseDown={() => selectItem(item)}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 text-left"
                      >
                        <span className="font-medium text-gray-900">{item.name}</span>
                        <span className="text-gray-400 text-xs">
                          {item.recipeUnit ?? item.countUnit ?? 'unit'}
                          {item.avgCost != null ? ` · ${fmt.format(item.avgCost)}` : ''}
                        </span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Ingredient rows */}
            {ingredients.length > 0 && (
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Ingredient</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Qty</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Unit</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Waste %</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Cost</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {ingredients.map((row, i) => {
                        const qty = parseFloat(row.quantity) || 0;
                        const waste = parseFloat(row.wastePct) || 0;
                        const rowCost = qty * row.avgCost * (1 + waste / 100);
                        return (
                          <motion.tr
                            key={`${row.itemId}-${i}`}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="border-b border-gray-100"
                          >
                            <td className="px-3 py-2 font-medium text-gray-900">{row.itemName}</td>
                            <td className="px-3 py-2 text-right">
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={row.quantity}
                                onChange={e => updateIngredient(i, 'quantity', e.target.value)}
                                className="w-20 h-7 text-sm text-right"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                value={row.unit}
                                onChange={e => updateIngredient(i, 'unit', e.target.value)}
                                className="w-20 h-7 text-sm"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                step="0.1"
                                value={row.wastePct}
                                onChange={e => updateIngredient(i, 'wastePct', e.target.value)}
                                className="w-16 h-7 text-sm text-right"
                              />
                            </td>
                            <td className="px-3 py-2 text-right text-gray-700">
                              {fmt.format(rowCost)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => removeIngredient(i)}
                                className="text-red-400 hover:text-red-600 text-xs"
                              >
                                ×
                              </button>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            )}

            {/* Cost summary */}
            <div className="bg-gray-50 rounded-lg border border-gray-200 px-4 py-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total Ingredient Cost</span>
                <span className="font-semibold text-gray-900">{fmt.format(totalCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Menu Price</span>
                <span className="font-semibold text-gray-900">{fmt.format(menuPrice)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-gray-200 pt-1 mt-1">
                <span className="font-medium text-gray-700">Food Cost %</span>
                <span className={`font-bold ${foodCostColor(foodCostPct)}`}>
                  {menuPrice > 0 ? `${foodCostPct.toFixed(1)}%` : '—'}
                </span>
              </div>
            </div>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <SheetFooter className="pt-4 border-t border-gray-200 flex gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Saving…
                </span>
              ) : isEdit ? 'Update Recipe' : 'Create Recipe'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
