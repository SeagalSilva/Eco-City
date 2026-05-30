'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { auth, db } from '../../lib/firebase';
import { ref, update } from 'firebase/database';

function VerifyContent() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token');
    const [status, setStatus] = useState('Verifying...');

    useEffect(() => {
        if (!token) return;

        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            if (user) {
                try {
                    await update(ref(db, `game_states/${user.uid}`), {
                        lastCompletedAdToken: token
                    });
                    setStatus('Verification successful! You can now close this tab and claim your reward in the game.');
                } catch (e) {
                    console.error("Verification error:", e);
                    setStatus('Error connecting to servers.');
                }
            } else {
                setStatus('Please log in to your account first in another tab, then refresh this page.');
            }
        });

        return () => unsubscribe();
    }, [token]);

    if (!token) {
        return (
            <div className="p-8 border border-red-500/30 rounded-3xl bg-black/40 text-center max-w-md w-full">
                <h1 className="text-2xl font-black font-mono text-white mb-6 uppercase tracking-widest text-red-400">Error</h1>
                <p className="text-sm font-mono text-slate-300">Invalid or missing verification token.</p>
            </div>
        );
    }

    return (
        <div className="p-8 border border-emerald-500/30 rounded-3xl bg-black/40 text-center max-w-md w-full shadow-[0_0_50px_rgba(16,185,129,0.1)]">
            <h1 className="text-3xl font-black font-mono text-white mb-6 uppercase tracking-[0.2em] italic">Verification</h1>
            <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                <p className="text-sm font-mono text-slate-300 leading-relaxed">
                    {status}
                </p>
            </div>
            {status.includes('successful') && (
                <button 
                    onClick={() => window.close()}
                    className="mt-8 px-6 py-3 bg-emerald-600 text-black font-black font-mono uppercase tracking-widest text-sm hover:bg-emerald-400 transition-all rounded-xl w-full"
                >
                    Close Tab
                </button>
            )}
        </div>
    );
}

export default function VerifyPage() {
    return (
        <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
            <Suspense fallback={<div className="text-white font-mono animate-pulse">Loading secure connection...</div>}>
                <VerifyContent />
            </Suspense>
        </div>
    );
}
