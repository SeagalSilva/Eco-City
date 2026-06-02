'use client';
import { useState, useEffect } from 'react';
import ConfirmationModal from './ConfirmationModal';
import GovernmentActions from './GovernmentActions';
import { db } from '@/lib/firebase';
import { ref, onValue, update, get, push, remove } from 'firebase/database';
import { User } from 'firebase/auth';
import ApartmentEditor from './ApartmentEditor';
import StaffManager from './StaffManager';

interface RoomToClean {
    id: string;
    roomId: string;
    type: string;
    timeRented: number;
    cleaningTimeMs: number;
}

export default function ApartmentsMenu({ user, sectorId }: { user: User, sectorId: string }) {
    const [view, setView] = useState<'menu' | 'my-apartment' | 'rent' | 'staff' | 'browse' | 'mailbox'>('menu');
    const [hasApartment, setHasApartment] = useState(false);
    const [rentedInfo, setRentedInfo] = useState<{type: string} | null>(null);
    const [balance, setBalance] = useState(0);
    const [isStaff, setIsStaff] = useState(false);
    const [isManager, setIsManager] = useState(false);
    const [settings, setSettings] = useState({
        basic: 0,
        premium: 0,
        penthouse: 0,
        prices: { basic: 500, premium: 2500, penthouse: 10000 }
    });
    const [roomsToClean, setRoomsToClean] = useState<RoomToClean[]>([]);
    const [rentedUnits, setRentedUnits] = useState<Record<string, any>>({});
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isGovtModalOpen, setIsGovtModalOpen] = useState(false);
    const [isGovernment, setIsGovernment] = useState(false);
    const [currentConfirm, setCurrentConfirm] = useState<{title: string, message: string, onConfirm: () => void} | null>(null);
    
    // Mailbox system
    const [letters, setLetters] = useState<any[]>([]);
    const [selectedLetter, setSelectedLetter] = useState<any | null>(null);

    const triggerConfirmation = (title: string, message: string, onConfirm: () => void) => {
        setCurrentConfirm({title, message, onConfirm});
        setIsConfirmOpen(true);
    }

    useEffect(() => {
        const stateRef = ref(db, `game_states/${user.uid}`);
        const unsub = onValue(stateRef, async (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setBalance(data.balance || 0);
                if (data.rentedApartments && data.rentedApartments[sectorId]) {
                    setHasApartment(true);
                    setRentedInfo(data.rentedApartments[sectorId]);
                } else {
                    setHasApartment(false);
                    setRentedInfo(null);
                }

                if (data.activeJobId) {
                    const jobSnap = await get(ref(db, `jobs/${data.activeJobId}`));
                    const jobData = jobSnap.val();
                    if (jobData && jobData.departmentId === sectorId) {
                        setIsStaff(true);
                        if (jobData.isManager) setIsManager(true);
                    } else {
                        setIsStaff(false);
                        setIsManager(false);
                    }
                } else {
                    setIsStaff(false);
                    setIsManager(false);
                }
            }
        });

        const settingsRef = ref(db, `departments/${sectorId}/rooms`);
        const unsubSettings = onValue(settingsRef, (snap) => {
            if (snap.exists()) {
                const data = snap.val();
                setSettings({
                    basic: data.basic || 0,
                    premium: data.premium || 0,
                    penthouse: data.penthouse || 0,
                    prices: data.prices || { basic: 500, premium: 2500, penthouse: 10000 }
                });
            }
        });

        const sectorInfoRef = ref(db, `departments/${sectorId}`);
        const unsubSectorInfo = onValue(sectorInfoRef, (snap) => {
            if (snap.exists()) {
                const data = snap.val();
                setIsGovernment(data.type === 'GOVERNMENT' && data.govtSubtype === 'ADMINISTRATION');
            }
        });

        const unitsRef = ref(db, `departments/${sectorId}/rented_units`);
        const unsubUnits = onValue(unitsRef, (snap) => {
            if (snap.exists()) setRentedUnits(snap.val());
            else setRentedUnits({});
        });

        const cleanRef = ref(db, `departments/${sectorId}/roomsToClean`);
        const unsubClean = onValue(cleanRef, (snap) => {
            const data = snap.val();
            if (data) {
                setRoomsToClean(Object.keys(data).map(k => ({ id: k, ...data[k] } as RoomToClean)));
            } else {
                setRoomsToClean([]);
            }
        });

        const unsubMailbox = onValue(ref(db, `game_states/${user.uid}/mailbox`), (snap) => {
            const data = snap.val();
            if (data) {
                setLetters(Object.entries(data).map(([id, item]: [string, any]) => ({ id, ...item })));
            } else {
                setLetters([]);
            }
        });

        return () => {
            unsub();
            unsubSettings();
            unsubSectorInfo();
            unsubUnits();
            unsubClean();
            unsubMailbox();
        };
    }, [user.uid, sectorId]);

    const updatePrice = async (type: 'basic' | 'premium' | 'penthouse', newPrice: number) => {
        await update(ref(db, `departments/${sectorId}/rooms/prices`), {
            [type]: newPrice
        });
        alert(`Price updated for ${type}!`);
    };

    const rentApartment = async (cost: number, type: string) => {
        if (balance < cost) {
            alert('Insufficient funds to rent this apartment.');
            return;
        }
        try {
            const newRoomRef = push(ref(db, `departments/${sectorId}/rented_units`));
            const roomId = newRoomRef.key;

            if (!roomId) throw new Error("Could not generate room ID");

            await update(ref(db, `game_states/${user.uid}`), {
                balance: balance - cost,
                [`rentedApartments/${sectorId}`]: {
                    type,
                    rentedAt: Date.now(),
                    isLocked: false,
                    roomId: roomId
                }
            });

            await update(newRoomRef, {
                ownerName: user.displayName || 'Unknown',
                ownerId: user.uid,
                type,
                isLocked: false
            });

            alert('Apartment rented successfully!');
            setView('menu');
        } catch (e) {
            console.error(e);
            alert('Transaction failed');
        }
    };

    const upgradeRoom = async (type: 'basic' | 'premium' | 'penthouse') => {
        const cost = type === 'basic' ? 500 : type === 'premium' ? 2500 : 10000;
        if (balance < cost) {
            alert('Insufficient funds!');
            return;
        }
        try {
            await update(ref(db, `game_states/${user.uid}`), {
                balance: balance - cost
            });
            await update(ref(db, `departments/${sectorId}/rooms`), {
                ...settings,
                [type]: (settings[type as keyof typeof settings] as number || 0) + 1
            });
            alert(`Added 1 ${type} room for $${cost}!`);
        } catch (e) {
            console.error(e);
            alert('Transaction failed');
        }
    };

    const cleanRoom = async (room: RoomToClean) => {
        triggerConfirmation('Clean Room', `This will take ${Math.ceil(room.cleaningTimeMs / 1000)} seconds. Proceed?`, async () => {
            alert(`Starting cleaning... Wait ${Math.ceil(room.cleaningTimeMs / 1000)}s`);
            setTimeout(async () => {
                await remove(ref(db, `departments/${sectorId}/roomsToClean/${room.id}`));
                alert('Room cleaned!');
            }, room.cleaningTimeMs);
        });
    };

    const employeeSleep = async () => {
        await update(ref(db, `game_states/${user.uid}`), {
            isSleeping: true,
            sleepStartTime: Date.now()
        });
        alert('You are now sleeping in the staff quarters.');
    };

    const handleCheckout = async () => {
        const snap = await get(ref(db, `game_states/${user.uid}/rentedApartments/${sectorId}`));
        const aptData = snap.val();

        if (aptData) {
            const timeRentedMs = Date.now() - aptData.rentedAt;
            const cleaningTimeMs = Math.min(30000, Math.max(5000, Math.floor(timeRentedMs / 60000) * 5000));
            
            await push(ref(db, `departments/${sectorId}/roomsToClean`), {
                roomId: aptData.roomId || Math.floor(Math.random() * 1000).toString().padStart(3, '0'),
                type: aptData.type,
                timeRented: timeRentedMs,
                cleaningTimeMs
            });
            
            await remove(ref(db, `departments/${sectorId}/rented_units/${aptData.roomId}`));
            await remove(ref(db, `game_states/${user.uid}/rentedApartments/${sectorId}`));
            setView('menu');
        }
    };

    if (view === 'mailbox') {
        const deleteLetter = async (id: string) => {
            await remove(ref(db, `game_states/${user.uid}/mailbox/${id}`));
            setSelectedLetter(null);
        };

        return (
            <div className="bg-black/40 p-8 rounded-[2.5rem] border border-white/10 shadow-2xl relative space-y-6 animate-in fade-in duration-300">
                <div className="flex justify-between items-center border-b border-white/10 pb-4">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">📬</span>
                        <div>
                            <h3 className="font-extrabold text-xl text-white tracking-tight uppercase italic">Civil Mailbox</h3>
                            <p className="text-[10px] text-slate-500 font-mono">Residence in Sector: {sectorId.slice(0, 8)}</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => { setView('menu'); setSelectedLetter(null); }} 
                        className="text-xs font-mono px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-all uppercase tracking-widest"
                    >
                        Back
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    {/* Letters list */}
                    <div className="space-y-3">
                        <h4 className="text-xs font-mono text-slate-500 uppercase tracking-widest">Received Envelopes</h4>
                        {letters.map((letter) => (
                            <button 
                                key={letter.id}
                                onClick={() => setSelectedLetter(letter)}
                                className={`w-full p-4 rounded-2xl hover:bg-white/5 border transition-all text-left flex justify-between items-center ${selectedLetter?.id === letter.id ? 'border-cyan-500 bg-cyan-950/10' : 'border-white/5 bg-black/20'}`}
                            >
                                <div className="space-y-1">
                                    <p className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                                        <span>💌</span> {letter.subject || 'Official Correspondence'}
                                    </p>
                                    <p className="text-[10px] text-slate-500 font-mono">Sender: {letter.sender}</p>
                                </div>
                                <span className="text-[9px] text-slate-600 font-mono">
                                    {new Date(letter.receivedAt).toLocaleDateString()}
                                </span>
                            </button>
                        ))}
                        {letters.length === 0 && (
                            <p className="text-xs text-slate-500 font-mono italic p-6 border border-dashed border-white/10 rounded-2xl text-center">
                                No envelopes in the mailbox at the moment.
                            </p>
                        )}
                    </div>

                    {/* Letter contents with animated envelope look */}
                    <div className="p-6 bg-amber-50 rounded-3xl text-slate-900 border-2 border-amber-200 min-h-[250px] shadow-lg flex flex-col justify-between relative overflow-hidden">
                        {/* Stamp ornament */}
                        <div className="absolute top-4 right-4 w-12 h-12 border-2 border-dashed border-amber-800/20 text-amber-900/20 flex items-center justify-center font-mono font-bold text-[8px] uppercase tracking-widest select-none pointer-events-none">
                            POSTAGE
                        </div>

                        {selectedLetter ? (
                            <div className="space-y-6">
                                <div className="border-b border-amber-900/10 pb-4">
                                    <p className="text-[9px] font-mono font-medium text-amber-800/80 mb-1">
                                        SHIPPING DATE: {new Date(selectedLetter.receivedAt).toLocaleString()}
                                    </p>
                                    <p className="text-sm font-black tracking-tight text-amber-950 uppercase italic font-mono mb-2">
                                        Subject: {selectedLetter.subject || 'No Subject'}
                                    </p>
                                    <p className="text-xs font-mono font-bold text-amber-900 flex items-center gap-1 text-slate-700">
                                        Official Sender: {selectedLetter.sender || 'Government'}
                                    </p>
                                </div>

                                <p className="text-xs font-mono leading-relaxed whitespace-pre-wrap text-amber-900 font-semibold italic">
                                    &quot;{selectedLetter.message}&quot;
                                </p>

                                <div className="pt-4 border-t border-amber-900/10 flex justify-end">
                                    <button 
                                        onClick={() => deleteLetter(selectedLetter.id)}
                                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-mono font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all"
                                    >
                                        Destroy Document (Delete)
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
                                <p className="text-amber-900/50 text-6xl select-none animate-bounce">📬</p>
                                <p className="text-xs font-mono text-amber-900/60 font-black uppercase tracking-widest mt-4">
                                Select a letter to read the official content.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (view === 'my-apartment') {
        return <ApartmentEditor user={user} sectorId={sectorId} onBack={() => setView('menu')} onCheckout={handleCheckout} onConfirmAction={triggerConfirmation} />;
    }

    if (view === 'rent') {
        return (
            <div className="bg-black/20 p-8 rounded-3xl border border-white/5 shadow-xl">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="font-black text-2xl text-emerald-400 uppercase tracking-widest italic">Rent an Apartment</h3>
                    <button onClick={() => setView('menu')} className="text-slate-400 hover:text-white uppercase font-mono text-xs tracking-widest">Cancel</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-6 bg-white/5 border border-white/10 rounded-3xl text-center">
                        <div className="text-4xl mb-4">🚪</div>
                        <h4 className="font-bold text-white mb-2 uppercase">Basic Room</h4>
                        <p className="text-emerald-400 font-mono mb-6">${settings.prices.basic.toLocaleString()}</p>
                        <button onClick={() => rentApartment(settings.prices.basic, 'basic')} className="w-full py-3 bg-emerald-600/20 text-emerald-400 rounded-xl hover:bg-emerald-500 hover:text-black font-mono font-bold text-xs uppercase tracking-widest transition-all">Rent</button>
                    </div>
                    <div className="p-6 bg-white/5 border border-amber-500/30 rounded-3xl text-center">
                        <div className="text-4xl mb-4">🏡</div>
                        <h4 className="font-bold text-white mb-2 uppercase">Premium Suite</h4>
                        <p className="text-emerald-400 font-mono mb-6">${settings.prices.premium.toLocaleString()}</p>
                        <button onClick={() => rentApartment(settings.prices.premium, 'premium')} className="w-full py-3 bg-amber-500/20 text-amber-400 rounded-xl hover:bg-amber-500 hover:text-black font-mono font-bold text-xs uppercase tracking-widest transition-all">Rent</button>
                    </div>
                    <div className="p-6 bg-white/5 border border-purple-500/30 rounded-3xl text-center">
                        <div className="text-4xl mb-4">✨</div>
                        <h4 className="font-bold text-white mb-2 uppercase">Penthouse</h4>
                        <p className="text-emerald-400 font-mono mb-6">${settings.prices.penthouse.toLocaleString()}</p>
                        <button onClick={() => rentApartment(settings.prices.penthouse, 'penthouse')} className="w-full py-3 bg-purple-500/20 text-purple-400 rounded-xl hover:bg-purple-500 hover:text-white font-mono font-bold text-xs uppercase tracking-widest transition-all">Rent</button>
                    </div>
                </div>
            </div>
        );
    }

    if (view === 'browse') {
        const handleVisit = async (roomId: string, unitData: any) => {
            if (unitData.isLocked && unitData.ownerId !== user.uid) {
                alert("This room is locked.");
                return;
            }
             alert(`Visiting room ${roomId} owned by ${unitData.ownerName}`);
        }
        
        return (
            <div className="bg-black/20 p-8 rounded-3xl border border-white/5 shadow-xl space-y-8">
                <div className="flex justify-between items-center">
                    <h3 className="font-black text-2xl text-emerald-400 uppercase tracking-widest italic">Sector Units</h3>
                    <button onClick={() => setView('menu')} className="text-slate-400 hover:text-white uppercase font-mono text-xs tracking-widest">Back</button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(rentedUnits).map(([id, data]: [string, any]) => (
                        <div key={id} onClick={() => handleVisit(id, data)} className="p-4 rounded-2xl border bg-emerald-500/20 border-emerald-500/50 cursor-pointer hover:bg-emerald-500/30 transition-all">
                            <div className="text-2xl mb-2">{data.type === 'basic' ? '🚪' : data.type === 'premium' ? '🏡' : '✨'}</div>
                            <p className="text-xs text-slate-400 uppercase font-mono">{data.type}</p>
                            <p className="text-sm font-bold text-emerald-400">{data.isLocked ? '🔒 LOCKED' : '🔓 ENTER'}</p>
                            <p className="text-[10px] text-emerald-600/70 mt-1 uppercase tracking-widest">Owner: {data.ownerName}</p>
                        </div>
                    ))}
                    {Object.keys(rentedUnits).length === 0 && <p className="text-slate-500 italic font-mono col-span-full text-center">No units currently rented.</p>}
                </div>
            </div>
        );
    }

    if (view === 'staff' && isStaff) {
        return (
            <div className="bg-black/20 p-8 rounded-3xl border border-white/5 shadow-xl">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black text-2xl text-emerald-400 uppercase tracking-widest italic">{isManager ? 'Manager Console' : 'Staff Console'}</h3>
                    <button onClick={() => setView('menu')} className="text-slate-400 hover:text-white uppercase font-mono text-xs tracking-widest">Close</button>
                </div>

                <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
                        <h4 className="font-bold text-white mb-2 uppercase font-mono text-sm">Staff Amenities</h4>
                        <p className="text-slate-500 font-mono text-xs mb-4">Rest and recover stamina during your shift.</p>
                        <button onClick={employeeSleep} className="w-full py-3 bg-indigo-500/20 text-indigo-400 rounded-xl hover:bg-indigo-500 hover:text-white transition-all font-mono font-bold text-xs uppercase tracking-widest">
                            <span>💤</span> Sleep in Quarters
                        </button>
                    </div>
                    {isManager && (
                        <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
                            <h4 className="font-bold text-white mb-4 uppercase font-mono text-sm">Pricing Settings</h4>
                            <div className="space-y-3 font-mono text-xs">
                                <div>
                                    <label className="text-slate-500 uppercase tracking-widest block mb-1">Basic Rooms ({settings.basic}) - Price</label>
                                    <input 
                                        type="number" 
                                        defaultValue={settings.prices.basic}
                                        onBlur={(e) => updatePrice('basic', Number(e.target.value))}
                                        className="w-full py-2 bg-emerald-600/20 text-emerald-400 font-mono text-xs uppercase tracking-widest hover:bg-emerald-600 hover:text-white rounded transition-colors text-center"
                                    />
                                    <button onClick={() => upgradeRoom('basic')} className="w-full py-2 bg-emerald-600/20 text-emerald-400 font-mono text-xs uppercase tracking-widest hover:bg-emerald-600 hover:text-white rounded transition-colors mt-2">+ Add Basic ($500)</button>
                                </div>
                                <div>
                                    <label className="text-slate-500 uppercase tracking-widest block mb-1">Premium Rooms ({settings.premium}) - Price</label>
                                    <input 
                                        type="number" 
                                        defaultValue={settings.prices.premium}
                                        onBlur={(e) => updatePrice('premium', Number(e.target.value))}
                                        className="w-full py-2 bg-amber-500/20 text-amber-400 font-mono text-xs uppercase tracking-widest hover:bg-amber-500 hover:text-white rounded transition-colors text-center"
                                    />
                                    <button onClick={() => upgradeRoom('premium')} className="w-full py-2 bg-amber-500/20 text-amber-400 font-mono text-xs uppercase tracking-widest hover:bg-amber-500 hover:text-white rounded transition-colors mt-2">+ Add Premium ($2500)</button>
                                </div>
                                <div>
                                    <label className="text-slate-500 uppercase tracking-widest block mb-1">Penthouse Rooms ({settings.penthouse}) - Price</label>
                                    <input 
                                        type="number" 
                                        defaultValue={settings.prices.penthouse}
                                        onBlur={(e) => updatePrice('penthouse', Number(e.target.value))}
                                        className="w-full py-2 bg-purple-500/20 text-purple-400 font-mono text-xs uppercase tracking-widest hover:bg-purple-500 hover:text-white rounded transition-colors text-center"
                                    />
                                    <button onClick={() => upgradeRoom('penthouse')} className="w-full py-2 bg-purple-500/20 text-purple-400 font-mono text-xs uppercase tracking-widest hover:bg-purple-500 hover:text-white rounded transition-colors mt-2">+ Add Penthouse ($10000)</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <h4 className="font-bold text-white mb-4 uppercase tracking-widest font-mono text-sm">Maintenance Queue</h4>
                <div className="space-y-2 mb-8">
                    {roomsToClean.length === 0 && <p className="text-slate-500 font-mono text-xs italic">No rooms currently require cleaning.</p>}
                    {roomsToClean.map(room => (
                        <div key={room.id} className="p-4 bg-white/5 border border-amber-500/20 rounded-xl flex items-center justify-between font-mono text-xs">
                            <div>
                                <p className="text-white font-bold">Room #{room.roomId} - {room.type.toUpperCase()}</p>
                                <p className="text-amber-500/70 animate-pulse">Needs Cleaning</p>
                            </div>
                            <button onClick={() => cleanRoom(room)} className="px-4 py-2 bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500 hover:text-white transition-colors">Start Cleaning</button>
                        </div>
                    ))}
                </div>

                {isManager && <StaffManager departmentId={sectorId} isManager={isManager} />}
            </div>
        );
    }

    const isAdmin = user.email === 'seagalsilva@gmail.com';
    return (
        <div className="space-y-8">
            <ConfirmationModal 
                isOpen={isConfirmOpen}
                title={currentConfirm?.title || ''}
                message={currentConfirm?.message || ''}
                onConfirm={() => {
                    if (currentConfirm) currentConfirm.onConfirm();
                    setIsConfirmOpen(false);
                }}
                onCancel={() => setIsConfirmOpen(false)}
            />
            <GovernmentActions
                isOpen={isGovtModalOpen}
                onClose={() => setIsGovtModalOpen(false)}
                sectorId={sectorId}
                user={user}
                isEmployee={isStaff}
                isManager={isManager}
            />
            <div className="flex items-center gap-2 px-6 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl w-fit">
                <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-widest animate-pulse">Occupancy: 84%</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {hasApartment ? (
                    <button 
                        onClick={() => setView('my-apartment')} 
                        className="relative group p-8 bg-white/5 border border-white/5 rounded-3xl hover:border-emerald-500/50 transition-all duration-500 text-left overflow-hidden shadow-xl"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/0 via-emerald-500/0 to-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                        <div className="text-5xl mb-6 group-hover:scale-110 transition-transform duration-500 transform-gpu italic">🛋️</div>
                        <h3 className="font-black text-2xl text-slate-200 group-hover:text-emerald-400 transition-colors uppercase tracking-tight italic">My Unit</h3>
                        <p className="text-xs text-slate-400 mt-2 font-medium tracking-wide">Enter your private residential unit.</p>
                    </button>
                ) : (
                    <button 
                        onClick={() => setView('rent')} 
                        className="relative group p-8 bg-blue-500/10 border border-blue-500/20 rounded-3xl hover:bg-blue-600/20 transition-all duration-500 text-left overflow-hidden shadow-xl"
                    >
                        <div className="text-5xl mb-6 group-hover:scale-110 transition-transform duration-500 transform-gpu italic">🔑</div>
                        <h3 className="font-black text-2xl text-blue-400 uppercase tracking-tight italic">Rent Unit</h3>
                        <p className="text-xs text-blue-300/70 mt-2 font-medium tracking-wide">Lease an apartment in this sector.</p>
                    </button>
                )}

                <button 
                    onClick={() => setView('browse')} 
                    className="relative group p-8 bg-white/5 border border-white/5 rounded-3xl hover:border-blue-500/50 transition-all duration-500 text-left overflow-hidden shadow-xl"
                >
                    <div className="text-5xl mb-6 group-hover:scale-110 transition-transform duration-500 transform-gpu italic">🗺️</div>
                    <h3 className="font-black text-2xl text-slate-200 group-hover:text-blue-400 transition-colors uppercase tracking-tight italic">Browse Units</h3>
                    <p className="text-xs text-slate-400 mt-2 font-medium tracking-wide">View all units in this sector.</p>
                </button>

                <button 
                    onClick={() => setView('mailbox')} 
                    className="relative group p-8 bg-cyan-500/5 border border-cyan-500/20 rounded-3xl hover:border-cyan-500/50 transition-all duration-500 text-left overflow-hidden shadow-xl"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/0 via-cyan-500/0 to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    <div className="text-5xl mb-6 group-hover:scale-110 transition-transform duration-500 transform-gpu italic flex justify-between items-center">
                        <span>📬</span>
                        {letters.length > 0 && (
                            <span className="bg-red-500 text-white rounded-full text-xs font-mono font-bold px-2 py-0.5 animate-bounce">
                                {letters.length}
                            </span>
                        )}
                    </div>
                    <h3 className="font-black text-2xl text-slate-200 group-hover:text-cyan-400 transition-colors uppercase tracking-tight italic">Mailbox</h3>
                    <p className="text-xs text-slate-400 mt-2 font-medium tracking-wide">Read official letters sent by the government.</p>
                </button>
            </div>

            {isStaff && (
                <div className="mt-8">
                    <button onClick={() => setView('staff')} className="w-full p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-xl hover:bg-indigo-500 hover:text-white transition-all font-mono font-bold text-indigo-400 uppercase tracking-widest text-sm flex items-center justify-center gap-2">
                        <span>👔</span> Staff Terminal {roomsToClean.length > 0 && <span className="bg-amber-500 text-black px-2 py-0.5 rounded-full text-[10px] animate-pulse">{roomsToClean.length}</span>}
                    </button>
                </div>
            )}

            {isGovernment && (
                <div className="mt-8">
                    <button onClick={() => setIsGovtModalOpen(true)} className="w-full p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl hover:bg-cyan-500 hover:text-black transition-all font-mono font-bold text-cyan-400 uppercase tracking-widest text-sm flex items-center justify-center gap-2">
                        <span>🏛️</span> Government Terminal
                    </button>
                </div>
            )}

            {isAdmin && (
                <div className="mt-8 p-8 bg-red-500/5 border border-red-500/20 rounded-3xl relative overflow-hidden">
                    <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                        <div>
                            <h3 className="font-black text-xl text-red-400 uppercase tracking-widest italic mb-1">System level override</h3>
                            <p className="text-sm text-slate-400 font-medium italic">Advanced residential sector management authorized for your ID.</p>
                        </div>
                        <button className="px-8 py-3 bg-red-600/20 border border-red-600/30 text-red-400 rounded-2xl hover:bg-red-600 hover:text-white transition-all font-mono font-bold text-xs uppercase tracking-widest">
                            Global Controls
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
