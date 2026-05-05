import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Eye, EyeOff, LogIn } from 'lucide-react';

/* ── Floating particle ── */
const Particle = ({ style }) => (
  <div className="absolute rounded-full opacity-20 animate-pulse" style={style} />
);

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm]       = useState({ username: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.username.trim() || !form.password) {
      toast.error('Please enter username and password');
      return;
    }
    setLoading(true);
    try {
      await login(form.username.trim(), form.password);
      toast.success('Login successful!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const particles = [
    { width:180, height:180, background:'#60a5fa', top:'5%',  left:'8%',  animationDuration:'6s'  },
    { width:120, height:120, background:'#818cf8', top:'15%', right:'10%',animationDuration:'8s'  },
    { width:90,  height:90,  background:'#34d399', bottom:'20%',left:'5%', animationDuration:'5s' },
    { width:200, height:200, background:'#f472b6', bottom:'5%',right:'5%', animationDuration:'9s' },
    { width:60,  height:60,  background:'#fbbf24', top:'45%', left:'3%',  animationDuration:'7s'  },
    { width:70,  height:70,  background:'#a78bfa', top:'60%', right:'4%', animationDuration:'6s'  },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 40%, #1e40af 70%, #1d4ed8 100%)' }}
    >
      {/* Animated background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((p, i) => (
          <Particle key={i} style={{ ...p, borderRadius:'50%', filter:'blur(60px)', position:'absolute' }} />
        ))}
        {/* Grid overlay */}
        <div className="absolute inset-0" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '60px 60px'
        }} />
      </div>

      {/* Main content */}
      <div
        className="w-full max-w-md relative z-10 transition-all duration-700"
        style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(32px)' }}
      >

        {/* Logo + Title */}
        <div className="text-center mb-8">

          {/* Logo */}
          <div className="flex justify-center mb-5">
            <img
              src="/southsmart-logo.png"
              alt="Southsmart"
              style={{
                width: 120, height: 120,
                borderRadius: '20px',
                boxShadow: '0 0 40px rgba(59,130,246,0.6)',
                objectFit: 'cover',
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'scale(1)' : 'scale(0.4)',
                transition: 'all 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.1s',
              }}
            />
          </div>

          <div style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(12px)', transition: 'all 0.6s ease 0.3s' }}>
            <h1
              className="text-3xl font-extrabold tracking-tight"
              style={{
                background: 'linear-gradient(90deg, #93c5fd, #ffffff, #c4b5fd)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Southsmart Technologies
            </h1>
            <p className="text-blue-300 text-xs mt-1.5 font-medium tracking-widest uppercase">Application Management System</p>
          </div>

        </div>

        {/* Card */}
        <div
          className="rounded-3xl overflow-hidden shadow-2xl"
          style={{
            background: 'rgba(255,255,255,0.06)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.12)',
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(20px)',
            transition: 'all 0.7s ease 0.35s'
          }}
        >
          {/* Card top accent */}
          <div style={{ height: 3, background: 'linear-gradient(90deg, #3b82f6, #6366f1, #8b5cf6)' }} />

          <div className="px-8 py-9">
            <div className="mb-7">
              <h2 className="text-white text-xl font-bold">Welcome back</h2>
              <p className="text-blue-300 text-sm mt-1">Sign in to your account to continue</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Username */}
              <div style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateX(0)' : 'translateX(-16px)', transition: 'all 0.5s ease 0.45s' }}>
                <label className="block text-xs font-semibold text-blue-200 mb-1.5 tracking-wide uppercase">Username</label>
                <input
                  type="text"
                  placeholder="Enter your username"
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl text-white placeholder-blue-400 text-sm font-medium outline-none transition-all duration-200 focus:ring-2 focus:ring-blue-400"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.15)',
                  }}
                  onFocus={e => e.target.style.background = 'rgba(255,255,255,0.13)'}
                  onBlur={e => e.target.style.background = 'rgba(255,255,255,0.08)'}
                />
              </div>

              {/* Password */}
              <div style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateX(0)' : 'translateX(-16px)', transition: 'all 0.5s ease 0.55s' }}>
                <label className="block text-xs font-semibold text-blue-200 mb-1.5 tracking-wide uppercase">Password</label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    className="w-full px-4 py-3 pr-11 rounded-xl text-white placeholder-blue-400 text-sm font-medium outline-none transition-all duration-200 focus:ring-2 focus:ring-blue-400"
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.15)',
                    }}
                    onFocus={e => e.target.style.background = 'rgba(255,255,255,0.13)'}
                    onBlur={e => e.target.style.background = 'rgba(255,255,255,0.08)'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300 hover:text-white transition-colors"
                  >
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <div style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(12px)', transition: 'all 0.5s ease 0.65s' }}>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl font-bold text-sm tracking-wide flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-70 mt-2"
                  style={{
                    background: loading ? 'rgba(99,102,241,0.6)' : 'linear-gradient(135deg, #3b82f6, #6366f1)',
                    color: 'white',
                    boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
                    transform: loading ? 'scale(0.98)' : 'scale(1)',
                  }}
                  onMouseEnter={e => !loading && (e.currentTarget.style.boxShadow = '0 6px 28px rgba(99,102,241,0.6)')}
                  onMouseLeave={e => !loading && (e.currentTarget.style.boxShadow = '0 4px 20px rgba(99,102,241,0.4)')}
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      <LogIn size={17} />
                      Sign In
                    </>
                  )}
                </button>
              </div>
            </form>

          </div>
        </div>

        {/* Footer */}
        <p
          className="text-center text-blue-400 text-xs mt-6"
          style={{ opacity: mounted ? 0.6 : 0, transition: 'opacity 0.5s ease 0.85s' }}
        >
          © 2026 Southsmart Technologies. All rights reserved.
        </p>
      </div>
    </div>
  );
}
