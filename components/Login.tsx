'use client';
import { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function Login() {
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (e: any) {
      if (e.code === 'auth/cancelled-popup-request') {
        console.log('User cancelled the popup.');
      } else {
        console.error('Login error:', e);
      }
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#050505] p-6 text-slate-100 font-sans overflow-hidden">
        {/* Ambient background effect */}
        <div className="fixed inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] bg-emerald-500/10 blur-[160px] rounded-full" />
            <div className="absolute top-1/4 left-1/4 w-[40vw] h-[40vw] bg-blue-500/5 blur-[120px] rounded-full animate-pulse" />
        </div>

        <div className="relative z-10 w-full max-w-md bg-white/5 backdrop-blur-2xl border border-white/10 p-10 rounded-[3rem] shadow-2xl flex flex-col items-center text-center">
            <div className="w-24 h-24 bg-emerald-500/20 rounded-[2rem] flex items-center justify-center mb-8 border border-emerald-500/30 shadow-[0_0_50px_-10px_rgba(52,211,153,0.3)]">
                <span className="text-5xl italic">🏙️</span>
            </div>
            
            <h1 className="text-5xl md:text-6xl font-black font-mono tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-white to-cyan-400 italic mb-4">Eco City</h1>
            <p className="text-slate-400 font-medium mb-12 italic">The next generation city-state simulation platform.</p>
            
            <button 
                onClick={login} 
                disabled={loading}
                className="group relative w-full px-8 py-5 bg-emerald-500 text-black rounded-[2rem] hover:bg-white transition-all duration-500 font-black text-xs uppercase tracking-[0.25em] disabled:opacity-50 overflow-hidden shadow-xl shadow-emerald-500/20 active:scale-95"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                <span className="relative z-10">
                    {loading ? 'Authenticating...' : 'Establish Connection'}
                </span>
            </button>
            
            <div className="mt-10 flex items-center gap-4 w-full">
                <div className="h-px flex-1 bg-white/5" />
                <span className="text-[10px] font-mono text-slate-600 font-black uppercase tracking-widest">Protocol Sec-01</span>
                <div className="h-px flex-1 bg-white/5" />
            </div>
        </div>

        <div className="fixed bottom-8 text-[10px] font-mono text-slate-700 font-bold uppercase tracking-[0.3em] flex gap-8">
            <span className="animate-pulse">City Core: Active</span>
            <span>Uptime: 99.99%</span>
            <span>Region: Global</span>
        </div>
    </div>
  );
}
