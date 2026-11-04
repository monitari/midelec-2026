import type { Category, FilterKey } from '../lib/classify';
import { FILTERS } from '../lib/classify';
import { Swatch } from './ui';

export function Legend({
  items, focus, onFocus,
}: {
  items: (Category & { count: number })[];
  focus: string | null;
  onFocus: (key: string | null) => void;
}) {
  return (
    <div className="legend" role="list">
      {items.map((c) => (
        <button
          key={c.key}
          role="listitem"
          className={`legend-item${focus === c.key ? ' on' : ''}${focus && focus !== c.key ? ' off' : ''}`}
          onClick={() => onFocus(focus === c.key ? null : c.key)}
          title="눌러서 이 항목만 강조"
        >
          <Swatch fill={c.fill} />
          <span>{c.label}</span>
          <b>{c.count}</b>
        </button>
      ))}
    </div>
  );
}

export function Filters({
  value, onChange, isHouse,
}: {
  value: Set<FilterKey>;
  onChange: (v: Set<FilterKey>) => void;
  isHouse: boolean;
}) {
  return (
    <div className="filters">
      {FILTERS.filter((f) => isHouse || !f.houseOnly).map((f) => (
        <button
          key={f.id}
          className={`chip ${value.has(f.id) ? 'on' : ''}`}
          aria-pressed={value.has(f.id)}
          onClick={() => {
            const n = new Set(value);
            if (n.has(f.id)) n.delete(f.id); else n.add(f.id);
            onChange(n);
          }}
        >
          {f.label}
        </button>
      ))}
      {value.size > 0 && (
        <button className="link" onClick={() => onChange(new Set())}>초기화</button>
      )}
    </div>
  );
}
