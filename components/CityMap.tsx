'use client';
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';

interface Location {
    id: string;
    name: string;
    icon?: string;
    description: string;
}

export default function CityMap({ onSelect }: { onSelect: (id: string) => void }) {
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const locationsRef = ref(db, 'departments');
        const unsubscribe = onValue(locationsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const locList = Object.keys(data).map(key => ({
                    id: key,
                    ...data[key],
                    description: data[key].description || ''
                } as Location));
                setLocations(locList);
            } else {
                setLocations([]);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (locations.length === 0) {
        return (
            <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/10">
                <p className="text-slate-400 font-mono italic">The city is currently empty. Contact the Master to initialize the grid.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-gradient-to-r from-emerald-500/50 to-transparent" />
                <h2 className="text-xl md:text-2xl font-black text-emerald-400 font-mono tracking-[0.3em] uppercase">City Grid</h2>
                <div className="h-px flex-1 bg-gradient-to-l from-emerald-500/50 to-transparent" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                {locations.map((loc) => (
                    <button 
                        key={loc.id} 
                        onClick={() => onSelect(loc.id)} 
                        className="relative group p-6 rounded-3xl bg-white/5 border border-white/10 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all duration-500 text-left overflow-hidden active:scale-95 shadow-xl"
                    >
                        {/* Hover glow effect */}
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-radial from-emerald-500/10 to-transparent pointer-events-none" />
                        
                        {loc.icon && loc.icon.startsWith('http') ? (
                            <div className="w-16 h-16 md:w-20 md:h-20 mb-6 flex items-center justify-center">
                                <img src={loc.icon} alt={loc.name} className="w-full h-full object-contain transform group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-500" />
                            </div>
                        ) : (
                            <div className="text-5xl md:text-6xl mb-6 transform group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-500">{loc.icon || '🏢'}</div>
                        )}
                        <div className="space-y-1">
                            <h3 className="font-bold text-lg md:text-xl text-slate-100 group-hover:text-emerald-400 transition-colors uppercase tracking-tight">{loc.name}</h3>
                            <p className="text-xs text-slate-500 font-medium tracking-wide group-hover:text-slate-400 transition-colors line-clamp-1">{loc.description}</p>
                        </div>

                        {/* Corner accent */}
                        <div className="absolute top-0 right-0 w-8 h-8 pointer-events-none overflow-hidden">
                             <div className="absolute top-0 right-0 w-[200%] h-[200%] bg-emerald-500/20 rotate-45 translate-x-[70%] -translate-y-[70%] group-hover:bg-emerald-500/40 transition-colors" />
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
