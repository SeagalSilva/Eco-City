'use client';
import { User } from 'firebase/auth';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { useState, useEffect } from 'react';

export default function ProfileModal({ user, onClose }: { user: User, onClose: () => void }) {
    const [stats, setStats] = useState({ level: 0, xp: 0 });
    const [levels, setLevels] = useState<{ level: number, xpRequired: number }[]>([]);

    useEffect(() => {
        const statsRef = ref(db, `game_states/${user.uid}`);
        const unsub = onValue(statsRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                setStats({ level: data.level ?? 0, xp: data.xp || 0 });
            }
        });
        const levelsRef = ref(db, 'levels');
        const unsubLevels = onValue(levelsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setLevels(Object.keys(data).map(key => ({ ...data[key] } as any)).sort((a,b) => a.level - b.level));
            }
        });
        return () => { unsub(); unsubLevels(); };
    }, [user.uid]);

    const currentLevel = levels.find(l => l.level === stats.level) || { level: 0, xpRequired: 0 };
    const nextLevel = levels.find(l => l.level === stats.level + 1);
    
    // XP needed to *reach* the next level minus current XP
    const xpNeededForNext = nextLevel ? (nextLevel.xpRequired - stats.xp) : 0;
    const progress = nextLevel
        ? Math.min(100, ((stats.xp - currentLevel.xpRequired) / (nextLevel.xpRequired - currentLevel.xpRequired)) * 100)
        : 100;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#111] border border-white/10 p-8 rounded-3xl max-w-sm w-full">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-black font-mono text-white">Profile</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-white">✕</button>
                </div>
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center text-2xl">👤</div>
                    <div>
                        <div className="font-bold text-lg">{user.displayName || 'User'}</div>
                        <div className="text-sm text-emerald-400 font-mono">Level {stats.level}</div>
                    </div>
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between text-xs font-mono text-slate-400 uppercase">
                        <span>XP for next level</span>
                        <span>{xpNeededForNext}</span>
                    </div>
                    <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-500 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                </div>
            </div>
        </div>
    );
}
