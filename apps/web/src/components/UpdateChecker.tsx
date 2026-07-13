// ============================================================
// POS Yoga — Update Checker Component (Tauri Only)
// ============================================================

import { useEffect, useState } from 'react';

const IS_TAURI = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

interface UpdateInfo {
  version: string;
  currentVersion: string;
  body?: string;
}

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'error';

export default function UpdateChecker() {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!IS_TAURI) return;

    // Auto-check for updates after 3 seconds
    const timer = setTimeout(() => checkForUpdates(), 3000);
    return () => clearTimeout(timer);
  }, []);

  async function checkForUpdates() {
    if (!IS_TAURI) return;

    try {
      setStatus('checking');
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();

      if (update) {
        setUpdateInfo({
          version: update.version,
          currentVersion: update.currentVersion,
          body: update.body || undefined,
        });
        setStatus('available');
      } else {
        setStatus('idle');
      }
    } catch (err: any) {
      console.warn('Update check failed:', err);
      setStatus('idle'); // silently fail, don't bother user
    }
  }

  async function installUpdate() {
    if (!IS_TAURI) return;

    try {
      setStatus('downloading');
      const { check } = await import('@tauri-apps/plugin-updater');
      const { relaunch } = await import('@tauri-apps/plugin-process');

      const update = await check();
      if (!update) return;

      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength || 0;
            setStatus('downloading');
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setProgress(Math.round((downloaded / contentLength) * 100));
            }
            break;
          case 'Finished':
            setStatus('installing');
            break;
        }
      });

      // Relaunch the app after installing
      await relaunch();
    } catch (err: any) {
      console.error('Update install failed:', err);
      setErrorMsg(err.message || 'Gagal menginstal update');
      setStatus('error');
    }
  }

  // Don't render anything if not in Tauri or no update
  if (!IS_TAURI || status === 'idle' || status === 'checking') return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '1.5rem',
      right: '1.5rem',
      zIndex: 9999,
      minWidth: '320px',
      maxWidth: '400px',
      background: 'var(--color-surface, #1e1e2e)',
      border: '1px solid var(--color-border, #313244)',
      borderRadius: '12px',
      padding: '1rem 1.25rem',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      animation: 'slideUp 0.3s ease-out',
    }}>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {status === 'available' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.25rem' }}>🚀</span>
            <strong style={{ color: 'var(--color-text, #cdd6f4)', fontSize: '0.95rem' }}>
              Update Tersedia!
            </strong>
          </div>
          <p style={{ color: 'var(--color-text-muted, #a6adc8)', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
            Versi baru <strong>{updateInfo?.version}</strong> siap diinstal.
          </p>
          {updateInfo?.body && (
            <p style={{ color: 'var(--color-text-muted, #a6adc8)', fontSize: '0.8rem', margin: '0 0 0.75rem', opacity: 0.8 }}>
              {updateInfo.body}
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={installUpdate}
              style={{
                flex: 1,
                padding: '0.5rem 1rem',
                background: 'var(--color-primary, #89b4fa)',
                color: '#1e1e2e',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              Update Sekarang
            </button>
            <button
              onClick={() => setStatus('idle')}
              style={{
                padding: '0.5rem 1rem',
                background: 'transparent',
                color: 'var(--color-text-muted, #a6adc8)',
                border: '1px solid var(--color-border, #313244)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              Nanti
            </button>
          </div>
        </>
      )}

      {(status === 'downloading' || status === 'installing') && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.25rem' }}>⬇️</span>
            <strong style={{ color: 'var(--color-text, #cdd6f4)', fontSize: '0.95rem' }}>
              {status === 'downloading' ? 'Mengunduh Update...' : 'Menginstal...'}
            </strong>
          </div>
          <div style={{
            width: '100%',
            height: '6px',
            background: 'var(--color-border, #313244)',
            borderRadius: '3px',
            overflow: 'hidden',
            marginTop: '0.5rem',
          }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: 'var(--color-primary, #89b4fa)',
              borderRadius: '3px',
              transition: 'width 0.3s ease',
            }} />
          </div>
          <p style={{ color: 'var(--color-text-muted, #a6adc8)', fontSize: '0.8rem', marginTop: '0.35rem', textAlign: 'right' }}>
            {progress}%
          </p>
        </>
      )}

      {status === 'error' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.25rem' }}>❌</span>
            <strong style={{ color: '#f38ba8', fontSize: '0.95rem' }}>Gagal Update</strong>
          </div>
          <p style={{ color: 'var(--color-text-muted, #a6adc8)', fontSize: '0.8rem', margin: '0 0 0.5rem' }}>
            {errorMsg}
          </p>
          <button
            onClick={() => { setStatus('idle'); setErrorMsg(''); }}
            style={{
              padding: '0.4rem 0.75rem',
              background: 'transparent',
              color: 'var(--color-text-muted, #a6adc8)',
              border: '1px solid var(--color-border, #313244)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            Tutup
          </button>
        </>
      )}
    </div>
  );
}
