'use client';
import { useAuth } from '@/components/FirebaseProvider';
import Login from '@/components/Login';
import Game from '@/components/Game';

export default function Home() {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center text-slate-100 font-sans overflow-hidden">
        <div className="relative">
            <div className="w-24 h-24 border-b-2 border-emerald-500 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-full animate-pulse border border-emerald-500/20" />
            </div>
        </div>
        <div className="mt-8 text-center">
            <p className="font-mono font-black text-emerald-400 text-xs tracking-[0.4em] uppercase animate-pulse">Entering the City</p>
            <p className="text-[10px] text-slate-600 font-mono mt-2 italic">Connecting to secure city network...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <Game user={user} />;
}
