'use client';
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue, update, remove, push, set } from 'firebase/database';
import { User } from 'firebase/auth';
import BaseModal from './BaseModal';

export default function Inventory({ user }: { user: User }) {
    const [inventory, setInventory] = useState<any[]>([]);
    const [apartments, setApartments] = useState<any[]>([]);
    const [activeItem, setActiveItem] = useState<any | null>(null);

    useEffect(() => {
        const stateRef = ref(db, `game_states/${user.uid}`);
        const unsub = onValue(stateRef, (snap) => {
            const data = snap.val();
            if (data) {
                if (data.inventory) {
                    setInventory(Object.keys(data.inventory).map(k => ({ id: k, ...data.inventory[k] })));
                } else {
                    setInventory([]);
                }
                if (data.rentedApartments) {
                    setApartments(Object.keys(data.rentedApartments).map(k => ({ id: k, ...data.rentedApartments[k] })));
                } else {
                    setApartments([]);
                }
            } else {
                setInventory([]);
                setApartments([]);
            }
        });
        return () => unsub();
    }, [user.uid]);

    const handleSign = async () => {
        if (!activeItem) return;
        try {
            await update(ref(db, `game_states/${user.uid}/inventory/${activeItem.id}`), {
                signed: true,
                signedAt: Date.now()
            });
            alert('Document signed successfully!');
            setActiveItem(null);
        } catch (e: any) {
            alert('Error signing document: ' + e.message);
        }
    };

    const handleTrash = async () => {
        if (!activeItem) return;
        if (!confirm(`Are you sure you want to throw away ${activeItem.name}?`)) return;
        try {
            await remove(ref(db, `game_states/${user.uid}/inventory/${activeItem.id}`));
            alert('Item discarded.');
            setActiveItem(null);
        } catch (e: any) {
            alert('Error discarding item: ' + e.message);
        }
    };

    const handleSendToHome = async (aptId: string) => {
        if (!activeItem) return;
        try {
            // Add to apartment inventory
            await set(ref(db, `apartments/${aptId}/inventory/${activeItem.id}`), activeItem);
            // Remove from player inventory
            await remove(ref(db, `game_states/${user.uid}/inventory/${activeItem.id}`));
            alert('Item sent to home successfully!');
            setActiveItem(null);
        } catch (e: any) {
            alert('Error sending item to home: ' + e.message);
        }
    };

    return (
        <div className="relative">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {inventory.map((item) => (
                    <div 
                        key={item.id} 
                        onClick={() => setActiveItem(item)}
                        className={`p-4 rounded-xl border text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 shadow-lg ${!item.signed && (item.type === 'EMPLOYMENT_CONTRACT' || item.type === 'LAND_DEED') ? 'bg-amber-500/10 border-amber-500/50 hover:bg-amber-500/20' : 'bg-slate-800/50 border-white/10 hover:border-emerald-500/50 hover:bg-slate-800/80'}`}
                    >
                        <div className="text-4xl relative drop-shadow-md">
                            {item.icon || '📦'}
                            {!item.signed && (item.type === 'EMPLOYMENT_CONTRACT' || item.type === 'LAND_DEED') && (
                                <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 border border-black rounded-full animate-pulse"></span>
                            )}
                        </div>
                        <p className="text-xs text-slate-200 font-bold tracking-tight truncate w-full">{item.name}</p>
                        <p className="text-[9px] text-slate-500 font-mono uppercase bg-black/30 px-2 py-0.5 rounded w-full truncate">{item.type.replace(/_/g, ' ')}</p>
                    </div>
                ))}
                {inventory.length === 0 && <p className="text-slate-500 font-mono text-sm italic col-span-full text-center py-10 bg-black/20 rounded-xl border border-white/5">You have no items in your inventory.</p>}
            </div>

            {/* Active Item Modal */}
            <BaseModal 
                isOpen={!!activeItem} 
                onClose={() => setActiveItem(null)} 
                title="Item Inspector" 
                titleColor="text-emerald-400"
            >
                {activeItem && (
                    <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-200">
                        <div className="text-8xl mb-6 drop-shadow-2xl bg-black/40 p-8 rounded-[2rem] border border-white/10">
                            {activeItem.icon || '📦'}
                        </div>
                        
                        <div className="w-full text-center mb-6">
                            <h4 className="text-2xl font-black font-mono text-white tracking-widest mb-2 leading-tight">{activeItem.name}</h4>
                            <span className="inline-block px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold uppercase rounded-lg tracking-widest">
                                {activeItem.type.replace(/_/g, ' ')}
                            </span>
                        </div>
                        
                        {(activeItem.type === 'EMPLOYMENT_CONTRACT' || activeItem.type === 'LAND_DEED') && (
                            <div className="w-full bg-slate-900 border border-white/10 rounded-2xl p-5 mb-8 shadow-inner">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-slate-500 font-mono uppercase font-black">Issue Date</p>
                                        <p className="text-sm text-slate-200 font-mono">{activeItem.hiredAt || activeItem.purchasedAt ? new Date(activeItem.hiredAt || activeItem.purchasedAt).toLocaleDateString() : 'N/A'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-slate-500 font-mono uppercase font-black">Expiration</p>
                                        <p className="text-sm text-slate-200 font-mono">{activeItem.expiresAt ? new Date(activeItem.expiresAt).toLocaleDateString() : '1 Year from start'}</p>
                                    </div>
                                    {activeItem.jobTitle && (
                                        <div className="col-span-2 space-y-1">
                                            <p className="text-[10px] text-slate-500 font-mono uppercase font-black">Role / Position</p>
                                            <p className="text-sm text-slate-200 font-mono">{activeItem.jobTitle}</p>
                                        </div>
                                    )}
                                </div>
                                <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                                    <span className="text-[10px] text-slate-500 font-mono uppercase font-black">Validation Status</span>
                                    {activeItem.signed ? (
                                        <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs font-bold font-mono">✅ VALIDATED & SIGNED</span>
                                    ) : (
                                        <span className="px-2 py-1 bg-amber-500/20 text-amber-500 rounded text-xs font-bold font-mono animate-pulse">⚠️ PENDING SIGNATURE</span>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col gap-3 w-full">
                            {!activeItem.signed && (activeItem.type === 'EMPLOYMENT_CONTRACT' || activeItem.type === 'LAND_DEED') && (
                                <button 
                                    onClick={handleSign}
                                    className="w-full py-4 bg-emerald-500 text-black font-black uppercase font-mono tracking-widest text-sm rounded-xl hover:bg-emerald-400 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:scale-[1.02]"
                                >
                                    ✍️ Sign Document
                                </button>
                            )}
                            
                            {apartments.length > 0 && (
                                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl space-y-3 mt-2">
                                    <p className="text-xs font-mono text-blue-400 font-bold uppercase tracking-widest text-center">Transfer to Property</p>
                                    <div className="grid grid-cols-1 gap-2">
                                        {apartments.map(apt => (
                                            <button 
                                                key={apt.id}
                                                onClick={() => handleSendToHome(apt.id)}
                                                className="w-full py-3 bg-black/40 border border-blue-500/30 text-blue-300 text-xs font-bold uppercase font-mono tracking-widest rounded-lg hover:bg-blue-500 hover:text-white transition-colors"
                                            >
                                                🏡 {apt.apartmentName || 'Apartment'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button 
                                onClick={handleTrash}
                                className="w-full py-3 mt-4 bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold uppercase font-mono tracking-widest rounded-xl hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2"
                            >
                                🗑️ Destroy Item
                            </button>
                        </div>
                    </div>
                )}
            </BaseModal>
        </div>
    );
}
