'use client';
import { User } from 'firebase/auth';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ref, onValue, set, update } from 'firebase/database';
import { db, handleDatabaseError, OperationType } from '@/lib/firebase';
import Chat from './Chat';
import CityMap from './CityMap';
import AdminPanel from './AdminPanel';
import ProfileModal from './ProfileModal';
import Inventory from './Inventory';
import SectorView from './SectorView';

export default function Game({ user }: { user: User }) {
  const [balance, setBalance] = useState(0);
  const [stamina, setStamina] = useState(100);
  const [isSleeping, setIsSleeping] = useState(false);
  const [sleepStartTime, setSleepStartTime] = useState<number | null>(null);
  const [currentLocation, setCurrentLocation] = useState<string>('map');
  const [travelEndTime, setTravelEndTime] = useState<number | null>(null);
  const [travelDestination, setTravelDestination] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  
  const [activeView, setActiveView] = useState<'map' | 'sector' | 'admin'>('map');
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  
  const [pendingTravelId, setPendingTravelId] = useState<string | null>(null);
  const [taxiPrice, setTaxiPrice] = useState(15);
  
  const isAdmin = user.email === 'seagalsilva@gmail.com';
  
  useEffect(() => {
    const gameDocRef = ref(db, `game_states/${user.uid}`);
    const unsubscribe = onValue(gameDocRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            setBalance(data.balance || 0);
            
            // Calculate offline stamina recovery
            let currentStamina = data.stamina ?? 100;
            if (data.isSleeping && data.sleepStartTime) {
                const elapsedMs = Date.now() - data.sleepStartTime;
                const gained = Math.floor(elapsedMs / (120 * 1000));
                if (gained > 0) {
                    currentStamina = Math.min(100, currentStamina + gained);
                    // Also update start time so we don't double count if they stay online
                    update(ref(db, `game_states/${user.uid}`), {
                        stamina: currentStamina,
                        sleepStartTime: Date.now() - (elapsedMs % (120 * 1000))
                    });
                }
            }
            
            setStamina(currentStamina);
            setIsSleeping(data.isSleeping ?? false);
            setSleepStartTime(data.sleepStartTime ?? null);
            setCurrentLocation(data.currentLocation || 'map');
            setTravelEndTime(data.travelEndTime || null);
            setTravelDestination(data.travelDestination || null);
        } else {
            const initialGameState = { userId: user.uid, balance: 0, stamina: 100, assets: [], currentLocation: 'map' };
            set(gameDocRef, initialGameState).catch(e => handleDatabaseError(e, OperationType.CREATE, `game_states/${user.uid}`));
        }
    }, (error) => {
        handleDatabaseError(error, OperationType.GET, `game_states/${user.uid}`);
    });

    const settingsRef = ref(db, 'system_settings');
    const unsubSettings = onValue(settingsRef, (snap) => {
        if (snap.exists()) {
            const data = snap.val();
            if (data.taxiPrice !== undefined) setTaxiPrice(data.taxiPrice);
        }
    });

    return () => { unsubscribe(); unsubSettings(); };
  }, [user.uid]);

  const handleDistrictSelect = (id: string) => {
      if (currentLocation === id) {
          setSelectedSectorId(id);
          setActiveView('sector');
      } else {
          setPendingTravelId(id);
      }
  }

  const handleReturnToMap = () => {
      if (currentLocation === 'map') {
          setActiveView('map');
      } else {
          setPendingTravelId('map');
      }
  }

  const startTravel = async (destinationId: string, durationMs: number, staminaCost = 0) => {
      try {
          if (staminaCost > 0 && stamina < staminaCost) {
              alert('Not enough stamina to walk. Try getting some sleep.');
              return;
          }
          const endTime = Date.now() + durationMs;
          await update(ref(db, `game_states/${user.uid}`), {
              travelDestination: destinationId,
              travelEndTime: endTime,
              stamina: stamina - staminaCost
          });
          setPendingTravelId(null);
      } catch (e) {
          console.error(e);
      }
  }

  // Handle travel completion
  useEffect(() => {
    if (travelEndTime && travelEndTime > 0 && travelDestination) {
        const remaining = travelEndTime - Date.now();
        if (remaining <= 0) {
            // Already arrived, update state once
            update(ref(db, `game_states/${user.uid}`), {
                currentLocation: travelDestination,
                travelDestination: null,
                travelEndTime: null
            });
            setTimeout(() => {
                if (travelDestination === 'map') {
                    setActiveView('map');
                } else {
                    setSelectedSectorId(travelDestination);
                    setActiveView('sector');
                }
            }, 0);
        } else {
            // Set timeout for when to arrive
            const timeout = setTimeout(() => {
                 update(ref(db, `game_states/${user.uid}`), {
                    currentLocation: travelDestination,
                    travelDestination: null,
                    travelEndTime: null
                });
                if (travelDestination === 'map') {
                    setActiveView('map');
                } else {
                    setSelectedSectorId(travelDestination);
                    setActiveView('sector');
                }
            }, remaining);
            return () => clearTimeout(timeout);
        }
    }
  }, [travelEndTime, travelDestination, user.uid]);

  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
      let interval: any;
      if (travelEndTime && travelEndTime > 0) {
          interval = setInterval(() => {
              setCurrentTime(Date.now());
          }, 1000);
      } else if (isSleeping) {
          interval = setInterval(() => {
              setCurrentTime(Date.now());
          }, 1000); // update every second while sleeping
      }
      return () => clearInterval(interval);
  }, [travelEndTime, isSleeping]);

  const remainingTravelTime = travelEndTime ? Math.max(0, travelEndTime - currentTime) : 0;
  const isTraveling = remainingTravelTime > 0 && travelDestination;
  
  // Visual stamina during sleep
  let displayStamina = stamina;
  if (isSleeping && sleepStartTime) {
      const elapsedMs = currentTime - sleepStartTime;
      const gained = Math.floor(elapsedMs / (120 * 1000));
      displayStamina = Math.min(100, stamina + gained);
  }

  return (
    <div className="min-h-screen bg-[#050505] text-slate-100 p-4 md:p-8 font-sans selection:bg-emerald-500/30">
        {/* Ambient background effect */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full" />
            <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
        </div>

        <header className="relative flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6 bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-3xl shadow-2xl">
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                    <h1 className="text-3xl md:text-5xl font-black font-mono tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 italic">Eco City</h1>
                    {isAdmin && <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full font-mono uppercase font-bold tracking-widest">Master</span>}
                </div>
                <p className="text-slate-400 text-sm md:text-base">Identity: <span className="text-emerald-400 font-medium font-mono">{user.displayName || user.email}</span></p>
                <div className="flex items-center gap-2 mt-2">
                    <button onClick={() => setShowProfile(true)} className="flex items-center gap-2 p-2 bg-white/5 hover:bg-white/10 rounded-full transition-all">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs">👤</div>
                    </button>
                    <span className="text-[10px] bg-purple-500/20 border border-purple-500/30 text-purple-400 px-3 py-1 rounded-full uppercase tracking-widest font-mono font-bold">
                        Loc: {currentLocation === 'map' ? 'City Streets' : currentLocation}
                    </span>
                </div>
            </div>

            {showProfile && <ProfileModal user={user} onClose={() => setShowProfile(false)} />}
            {showInventory && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="w-full max-w-lg relative">
                        <button onClick={() => setShowInventory(false)} className="absolute -top-10 right-0 text-slate-500 hover:text-white">Close</button>
                        <Inventory user={user} />
                    </div>
                </div>
            )}


            <div className="flex flex-wrap items-center gap-3 md:gap-6 w-full md:w-auto">
                {isAdmin && activeView !== 'admin' && (
                    <button 
                      onClick={() => setActiveView('admin')}
                      className="px-6 py-3 bg-red-600/10 border border-red-600/30 text-red-400 rounded-2xl hover:bg-red-600 hover:text-white transition-all font-mono font-bold text-xs uppercase tracking-widest active:scale-95"
                    >
                        Management
                    </button>
                )}
                
                <button
                    onClick={() => setShowInventory(true)}
                    className="p-3 bg-white/5 border border-white/5 rounded-2xl text-slate-300 hover:bg-white/10 hover:text-emerald-400 transition-all font-mono uppercase text-xs"
                >
                    📦 Inventory
                </button>
                
                <div className="flex-1 md:flex-none flex flex-col items-end bg-black/40 border border-white/5 px-6 py-3 rounded-2xl">
                    <span className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mb-1">Energy / Stamina</span>
                    <span className="text-2xl md:text-3xl font-mono text-cyan-400 font-bold tabular-nums">
                        ⚡ {displayStamina}
                    </span>
                </div>
                
                <div className="flex-1 md:flex-none flex flex-col items-end bg-black/40 border border-white/5 px-6 py-3 rounded-2xl">
                    <span className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mb-1">Current Balance</span>
                    <span className="text-2xl md:text-3xl font-mono text-emerald-400 font-bold tabular-nums">
                        ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                </div>
            </div>
        </header>

        <main className="relative max-w-7xl mx-auto">
            {isSleeping ? (
                 <div className="flex flex-col items-center justify-center py-32 bg-indigo-950/80 border border-indigo-500/20 rounded-[3rem] shadow-2xl backdrop-blur-xl">
                    <div className="text-6xl mb-6 animate-pulse">💤</div>
                    <h2 className="text-4xl font-black font-mono text-indigo-400 tracking-tighter uppercase italic mb-4">Deep Sleep</h2>
                    <p className="text-indigo-300 font-mono tracking-widest mb-8">Restoring Stamina... (1 ⚡ / 2 min)</p>
                    {sleepStartTime && (
                        <p className="text-slate-400 font-mono text-sm mb-4">Next batch in: {Math.floor(((120000 - ((currentTime - sleepStartTime) % 120000)) / 1000))} seconds</p>
                    )}
                    <div className="text-3xl font-mono text-cyan-400 font-bold mb-12 tabular-nums">
                        ⚡ {displayStamina} / 100
                    </div>
                    <button 
                        onClick={() => {
                            let newStamina = stamina;
                            if (sleepStartTime) {
                                const elapsedMs = Date.now() - sleepStartTime;
                                const gained = Math.floor(elapsedMs / (120 * 1000));
                                newStamina = Math.min(100, stamina + gained);
                            }
                            update(ref(db, `game_states/${user.uid}`), { 
                                isSleeping: false, 
                                sleepStartTime: null,
                                stamina: newStamina
                            });
                        }}
                        className="px-12 py-4 bg-indigo-500/20 border border-indigo-500/50 text-indigo-300 rounded-full hover:bg-indigo-500 hover:text-white transition-all font-mono font-bold uppercase tracking-widest active:scale-95 shadow-[0_0_40px_rgba(99,102,241,0.2)]"
                    >
                        Wake Up
                    </button>
                 </div>
            ) : isTraveling ? (
                <div className="flex flex-col items-center justify-center py-32 bg-black/40 border border-white/10 rounded-[3rem] shadow-2xl backdrop-blur-md">
                    <div className="relative w-32 h-32 mb-8">
                        <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping" />
                        <div className="absolute inset-2 bg-emerald-500/20 rounded-full animate-ping delay-75" />
                        <div className="absolute inset-0 flex items-center justify-center text-6xl transform animate-bounce">
                            🚶
                        </div>
                    </div>
                    <h2 className="text-3xl font-black font-mono text-emerald-400 tracking-tighter uppercase italic mb-4">Traveling</h2>
                    <p className="text-slate-400 font-mono tracking-widest">ETA: {Math.ceil(remainingTravelTime / 1000)} seconds</p>
                    <div className="mt-8 w-64 h-2 bg-white/10 rounded-full overflow-hidden">
                        <motion.div 
                            className="h-full bg-emerald-500 rounded-full"
                            initial={{ width: '0%' }}
                            animate={{ width: '100%' }}
                            transition={{ duration: remainingTravelTime / 1000, ease: 'linear' }}
                        />
                    </div>
                </div>
            ) : (
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeView}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                    >
                        {activeView === 'map' && <CityMap onSelect={handleDistrictSelect} />}
                        {activeView === 'sector' && selectedSectorId && <SectorView user={user} sectorId={selectedSectorId} onBack={handleReturnToMap} />}
                        {activeView === 'admin' && <AdminPanel user={user} onBack={handleReturnToMap} />}
                    </motion.div>
                </AnimatePresence>
            )}
        </main>

        {pendingTravelId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] w-full max-w-lg p-8 shadow-2xl relative">
                    <div className="absolute top-0 right-0 p-4">
                        <button onClick={() => setPendingTravelId(null)} className="text-slate-500 hover:text-white transition-colors">&times; Close</button>
                    </div>
                    <h3 className="text-2xl font-black font-mono text-emerald-400 tracking-tight uppercase italic mb-2">
                        Initiate Travel
                    </h3>
                    <p className="text-sm text-slate-400 mb-8 max-w-sm">Select transportation method to reach your destination.</p>
                    
                    <div className="space-y-4">
                        <button onClick={() => startTravel(pendingTravelId, 180000, 3)} className="w-full flex justify-between items-center p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all font-mono group text-left">
                            <div>
                                <p className="font-bold text-white group-hover:text-emerald-400 flex items-center gap-2"><span className="text-xl">🚶</span> Walk</p>
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">3 Minutes • Cost: ⚡ 3 Stamina</p>
                            </div>
                            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded">Free</span>
                        </button>
                        
                        <button onClick={() => {
                            if (balance >= taxiPrice) {
                                // Deduct taxiPrice and travel
                                update(ref(db, `game_states/${user.uid}`), { balance: balance - taxiPrice });
                                startTravel(pendingTravelId, 10000, 0);
                            } else {
                                alert('Not enough balance for a taxi.');
                            }
                        }} className="w-full flex justify-between items-center p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-amber-500/10 hover:border-amber-500/30 transition-all font-mono group text-left">
                            <div>
                                <p className="font-bold text-white group-hover:text-amber-400 flex items-center gap-2"><span className="text-xl">🚕</span> Taxi</p>
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">10 Seconds</p>
                            </div>
                            <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded">${taxiPrice.toFixed(2)}</span>
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
}
