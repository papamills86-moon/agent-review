import { useState, useEffect } from 'react';
import MultiAgentReview from './components/MultiAgentReview';

const STORAGE_KEY = 'agent-review-email';

function LoginGate({ children }: { children: (email: string) => React.ReactNode }) {
  const [email, setEmail] = useState('');
  const [authedEmail, setAuthedEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  // Revalidate stored email on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) { setLoading(false); return; }

    validateEmail(stored)
      .then((allowed) => {
        if (allowed) setAuthedEmail(stored);
        else localStorage.removeItem(STORAGE_KEY);
      })
      .catch(() => localStorage.removeItem(STORAGE_KEY))
      .finally(() => setLoading(false));
  }, []);

  async function validateEmail(addr: string): Promise<boolean> {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-email`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email: addr }),
      },
    );
    if (!res.ok) throw new Error('Validation request failed');
    const data = await res.json();
    return data.allowed === true;
  }

  async function handleSubmit() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setChecking(true);
    setError('');
    try {
      const allowed = await validateEmail(trimmed);
      if (allowed) {
        localStorage.setItem(STORAGE_KEY, trimmed);
        setAuthedEmail(trimmed);
      } else {
        setError('Access denied. Your email is not on the approved list.');
      }
    } catch {
      setError('Unable to verify email. Please try again.');
    } finally {
      setChecking(false);
    }
  }

  if (loading) return <div style={styles.center}>Loading…</div>;

  if (!authedEmail) {
    return (
      <div style={styles.center}>
        <div style={styles.loginBox}>
          <h2 style={styles.loginTitle}>Agent Review Board</h2>
          <input
            style={styles.input}
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />
          <button
            style={{
              ...styles.button,
              opacity: checking ? 0.6 : 1,
              cursor: checking ? 'default' : 'pointer',
            }}
            disabled={checking}
            onClick={handleSubmit}
          >
            {checking ? 'Verifying…' : 'Enter'}
          </button>
          {error && <p style={styles.error}>{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={styles.topBar}>
        <span style={styles.emailLabel}>{authedEmail}</span>
        <button
          style={styles.signOut}
          onClick={() => {
            localStorage.removeItem(STORAGE_KEY);
            setAuthedEmail(null);
          }}
        >
          Sign out
        </button>
      </div>
      {children(authedEmail)}
    </>
  );
}

const styles = {
  center: { display:'flex', alignItems:'center', justifyContent:'center',
    minHeight:'100vh', background:'#080d18', color:'#64748b', fontSize:'13px' },
  loginBox: { display:'flex', flexDirection:'column' as const, gap:'12px',
    padding:'32px', background:'#0f172a', border:'1px solid #1e293b',
    borderRadius:'8px', width:'320px' },
  loginTitle: { margin:0, color:'#f1f5f9', fontFamily:'monospace',
    fontSize:'16px', fontWeight:600 },
  input: { padding:'10px 12px', background:'#0a0e1a', border:'1px solid #1e293b',
    borderRadius:'5px', color:'#e2e8f0', fontSize:'13px', fontFamily:'inherit' },
  button: { padding:'10px', background:'#0f2744', border:'1px solid #2563eb50',
    borderRadius:'5px', color:'#60a5fa', fontSize:'13px', fontWeight:600,
    cursor:'pointer', fontFamily:'inherit' },
  error: { color:'#f87171', fontSize:'12px', margin:0 },
  topBar: { display:'flex', justifyContent:'flex-end', alignItems:'center',
    gap:'10px', padding:'8px 16px', background:'#0a0e1a',
    borderBottom:'1px solid #1e293b' },
  emailLabel: { fontSize:'11px', color:'#475569', fontFamily:'monospace' },
  signOut: { padding:'4px 10px', background:'transparent',
    border:'1px solid #1e293b', borderRadius:'3px', color:'#475569',
    fontSize:'10px', cursor:'pointer', fontFamily:'inherit' },
};

export default function App() {
  return (
    <LoginGate>
      {(email) => <MultiAgentReview email={email} />}
    </LoginGate>
  );
}
