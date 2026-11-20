import { useCallback, useEffect, useRef, useState } from 'react';
import type { SceneNotice } from '@mepapp/render';

/** How long a toast stays before it dismisses itself. Nothing here ever asks the user to click. */
const TOAST_LIFETIME_MS = 4500;
const MAX_VISIBLE_TOASTS = 4;

/** A message for the toast stack. A persistent toast stays until the user closes it; a new persistent toast with the same key replaces the old one. */
export interface ToastInput {
  message: string;
  kind: SceneNotice['kind'] | 'error';
  persistent?: boolean;
  key?: string;
}

export interface Toast extends ToastInput {
  id: number;
}

/** Adds a toast. A toast with the same key is replaced. Only transient toasts count against the limit: a persistent toast is never dropped. */
export function addToast(current: Toast[], notice: ToastInput, id: number): Toast[] {
  const kept = notice.key === undefined ? current : current.filter((t) => t.key !== notice.key);
  const all = [...kept, { ...notice, id }];
  let excess = all.filter((t) => !t.persistent).length - MAX_VISIBLE_TOASTS;
  return all.filter((t) => t.persistent || excess-- <= 0);
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
    (notice: ToastInput) => {
      const id = nextId.current++;
      setToasts((current) => addToast(current, notice, id));
      if (!notice.persistent) timers.current.set(id, window.setTimeout(() => dismissToast(id), TOAST_LIFETIME_MS));
    },
    [dismissToast],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const dismissToastKey = useCallback((key: string) => {
    setToasts((current) => current.filter((t) => t.key !== key));
  }, []);

  return { toasts, pushToast, dismissToast, dismissToastKey };
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
        <div key={toast.id} className={`mep-toast mep-toast-${toast.kind}`} data-persistent={toast.persistent ? 'true' : undefined} onClick={() => onDismiss(toast.id)}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
