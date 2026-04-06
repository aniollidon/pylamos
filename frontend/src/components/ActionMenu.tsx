import { useEffect, useRef, useState } from 'react';

interface ActionItem {
  label: string;
  danger?: boolean;
  onClick: () => void | Promise<void>;
}

interface ActionMenuProps {
  items: ActionItem[];
}

export default function ActionMenu({ items }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <div className="action-menu" ref={containerRef}>
      <button className="action-menu-trigger" onClick={() => setOpen((prev) => !prev)} title="Més accions">
        ⋯
      </button>
      {open && (
        <div className="action-menu-popover">
          {items.map((item) => (
            <button
              key={item.label}
              className={`action-menu-item ${item.danger ? 'danger' : ''}`}
              onClick={() => {
                setOpen(false);
                void item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
