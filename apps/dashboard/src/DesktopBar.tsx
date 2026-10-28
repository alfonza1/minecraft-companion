import { Monitor, RefreshCw, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';

declare global {
  interface Window {
    __COMPANION_DESKTOP__?: { updatesPending: boolean };
    chrome?: { webview?: { postMessage: (message: string) => void; addEventListener: (name: string, listener: (event: { data: any }) => void) => void; removeEventListener: (name: string, listener: (event: { data: any }) => void) => void } };
  }
}

export default function DesktopBar() {
  const desktop = window.__COMPANION_DESKTOP__;
  const [status, setStatus] = useState(desktop?.updatesPending ? 'pending' : 'current');
  const [error, setError] = useState('');
  useEffect(() => {
    const bridge = window.chrome?.webview;
    if (!desktop || !bridge) return;
    const receive = ({ data }: { data: any }) => {
      if (data?.type !== 'desktop-update' || !['current', 'pending', 'error'].includes(data.status)) return;
      setStatus(data.status); setError(data.status === 'error' ? String(data.message || 'Could not apply local changes.') : '');
    };
    bridge.addEventListener('message', receive);
    return () => bridge.removeEventListener('message', receive);
  }, [desktop]);
  if (!desktop) return null;
  return <div className={`desktop-bar ${status === 'pending' ? 'updates-pending' : ''}`}>
    <span className="desktop-identity"><Monitor size={14} /> Desktop workspace</span>
    <span className="desktop-update-note" role="status">{error || (status === 'pending' ? 'Local changes ready. Stop the companion, then apply updates.' : status === 'checking' ? 'Checking your local changes…' : 'Linked to your local working copy')}</span>
    <div className="desktop-actions">
      <button type="button" disabled={status === 'checking'} onClick={() => { setStatus('checking'); setError(''); window.chrome?.webview?.postMessage('check-updates'); }}><RefreshCw size={13} className={status === 'checking' ? 'spin' : ''} /> Apply local updates</button>
      <button type="button" title="Reload desktop view" aria-label="Reload desktop view" onClick={() => window.chrome?.webview?.postMessage('reload')}><RotateCw size={14} /></button>
    </div>
  </div>;
}
