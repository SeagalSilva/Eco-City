'use client';

import { useState } from 'react';
import { User } from 'firebase/auth';
import { db } from '@/lib/firebase';
import { ref, update } from 'firebase/database';

export default function ApartmentEditor({ user, sectorId, onBack, onCheckout, onConfirmAction }: { user: User, sectorId: string, onBack: () => void, onCheckout?: () => void, onConfirmAction: (title: string, message: string, action: () => void) => void }) {
    
    const [isLocked, setIsLocked] = useState(false);
    
    // In a real app, this would fetch the actual state from DB
    const toggleLock = async () => {
        const newState = !isLocked;
        onConfirmAction(newState ? 'Lock Unit' : 'Unlock Unit', `Are you sure you want to ${newState ? 'lock' : 'unlock'} your unit?`, async () => {
            await update(ref(db, `game_states/${user.uid}/rentedApartments/${sectorId}`), { isLocked: newState });
            setIsLocked(newState);
            alert(`Unit is now ${newState ? 'locked' : 'unlocked'}`);
        });
    };

    const actions = [
        { label: 'Sleep', icon: '💤', action: () => onConfirmAction('Sleep', 'Are you sure you want to rest? You will start sleeping.', () => update(ref(db, `game_states/${user.uid}`), { isSleeping: true, sleepStartTime: Date.now() })) },
        { label: 'Check Mail', icon: '📬', action: () => alert('No new messages.') },
        { label: 'Personalize', icon: '🎨', action: () => alert('Coming soon...') },
        { label: isLocked ? 'Unlock' : 'Lock', icon: isLocked ? '🔓' : '🔒', action: toggleLock },
        { label: 'Checkout', icon: '🚪', action: onCheckout || (() => {}) },
    ];

    return (
        <div className="flex flex-col gap-8 h-full bg-[#050505] p-8 rounded-[2.5rem] border border-white/5">
             <div className="flex justify-between items-center">
                  <div>
                     <button onClick={onBack} className="text-emerald-400 mb-2 flex items-center gap-2 hover:translate-x-1 transition-transform font-mono text-sm uppercase tracking-widest">&larr; Back to City</button>
                     <h2 className="text-3xl font-black text-white font-mono tracking-tighter uppercase">My Unit</h2>
                     <p className="text-slate-500 font-mono text-xs uppercase tracking-widest mt-1 italic">{user.displayName || 'User'}</p>
                 </div>
                 {onCheckout && (
                     <button onClick={onCheckout} className="px-6 py-3 bg-amber-500/10 border border-amber-500/30 text-amber-500 rounded-full hover:bg-amber-500 hover:text-white transition-all font-mono font-bold text-xs uppercase tracking-widest active:scale-95 shadow-lg">Checkout</button>
                 )}
             </div>

            <div className="flex-1 flex flex-col items-center justify-center gap-6 bg-black/20 border border-white/5 rounded-[2.5rem] p-12">
                <span className="text-8xl mb-4">🏠</span>
                <h3 className="text-2xl font-black text-white font-mono uppercase tracking-widest italic">Aconchegando-se...</h3>
                <p className="text-slate-400 font-mono text-sm uppercase tracking-widest mb-8">Choose an action for your unit.</p>
                
                <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
                    {actions.map((act, i) => (
                        <button 
                            key={i}
                            onClick={act.action}
                            className="p-6 bg-white/5 hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/30 rounded-3xl flex flex-col items-center gap-4 transition-all group active:scale-95 shadow-lg hover:shadow-emerald-500/10"
                        >
                            <span className="text-4xl group-hover:scale-110 transition-transform">{act.icon}</span>
                            <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-widest">{act.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
