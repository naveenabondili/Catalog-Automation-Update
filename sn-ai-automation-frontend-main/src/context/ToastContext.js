import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext({ addToast: () => {} });
export const useToast = () => useContext(ToastContext);

const COLORS = {
  success: { bg: '#e8f5e9', border: '#66bb6a', text: '#1b5e20', icon: '✅' },
  error:   { bg: '#ffebee', border: '#ef9a9a', text: '#b71c1c', icon: '❌' },
  info:    { bg: '#e3f2fd', border: '#90caf9', text: '#0d47a1', icon: 'ℹ️' },
  warning: { bg: '#fff8e1', border: '#ffcc02', text: '#e65100', icon: '⚠️' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = `${Date.now()}_${Math.random()}`;
    setToasts(t => [...t, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration);
    }
    return id;
  }, []);

  const dismiss = (id) => setToasts(t => t.filter(x => x.id !== id));

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}

      {/* Toast container — fixed bottom-right */}
      <div style={{
        position: 'fixed', bottom: '24px', right: '24px',
        zIndex: 9999, display: 'flex', flexDirection: 'column',
        gap: '8px', maxWidth: '380px', width: '100%',
        pointerEvents: 'none',
      }}>
        {toasts.map(t => {
          const c = COLORS[t.type] || COLORS.info;
          return (
            <div key={t.id} className="toast-slide-in" style={{
              background: c.bg, border: `1px solid ${c.border}`,
              borderLeft: `4px solid ${c.border}`, borderRadius: '8px',
              padding: '12px 14px', display: 'flex', alignItems: 'flex-start',
              gap: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              pointerEvents: 'all',
            }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>{c.icon}</span>
              <span style={{ flex: 1, fontSize: '13px', color: c.text, lineHeight: 1.45 }}>{t.message}</span>
              <button onClick={() => dismiss(t.id)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#aaa', fontSize: '18px', lineHeight: 1, padding: '0 2px',
                flexShrink: 0,
              }}>×</button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
