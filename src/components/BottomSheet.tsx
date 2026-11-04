import { useRef, useState, type ReactNode } from 'react';

/**
 * 모바일 하단 패널. 지도를 가리지 않도록 반쯤만 열리고,
 * 손잡이를 위로 끌면 크게, 아래로 끌면 닫힌다. 손잡이를 누르면 크기를 바꾼다.
 */
export function BottomSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);

  const end = () => {
    if (startY.current == null) return;
    startY.current = null;
    const dy = drag;
    setDrag(0);
    if (dy > 90) onClose();
    else if (dy < -40) setExpanded(true);
    else if (dy > 30) setExpanded(false);
    else if (Math.abs(dy) < 6) setExpanded((x) => !x);
  };

  return (
    <div
      className={`sheet${expanded ? ' expanded' : ''}${startY.current != null ? ' dragging' : ''}`}
      style={drag ? { transform: `translateY(${Math.max(drag, -80)}px)` } : undefined}
      role="dialog"
      aria-label="선택한 지역"
    >
      <div
        className="sheet-handle"
        role="button"
        tabIndex={0}
        aria-label={expanded ? '패널 줄이기' : '패널 키우기'}
        onPointerDown={(e) => {
          startY.current = e.clientY;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => startY.current != null && setDrag(e.clientY - startY.current)}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((x) => !x);
          }
        }}
      >
        <div className="sheet-grip" />
      </div>
      <button className="sheet-close" onClick={onClose} aria-label="닫기">✕</button>
      <div className="sheet-body">{children}</div>
    </div>
  );
}
