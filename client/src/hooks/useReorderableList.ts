import { type DragEvent, useMemo, useRef, useState } from 'react';

export const moveItem = <T>(items: T[], fromIndex: number, toIndex: number): T[] => {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};

/**
 * Drag-and-drop and move up/down for a list shown with ReorderableField. While dragging, the
 * list previews the new order locally; dropping (or a move button) saves it, and the preview
 * stays until the save settles so rows don't jump back in between.
 *
 * Lists can be nested (questions inside a category): each list only responds to drags that
 * started in it and stops those events there, so the outer list ignores them.
 */
const useReorderableList = <T extends { id: string }>(
  items: T[],
  onSave: (ids: string[]) => Promise<unknown>,
) => {
  const [previewIds, setPreviewIds] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const previewRef = useRef<string[] | null>(null);
  const draggingRef = useRef<string | null>(null);

  const ordered = useMemo(() => {
    if (!previewIds) return items;
    const byId = new Map(items.map((item) => [item.id, item]));
    const previewed = previewIds.map((id) => byId.get(id)).filter((item): item is T => !!item);
    // Items added or removed since the preview started fall back to the saved order.
    return previewed.length === items.length ? previewed : items;
  }, [items, previewIds]);

  const setPreview = (ids: string[] | null) => {
    previewRef.current = ids;
    setPreviewIds(ids);
  };

  const persist = async (ids: string[]) => {
    setPreview(ids);
    setSaving(true);
    try {
      await onSave(ids);
    } finally {
      setSaving(false);
      setPreview(null);
    }
  };

  const move = (id: string, delta: number) => {
    const fromIndex = ordered.findIndex((item) => item.id === id);
    const next = moveItem(ordered, fromIndex, fromIndex + delta);
    if (next !== ordered) void persist(next.map((item) => item.id));
  };

  const endDrag = () => {
    draggingRef.current = null;
    setDraggingId(null);
  };

  const fieldProps = (item: T, index: number, label: string) => ({
    dragging: draggingId === item.id,
    draggable: !saving,
    disabled: saving,
    moveUpDisabled: index === 0,
    moveDownDisabled: index === ordered.length - 1,
    moveUpLabel: `Move ${label} up`,
    moveDownLabel: `Move ${label} down`,
    onMoveUp: () => move(item.id, -1),
    onMoveDown: () => move(item.id, 1),
    onDragStart: (event: DragEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (saving) {
        event.preventDefault();
        return;
      }
      draggingRef.current = item.id;
      setDraggingId(item.id);
      event.dataTransfer.effectAllowed = 'move';
      // Firefox only starts a drag that carries data.
      event.dataTransfer.setData('text/plain', item.id);
    },
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      const draggedId = draggingRef.current;
      if (!draggedId) return;
      event.preventDefault();
      event.stopPropagation();
      if (draggedId === item.id) return;

      const current = previewRef.current ?? ordered.map((entry) => entry.id);
      const fromIndex = current.indexOf(draggedId);
      const targetIndex = current.indexOf(item.id);
      if (fromIndex < 0 || targetIndex < 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      const toIndex = after
        ? targetIndex + (fromIndex < targetIndex ? 0 : 1)
        : targetIndex - (fromIndex < targetIndex ? 1 : 0);
      const next = moveItem(current, fromIndex, toIndex);
      if (next !== current) setPreview(next);
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      endDrag();
      const ids = previewRef.current;
      const savedIds = items.map((entry) => entry.id);
      if (ids && ids.join() !== savedIds.join()) void persist(ids);
      else setPreview(null);
    },
    // A drag that ends without a drop on one of the rows puts the order back.
    onDragEnd: (event: DragEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      event.stopPropagation();
      setPreview(null);
      endDrag();
    },
  });

  return { ordered, saving, fieldProps };
};

export default useReorderableList;
