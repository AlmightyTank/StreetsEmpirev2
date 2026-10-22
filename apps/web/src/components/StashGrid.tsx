import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { StashDto, StashItemDto, StashItemKeyDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { Button } from './Button.js';
import { ItemTile } from './ItemTile.js';

function overlaps(a: StashItemDto, b: StashItemDto): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function StashGrid({ stash, busy, onSave }: {
  stash: StashDto;
  busy: boolean;
  onSave: (items: Array<Pick<StashItemDto, 'key' | 'x' | 'y'>>) => void;
}) {
  const [items, setItems] = useState(stash.items);
  const [selected, setSelected] = useState<StashItemKeyDto | null>(null);
  useEffect(() => { setItems(stash.items); setSelected(null); }, [stash]);

  const changed = useMemo(() => items.some((item) => {
    const original = stash.items.find((row) => row.key === item.key);
    return !original || original.x !== item.x || original.y !== item.y;
  }), [items, stash.items]);

  function place(key: StashItemKeyDto, x: number, y: number) {
    const moving = items.find((item) => item.key === key);
    if (!moving) return;
    const next = { ...moving, x, y };
    if (x + next.width > stash.columns || y + next.height > stash.rows) return;
    if (items.some((other) => other.key !== key && overlaps(next, other))) return;
    setItems((current) => current.map((item) => item.key === key ? next : item));
    setSelected(null);
  }

  function cellClick(x: number, y: number) {
    if (selected) place(selected, x, y);
  }

  function autoSort() {
    const placed: StashItemDto[] = [];
    const ordered = [...items].sort((a, b) => (b.width * b.height) - (a.width * a.height) || b.height - a.height || b.width - a.width || a.key.localeCompare(b.key));
    for (const item of ordered) {
      let next: StashItemDto | null = null;
      for (let y = 0; y + item.height <= stash.rows && !next; y += 1) {
        for (let x = 0; x + item.width <= stash.columns; x += 1) {
          const candidate = { ...item, x, y };
          if (!placed.some((other) => overlaps(candidate, other))) { next = candidate; break; }
        }
      }
      if (!next) return;
      placed.push(next);
    }
    setItems(placed);
    setSelected(null);
  }

  const occupied = (x: number, y: number) => items.some((item) => x >= item.x && x < item.x + item.width && y >= item.y && y < item.y + item.height);

  return (
    <div className="se-stash">
      <div className="se-stash__toolbar">
        <div className="se-stash__summary">
          <strong>Your stash</strong>
          <span>{formatNumber(stash.usedCells)} / {formatNumber(stash.totalCells)} cells · {formatNumber(items.length)} stacks</span>
        </div>
        <div className="se-stash__actions">
          <Button type="button" className="se-btn se-btn--ghost se-btn--sm" disabledReason={busy || items.length < 2 ? 'There is nothing to sort.' : null} onClick={autoSort}>
            Auto-sort
          </Button>
          <Button type="button" className="se-btn se-btn--primary se-btn--sm" disabledReason={busy ? 'Saving your stash layout.' : !changed ? 'Your stash is already organized.' : null} onClick={() => onSave(items.map(({ key, x, y }) => ({ key, x, y })))}>
            Save layout
          </Button>
        </div>
      </div>
      <p className="se-stash__hint">Drag an item to move it, or tap an item then an empty spot. Product stock stays in product storage; equip and customize weapons in the Armory and Garage.</p>
      <div className="se-stash__board" style={{ '--stash-columns': stash.columns, '--stash-rows': stash.rows } as CSSProperties} aria-label={`Stash grid, ${stash.columns} columns by ${stash.rows} rows`}>
        {Array.from({ length: stash.rows }, (_, y) => Array.from({ length: stash.columns }, (_, x) => (
          <button
            key={`cell-${x}-${y}`}
            type="button"
            className={`se-stash__cell${occupied(x, y) ? ' is-covered' : ''}`}
            style={{ gridColumn: x + 1, gridRow: y + 1 }}
            aria-label={occupied(x, y) ? `Occupied stash cell ${x + 1}, ${y + 1}` : `Empty stash cell ${x + 1}, ${y + 1}`}
            disabled={occupied(x, y)}
            onClick={() => cellClick(x, y)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const key = event.dataTransfer.getData('text/plain') as StashItemKeyDto;
              if (key) place(key, x, y);
            }}
          />
        )))}
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`se-stash__item${selected === item.key ? ' is-selected' : ''}`}
            style={{ gridColumn: `${item.x + 1} / span ${item.width}`, gridRow: `${item.y + 1} / span ${item.height}` }}
            draggable
            aria-label={`${item.key.replaceAll('_', ' ')} stack, quantity ${item.quantity}. Select or drag to move.`}
            onClick={() => setSelected((current) => current === item.key ? null : item.key)}
            onDragStart={(event) => { event.dataTransfer.setData('text/plain', item.key); event.dataTransfer.effectAllowed = 'move'; setSelected(item.key); }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const key = event.dataTransfer.getData('text/plain') as StashItemKeyDto;
              if (key !== item.key) place(key, item.x, item.y);
            }}
          >
            <ItemTile item={item.key} quantity={item.quantity} label={false} zoomable={false} className="se-stash__tile" />
          </button>
        ))}
        {items.length === 0 ? <div className="se-stash__empty">Your stash is empty. Supplies you buy will show up here.</div> : null}
      </div>
      {selected ? <p className="se-stash__selected">Selected: {selected.replaceAll('_', ' ')}. Tap an empty cell to place it.</p> : null}
    </div>
  );
}
