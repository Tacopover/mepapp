import { useCallback, useEffect, useRef, useState } from 'react';
import type { SceneNotice } from '@mepapp/render';

/** How long a toast stays before it dismisses itself. Nothing here ever asks the user to click. */
const TOAST_LIFETIME_MS = 4500;
const MAX_VISIBLE_TOASTS = 4;

export interface Toast extends SceneNotice {
  id: number;
}

/** Transient, self-dismissing messages — fed by SketchScene's 'notice' event (see App.tsx). Newest last; the oldest drops off when more than MAX_VISIBLE_TOASTS are showing. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (notice: SceneNotice) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { ...notice, id }].slice(-MAX_VISIBLE_TOASTS));
      timers.current.set(id, window.setTimeout(() => dismissToast(id), TOAST_LIFETIME_MS));
    },
    [dismissToast],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return { toasts, pushToast, dismissToast };
}

export interface ToastStackProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

/** Announced politely to screen readers, never takes focus, and the container ignores the pointer so it can't block canvas clicks; a click on a toast itself dismisses it early. */
export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  return (
    <div className="mep-toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`mep-toast mep-toast-${toast.kind}`} onClick={() => onDismiss(toast.id)}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
