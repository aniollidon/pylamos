import { useEffect, useRef, useState, type ReactNode } from 'react';

interface ActionItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onClick: () => void | Promise<void>;
}

interface ActionMenuProps {
  items: ActionItem[];
  disabled?: boolean;
  title?: string;
}

export default function ActionMenu({ items, disabled = false, title = 'Més accions' }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
    }
  }, [disabled, open]);

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
      <button
        className="action-menu-trigger"
        onClick={() => setOpen((prev) => !prev)}
        title={title}
        disabled={disabled}
      >
        ⋮
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
              {item.icon ? <span className="action-menu-item-icon">{item.icon}</span> : null}
              <span className="action-menu-item-label">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
