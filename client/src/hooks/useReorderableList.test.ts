import { act, renderHook } from '@testing-library/react';
import useReorderableList, { moveItem } from './useReorderableList';

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const ids = (list: { id: string }[]) => list.map((item) => item.id);

/** A drag event over a 100px-tall row at the top of the page. */
const dragEvent = (clientY = 75) =>
  ({
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
    clientY,
    currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 100 }) },
    dataTransfer: { setData: jest.fn(), effectAllowed: '' },
  }) as any;

describe('moveItem', () => {
  it('moves an item and ignores moves past either end', () => {
    expect(ids(moveItem(items, 0, 2))).toEqual(['b', 'c', 'a']);
    expect(moveItem(items, 0, -1)).toBe(items);
    expect(moveItem(items, 2, 3)).toBe(items);
  });
});

describe('useReorderableList', () => {
  it('saves the new order when an item moves down, keeping it shown until the save settles', async () => {
    let finishSave = () => {};
    const onSave = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    const { result } = renderHook(() => useReorderableList(items, onSave));

    act(() => result.current.fieldProps(items[0], 0, 'A').onMoveDown());

    expect(onSave).toHaveBeenCalledWith(['b', 'a', 'c']);
    expect(ids(result.current.ordered)).toEqual(['b', 'a', 'c']);
    expect(result.current.saving).toBe(true);

    await act(async () => finishSave());
    expect(result.current.saving).toBe(false);
    // The saved order now comes from the server's data, which this test leaves unchanged.
    expect(ids(result.current.ordered)).toEqual(['a', 'b', 'c']);
  });

  it('previews a drag and saves it on drop', () => {
    const onSave = jest.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useReorderableList(items, onSave));

    act(() => result.current.fieldProps(items[0], 0, 'A').onDragStart(dragEvent()));
    expect(result.current.fieldProps(items[0], 0, 'A').dragging).toBe(true);

    // Over the lower half of "c", so "a" goes after it.
    act(() => result.current.fieldProps(items[2], 2, 'C').onDragOver(dragEvent(75)));
    expect(ids(result.current.ordered)).toEqual(['b', 'c', 'a']);
    expect(onSave).not.toHaveBeenCalled();

    act(() => result.current.fieldProps(items[2], 2, 'C').onDrop(dragEvent()));
    expect(onSave).toHaveBeenCalledWith(['b', 'c', 'a']);
  });

  it('puts the order back when a drag is cancelled', () => {
    const onSave = jest.fn();
    const { result } = renderHook(() => useReorderableList(items, onSave));

    act(() => result.current.fieldProps(items[0], 0, 'A').onDragStart(dragEvent()));
    act(() => result.current.fieldProps(items[1], 1, 'B').onDragOver(dragEvent(75)));
    expect(ids(result.current.ordered)).toEqual(['b', 'a', 'c']);

    act(() => result.current.fieldProps(items[0], 0, 'A').onDragEnd(dragEvent()));
    expect(ids(result.current.ordered)).toEqual(['a', 'b', 'c']);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('leaves drags that started in another list to that list', () => {
    const { result } = renderHook(() => useReorderableList(items, jest.fn()));
    const event = dragEvent();

    act(() => result.current.fieldProps(items[1], 1, 'B').onDragOver(event));
    act(() => result.current.fieldProps(items[1], 1, 'B').onDrop(event));

    // Not handled here, so the event bubbles on to the list the drag belongs to.
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(ids(result.current.ordered)).toEqual(['a', 'b', 'c']);
  });

  it('stops its own drag from reaching an outer list', () => {
    const { result } = renderHook(() => useReorderableList(items, jest.fn()));
    const start = dragEvent();
    const over = dragEvent();

    act(() => result.current.fieldProps(items[0], 0, 'A').onDragStart(start));
    act(() => result.current.fieldProps(items[1], 1, 'B').onDragOver(over));

    expect(start.stopPropagation).toHaveBeenCalled();
    expect(over.stopPropagation).toHaveBeenCalled();
  });
});
