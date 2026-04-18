'use client';

import { useState, useCallback, useMemo } from 'react';

/**
 * Reusable row-selection state cho bulk action (xóa hàng loạt, bulk-assign...).
 * Dùng Set<string> để ID lookup O(1). Pair với <BulkDeleteBar />.
 */
export function useBulkSelection<T extends { id: string }>(allItems: T[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allIds = useMemo(() => allItems.map((it) => it.id), [allItems]);
  const allSelected = allIds.length > 0 && selected.size === allIds.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = useCallback(() => {
    setSelected((prev) => (prev.size === allIds.length ? new Set() : new Set(allIds)));
  }, [allIds]);

  const clear = useCallback(() => setSelected(new Set()), []);

  return {
    selected,
    selectedIds: Array.from(selected),
    count: selected.size,
    isSelected,
    toggleOne,
    toggleAll,
    allSelected,
    someSelected,
    clear,
  };
}
