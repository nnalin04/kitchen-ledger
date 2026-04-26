'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'motion/react';
import { inventoryApi } from '@/lib/api/inventory.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

export default function CategoriesPage() {
  const { data, isLoading } = useSWR('inventory/items-for-cats', () =>
    inventoryApi.items.list({ size: 500 }).then((r: { data?: unknown[] }) => r.data ?? [])
  );

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const items: any[] = useMemo(() => data ?? [], [data]);

  const categories: { name: string; count: number }[] = useMemo(() => {
    const map: Record<string, number> = {};
    items.forEach((item: any) => {
      const cat = item.category?.trim() || 'Uncategorised';
      map[cat] = (map[cat] ?? 0) + 1;
    });
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [items]);

  function startEdit(cat: string) {
    setEditTarget(cat);
    setEditValue(cat);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-5"
    >
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
        Categories are derived from item data. Rename and delete actions will be available once a dedicated category API is added.
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Items</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100 animate-pulse">
                    <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-32" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-8 ml-auto" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-24 ml-auto" /></td>
                  </tr>
                ))
              : null}
            <AnimatePresence>
              {!isLoading &&
                categories.map((cat, i) => (
                  <motion.tr
                    key={cat.name}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2, delay: i * 0.04 }}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {editTarget === cat.name ? (
                        <Input
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          className="w-48 h-7 text-sm"
                          autoFocus
                          onKeyDown={e => e.key === 'Escape' && setEditTarget(null)}
                        />
                      ) : (
                        cat.name
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 font-medium">
                        {cat.count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        {editTarget === cat.name ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => setEditTarget(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              title="Coming soon — requires category API"
                              disabled
                            >
                              Save (coming soon)
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => startEdit(cat.name)}
                              title="Rename (coming soon)"
                            >
                              Rename
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50"
                              onClick={() => setDeleteTarget(cat.name)}
                              title="Delete (coming soon)"
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
            </AnimatePresence>
          </tbody>
        </table>
        {!isLoading && categories.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg font-medium">No categories found</p>
            <p className="text-sm mt-1">Add items with categories to see them here</p>
          </div>
        )}
      </div>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Deleting <strong>{deleteTarget}</strong> is not yet supported — a dedicated category API is coming soon.
            Items in this category will not be affected.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
