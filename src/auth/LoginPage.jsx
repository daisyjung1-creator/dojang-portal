import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (signInError) setError('로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.');
  }

  return (
    <div style={styles.wrap}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <div style={styles.brand}>
          <div style={styles.brandMark} />
          <span style={styles.brandText}>도장 포털</span>
        </div>
        <label style={styles.label}>
          이메일
          <input
            type="email"
            className="dp-input"
            style={{ width: '100%', marginTop: 4 }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label style={styles.label}>
          비밀번호
          <input
            type="password"
            className="dp-input"
            style={{ width: '100%', marginTop: 4 }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p style={{ color: '#9A2B2B', fontSize: 13, margin: '4px 0 0' }}>{error}</p>}
        <button type="submit" className="dp-btn dp-btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} disabled={submitting}>
          {submitting ? '로그인 중...' : '로그인'}
        </button>
        <p style={{ fontSize: 12.5, color: '#5B5F56', marginTop: 14 }}>
          계정은 Supabase 대시보드(Authentication → Users)에서 원장님이 직접 만들어 직원에게 전달하세요.
        </p>
      </form>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#F6F4EF',
    fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif",
  },
  card: {
    background: '#FFFFFF',
    border: '1px solid #DEDACC',
    borderRadius: 12,
    padding: '28px 28px 24px',
    width: '100%',
    maxWidth: 340,
  },
  brand: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 },
  brandMark: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #9A2B2B 50%, #F6F4EF 50%)',
    flexShrink: 0,
  },
  brandText: { color: '#20241F', fontSize: 16, fontWeight: 500 },
  label: { display: 'block', fontSize: 12.5, color: '#5B5F56', marginBottom: 12 },
};
