'use client';

import { useState } from 'react';
import { User } from 'firebase/auth';
import { db } from '@/lib/firebase';
import { ref, update } from 'firebase/database';
import BaseModal from './BaseModal';

export default function ApartmentEditor({ user, sectorId, onBack, onCheckout, onConfirmAction }: { user: User, sectorId: string, onBack: () => void, onCheckout?: () => void, onConfirmAction: (title: string, message: string, action: () => void) => void }) {
    
    const [isLocked, setIsLocked] = useState(false);
    const [activeAction, setActiveAction] = useState<string | null>(null);
    
    // In a real app, this would fetch the actual state from DB
    const toggleLock = async () => {
        const newState = !isLocked;
        await update(ref(db, `game_states/${user.uid}/rentedApartments/${sectorId}`), { isLocked: newState });
        setIsLocked(newState);
        setActiveAction(null);
    };

    const actions = [
        { id: 'sleep', label: 'Sleep', icon: '💤' },
        { id: 'mail', label: 'Check Mail', icon: '📬' },
        { id: 'personalize', label: 'Personalize', icon: '🎨' },
        { id: 'lock', label: isLocked ? 'Unlock' : 'Lock', icon: isLocked ? '🔓' : '🔒' },
        { id: 'checkout', label: 'Checkout', icon: '🚪' },
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
                            onClick={() => setActiveAction(act.id)}
                            className="p-6 bg-white/5 hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/30 rounded-3xl flex flex-col items-center gap-4 transition-all group active:scale-95 shadow-lg hover:shadow-emerald-500/10"
                        >
                            <span className="text-4xl group-hover:scale-110 transition-transform">{act.icon}</span>
                            <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-widest">{act.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <BaseModal isOpen={activeAction === 'sleep'} onClose={() => setActiveAction(null)} title="Deep Sleep" titleColor="text-indigo-400">
                <div className="space-y-6">
                    <div className="p-6 bg-indigo-500/10 border border-indigo-500/20 rounded-3xl text-center">
                        <span className="text-6xl animate-pulse">💤</span>
                        <p className="mt-6 text-slate-300 font-mono text-sm leading-relaxed">
                            Resting in your apartment restores your stamina over time. You will enter deep sleep mode.
                        </p>
                    </div>
                    <button 
                        onClick={() => {
                            update(ref(db, `game_states/${user.uid}`), { isSleeping: true, sleepStartTime: Date.now() });
                            setActiveAction(null);
                        }} 
                        className="w-full py-4 bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/30 text-indigo-400 hover:text-white rounded-2xl font-mono font-bold uppercase tracking-widest transition-all shadow-lg active:scale-95"
                    >
                        Start Sleeping
                    </button>
                </div>
            </BaseModal>

            <BaseModal isOpen={activeAction === 'mail'} onClose={() => setActiveAction(null)} title="Unit Mailbox" titleColor="text-amber-400">
                <div className="space-y-6">
                    <div className="p-8 bg-amber-500/10 border border-amber-500/20 rounded-3xl text-center">
                        <span className="text-6xl">📬</span>
                        <p className="mt-6 text-slate-300 font-mono text-sm leading-relaxed uppercase tracking-widest font-black">
                            No New Messages
                        </p>
                        <p className="text-slate-500 font-mono text-[10px] uppercase tracking-widest mt-2">
                            Check the main Mailbox menu outside to read official documents.
                        </p>
                    </div>
                    <button 
                        onClick={() => setActiveAction(null)} 
                        className="w-full py-4 bg-amber-600/20 hover:bg-amber-600 border border-amber-500/30 text-amber-500 hover:text-black rounded-2xl font-mono font-bold uppercase tracking-widest transition-all shadow-lg active:scale-95"
                    >
                        Close Mailbox
                    </button>
                </div>
            </BaseModal>

            <BaseModal isOpen={activeAction === 'personalize'} onClose={() => setActiveAction(null)} title="Personalize Unit" titleColor="text-pink-400">
                <div className="space-y-6">
                    <div className="p-8 bg-pink-500/10 border border-pink-500/20 rounded-3xl text-center">
                        <span className="text-6xl animate-bounce inline-block">🎨</span>
                        <p className="mt-6 text-slate-300 font-mono text-sm leading-relaxed uppercase tracking-widest font-black">
                            Coming Soon
                        </p>
                        <p className="text-slate-500 font-mono text-[10px] uppercase tracking-widest mt-2">
                            The interior design tools are still under development for this property.
                        </p>
                    </div>
                    <button 
                        onClick={() => setActiveAction(null)} 
                        className="w-full py-4 bg-pink-600/20 hover:bg-pink-600 border border-pink-500/30 text-pink-400 hover:text-white rounded-2xl font-mono font-bold uppercase tracking-widest transition-all shadow-lg active:scale-95"
                    >
                        Understood
                    </button>
                </div>
            </BaseModal>

            <BaseModal isOpen={activeAction === 'lock'} onClose={() => setActiveAction(null)} title={isLocked ? "Unlock Unit" : "Lock Unit"} titleColor="text-emerald-400">
                <div className="space-y-6">
                    <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl text-center">
                        <span className="text-6xl">{isLocked ? '🔓' : '🔒'}</span>
                        <p className="mt-6 text-slate-300 font-mono text-sm leading-relaxed">
                            Are you sure you want to {isLocked ? 'unlock' : 'lock'} your unit? 
                            {isLocked ? " Other citizens will be able to enter your room." : " This will prevent unauthorized entry."}
                        </p>
                    </div>
                    <button 
                        onClick={toggleLock} 
                        className={`w-full py-4 ${isLocked ? 'bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 border-emerald-500/30' : 'bg-red-600/20 hover:bg-red-600 text-red-400 border-red-500/30'} hover:text-white rounded-2xl border font-mono font-bold uppercase tracking-widest transition-all shadow-lg active:scale-95`}
                    >
                        Confirm {isLocked ? 'Unlock' : 'Lock'}
                    </button>
                </div>
            </BaseModal>

            <BaseModal isOpen={activeAction === 'checkout'} onClose={() => setActiveAction(null)} title="Checkout Unit" titleColor="text-red-400">
                <div className="space-y-6">
                    <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-3xl text-center">
                        <span className="text-6xl inline-block group-hover:animate-shake">🚪</span>
                        <p className="mt-6 text-slate-300 font-mono text-sm leading-relaxed">
                            Are you sure you want to terminate your lease and check out? 
                            This action cannot be undone and you will lose access to this apartment.
                        </p>
                    </div>
                    <button 
                        onClick={() => {
                            if (onCheckout) onCheckout();
                            setActiveAction(null);
                        }} 
                        className="w-full py-4 bg-red-600/20 hover:bg-red-600 border border-red-500/30 text-red-400 hover:text-white rounded-2xl font-mono font-bold uppercase tracking-widest transition-all shadow-lg active:scale-95"
                    >
                        Confirm Checkout
                    </button>
                </div>
            </BaseModal>
        </div>
    );
}
