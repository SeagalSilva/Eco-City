'use client';
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue, update } from 'firebase/database';
import { User } from 'firebase/auth';

export default function Inventory({ user }: { user: User }) {
    const [inventory, setInventory] = useState<any[]>([]);

    useEffect(() => {
        const invRef = ref(db, `game_states/${user.uid}/inventory`);
        const unsub = onValue(invRef, (snap) => {
            const data = snap.val();
            setInventory(data ? Object.keys(data).map(k => ({ id: k, ...data[k] })) : []);
        });
        return () => unsub();
    }, [user.uid]);

    return (
        <div className="bg-black/40 backdrop-blur-xl border border-white/10 p-6 rounded-3xl shadow-2xl">
            <h3 className="font-black text-emerald-400 uppercase tracking-widest mb-4">Inventory</h3>
            <div className="grid grid-cols-4 gap-2">
                {inventory.map((item) => (
                    <div key={item.id} className="p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                        <div className="text-2xl">{item.icon || '📦'}</div>
                        <p className="text-[10px] text-slate-300 font-mono italic truncate">{item.name}</p>
                    </div>
                ))}
                {inventory.length === 0 && <p className="text-slate-600 font-mono text-xs italic col-span-4">Empty.</p>}
            </div>
        </div>
    );
}
