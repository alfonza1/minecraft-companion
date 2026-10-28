import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from './api';
import type { Common } from './shared';

export default function PrivateAccountActions({ state, mutate, busy }: Common) {
  const [browser, setBrowser] = useState<{ available: boolean; name: string | null } | null>(null);
  const [opening, setOpening] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    void api('/auth/private-browser').then(value => { if (mounted) setBrowser(value); }).catch(() => { if (mounted) setBrowser({ available: false, name: null }); });
    return () => { mounted = false; };
  }, []);
  const locked = busy || opening || Boolean(state.world) || state.connection.status === 'connecting';
  async function open(profile = false) {
    setOpening(true); setError(''); setMessage('');
    try {
      const existing = Boolean(state.auth.device);
      const result = await mutate(profile || existing ? '/auth/private-window' : '/auth/connect-private', profile || existing ? { target: profile ? 'profile' : 'signin' } : {});
      setMessage(`Opened ${result.browser}. ${profile ? 'Finish Java account setup there.' : 'Use the device code shown here to sign in with the bot account.'}`);
    } catch (failure) { setError((failure as Error).message); }
    finally { setOpening(false); }
  }
  return <div className="private-account-panel">
    <div className="private-account-buttons">
      <button className="button" disabled={locked || !browser?.available} onClick={() => void open()}><ExternalLink size={14} />{opening ? 'Opening private sign-in…' : state.auth.device ? 'Open in private window' : 'Connect in private window'}</button>
      {state.auth.issue === 'JAVA_PROFILE_REQUIRED' ? <button className="button" disabled={locked || !browser?.available} onClick={() => void open(true)}>Open account setup privately</button> : null}
    </div>
    <p className="note">{browser?.available ? `Uses ${browser.name}. Connecting privately starts a fresh account sign-in and keeps the previous encrypted cache saved. Enter passwords only on Microsoft's website.` : browser ? 'Private launching is unavailable. Right-click the Microsoft sign-in link and choose a private window, or copy its address into one.' : 'Checking private browser availability…'}</p>
    {message ? <p className="note" role="status">{message}</p> : null}
    {error ? <p className="inline-error" role="alert">{error}</p> : null}
  </div>;
}
