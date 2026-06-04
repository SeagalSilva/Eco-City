'use client';
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { User } from 'firebase/auth';
import WorkView from './WorkView';

interface Department {
    id: string;
    name: string;
    description: string;
    icon?: string;
    type?: string;
}

import BankMenu from './BankMenu';
import ApartmentsMenu from './ApartmentsMenu';
import GovernmentMenu from './GovernmentMenu';
import PoliceMenu from './PoliceMenu';

import { get } from 'firebase/database';

export default function SectorView({ user, sectorId, onBack }: { user: User, sectorId: string, onBack: () => void }) {
    const [sector, setSector] = useState<Department | null>(null);
    const [showWorkView, setShowWorkView] = useState(false);

    useEffect(() => {
        const sectorRef = ref(db, `departments/${sectorId}`);
        const unsubscribe = onValue(sectorRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setSector({ id: sectorId, ...data });
            } else {
                setSector(null);
            }
        });
        return () => unsubscribe();
    }, [sectorId]);

    if (!sector) {
        return (
            <div className="flex justify-center py-20">
                <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (showWorkView) {
        return <WorkView district={sector.id} onBack={() => setShowWorkView(false)} />;
    }
        
    const renderSectorMenu = () => {
        if (sector.type === 'APARTMENT') {
            return <ApartmentsMenu user={user} sectorId={sector.id} />;
        }
        
        if (sector.type === 'BANCO' || sector.type === 'BANK') {
            return <BankMenu user={user} sectorId={sector.id} />;
        }

        if (sector.type === 'GOVERNMENT') {
            return <GovernmentMenu user={user} sectorId={sector.id} />;
        }

        if (sector.type === 'POLICE') {
            return <PoliceMenu user={user} sectorId={sector.id} />;
        }
        
        return (
            <div className="text-center p-12 bg-white/5 rounded-2xl border border-white/10 font-mono text-slate-400">
                Interaction menu for {sector.type} will be added soon.
            </div>
        );
    }

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <button onClick={onBack} className="mb-6 text-emerald-500 font-mono text-sm hover:text-emerald-400 transition-colors uppercase tracking-widest flex items-center gap-2">
                &larr; Return to City Map
            </button>
            <div className="bg-black/40 border border-white/10 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden mb-8">
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                <div className="flex justify-between items-start mb-8">
                    <div className="flex items-center gap-6">
                        <div className="bg-white/5 p-6 rounded-[2rem] shadow-xl flex items-center justify-center w-28 h-28">
                            {sector.icon && sector.icon.startsWith('http') ? (
                                <img src={sector.icon} alt={sector.name} className="w-16 h-16 object-contain" />
                            ) : (
                                <span className="text-6xl">{sector.icon || '🏢'}</span>
                            )}
                        </div>
                        <div>
                            <p className="text-sm text-emerald-500 font-mono font-black uppercase tracking-[0.2em] mb-1">
                                {sector.type || 'Sector'}
                            </p>
                            <h2 className="text-4xl font-black italic tracking-tighter uppercase text-white">
                                {sector.name}
                            </h2>
                            <p className="text-slate-400 mt-2 max-w-lg">{sector.description}</p>
                        </div>
                    </div>
                    <button onClick={() => setShowWorkView(true)} className="px-5 py-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl hover:bg-amber-500 hover:text-black transition-all font-mono font-bold text-[10px] uppercase tracking-[0.2em] active:scale-95 shadow-lg shadow-amber-500/10 flex items-center gap-2">
                        <span>💼</span> Jobs
                    </button>
                </div>

                <div className="pt-8 border-t border-white/10">
                    <h3 className="text-xl font-bold font-mono text-white mb-6 uppercase tracking-widest">
                        Sector Services
                    </h3>
                    {renderSectorMenu()}
                </div>
            </div>
        </div>
    );
}
