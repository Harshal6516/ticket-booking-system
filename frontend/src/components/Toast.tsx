import { useState, useEffect } from 'react';

interface ToastMessage {
  id: string;
  type: 'success' | 'error';
  message: string;
}

let toastListeners: ((toast: ToastMessage) => void)[] = [];

export function showToast(type: 'success' | 'error', message: string) {
  const toast: ToastMessage = { id: Date.now().toString(), type, message };
  toastListeners.forEach((listener) => listener(toast));
}

export default function Toast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const listener = (toast: ToastMessage) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 4000);
    };

    toastListeners.push(listener);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== listener);
    };
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}
        >
          <span className="mr-2">{toast.type === 'success' ? '✓' : '✗'}</span>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
