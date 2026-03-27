import { useState, useEffect } from 'react';
import UnifiedWorkflow from './components/UnifiedWorkflow';
import { supabase } from './lib/supabase';

function LoginGate({ children }: { children: () => React.ReactNode }) {
  const [step, setStep] = useState<'email' | 'otp' | 'authed'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [authedEmail, setAuthedEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Session management — restore on mount + listen for changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        setAuthedEmail(session.user.email);
        setStep('authed');
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user?.email) {
        setAuthedEmail(session.user.email);
        setStep('authed');
      }
      if (event === 'SIGNED_OUT') {
        setAuthedEmail(null);
        setStep('email');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleEmailSubmit() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { shouldCreateUser: true },
      });

      if (otpError) {
        setError('Failed to send code. Please try again.');
        return;
      }

      setStep('otp');
    } catch {
      setError('Failed to send code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    const trimmed = email.trim().toLowerCase();
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: trimmed,
        token: code.trim(),
        type: 'email',
      });

      if (verifyError) {
        setError('Invalid or expired code. Please try again.');
      }
      // On success, onAuthStateChange fires SIGNED_IN and handles state
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (loading && step !== 'otp') return <div style={styles.center}>Loading…</div>;

  if (step === 'email') {
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
            onKeyDown={e => e.key === 'Enter' && handleEmailSubmit()}
          />
          <button
            style={{
              ...styles.button,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'default' : 'pointer',
            }}
            disabled={loading}
            onClick={handleEmailSubmit}
          >
            {loading ? 'Verifying…' : 'Enter'}
          </button>
          {error && <p style={styles.error}>{error}</p>}
        </div>
      </div>
    );
  }

  if (step === 'otp') {
    return (
      <div style={styles.center}>
        <div style={styles.loginBox}>
          <h2 style={styles.loginTitle}>Enter verification code</h2>
          <p style={styles.otpHint}>Check your email for a 6-digit code</p>
          <input
            style={styles.input}
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
          />
          <button
            style={{
              ...styles.button,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'default' : 'pointer',
            }}
            disabled={loading}
            onClick={handleVerifyOtp}
          >
            {loading ? 'Verifying…' : 'Verify'}
          </button>
          <button
            style={styles.backLink}
            onClick={() => { setStep('email'); setCode(''); setError(''); }}
          >
            ← Back
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
          onClick={() => supabase.auth.signOut()}
        >
          Sign out
        </button>
      </div>
      {children()}
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
  otpHint: { margin:0, color:'#64748b', fontSize:'12px' },
  input: { padding:'10px 12px', background:'#0a0e1a', border:'1px solid #1e293b',
    borderRadius:'5px', color:'#e2e8f0', fontSize:'13px', fontFamily:'inherit' },
  button: { padding:'10px', background:'#0f2744', border:'1px solid #2563eb50',
    borderRadius:'5px', color:'#60a5fa', fontSize:'13px', fontWeight:600,
    cursor:'pointer', fontFamily:'inherit' },
  backLink: { padding:'4px', background:'transparent', border:'none',
    color:'#475569', fontSize:'12px', cursor:'pointer', fontFamily:'inherit',
    textAlign:'left' as const },
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
      {() => <UnifiedWorkflow />}
    </LoginGate>
  );
}
