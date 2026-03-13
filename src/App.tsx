// src/App.tsx
import { useState, useEffect } from 'react';
import { supabase } from './api/supabaseClient';
import MultiAgentReview from './components/MultiAgentReview';

function LoginGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_, session) => setSession(session)
    );
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div style={styles.center}>Loading…</div>;

  if (!session) {
    return (
      <div style={styles.center}>
        <div style={styles.loginBox}>
          <h2 style={styles.loginTitle}>Agent Review Board</h2>
          {sent ? (
            <p style={styles.hint}>Check your email for the magic link.</p>
          ) : (
            <>
              <input
                style={styles.input}
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
              <button
                style={styles.button}
                onClick={async () => {
                  await supabase.auth.signInWithOtp({ email });
                  setSent(true);
                }}
              >
                Send Magic Link
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

const styles = {
  center: { display:'flex', alignItems:'center', justifyContent:'center',
    minHeight:'100vh', background:'#080d18' },
  loginBox: { display:'flex', flexDirection:'column' as const, gap:'12px',
    padding:'32px', background:'#0f172a', border:'1px solid #1e293b',
    borderRadius:'8px', width:'320px' },
  loginTitle: { margin:0, color:'#f1f5f9', fontFamily:'monospace',
    fontSize:'16px', fontWeight:600 },
  hint: { color:'#64748b', fontSize:'13px', margin:0 },
  input: { padding:'10px 12px', background:'#0a0e1a', border:'1px solid #1e293b',
    borderRadius:'5px', color:'#e2e8f0', fontSize:'13px', fontFamily:'inherit' },
  button: { padding:'10px', background:'#0f2744', border:'1px solid #2563eb50',
    borderRadius:'5px', color:'#60a5fa', fontSize:'13px', fontWeight:600,
    cursor:'pointer', fontFamily:'inherit' },
};

export default function App() {
  return (
    <LoginGate>
      <MultiAgentReview />
    </LoginGate>
  );
}