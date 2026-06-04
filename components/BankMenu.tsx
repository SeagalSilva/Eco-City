'use client';
import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { db } from '@/lib/firebase';
import { ref, onValue, runTransaction, get, push, update, remove } from 'firebase/database';
import StaffManager from './StaffManager';

interface BankMenuProps {
    user: User;
    sectorId: string;
}

interface BankRequest {
    id: string;
    userId: string;
    type: 'deposit' | 'withdraw' | 'savings_deposit' | 'savings_withdraw' | 'transfer';
    amount: number;
    recipientId?: string;
    timestamp: number;
}

import { useWorkPermissions } from '@/hooks/useWorkPermissions';

export default function BankMenu({ user, sectorId }: BankMenuProps) {
    const [balance, setBalance] = useState<number>(0);
    const [savings, setSavings] = useState<number>(0);
    const [wallet, setWallet] = useState<number>(0);

    const [view, setView] = useState<'menu' | 'deposit' | 'withdraw' | 'transfer' | 'savings' | 'staff'>('menu');
    const [amount, setAmount] = useState<string>('');
    const [recipientId, setRecipientId] = useState<string>('');
    
    // Auth & Employment state
    const { isStaff, isManager } = useWorkPermissions(user, sectorId);
    
    // Setting state
    const [settings, setSettings] = useState({
        openTime: '09:00',
        closeTime: '22:00',
        bonusRate: 1.5,
        minDeposit: 100
    });
    
    const [requests, setRequests] = useState<BankRequest[]>([]);

    useEffect(() => {
        const stateRef = ref(db, `game_states/${user.uid}`);
        const unsubscribe = onValue(stateRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setWallet(data.balance || 0);
                setBalance(data.banks?.[sectorId]?.balance || 0);
                setSavings(data.banks?.[sectorId]?.savings || 0);
            }
        });
        
        const settingsRef = ref(db, `departments/${sectorId}/bankSettings`);
        const unsubSettings = onValue(settingsRef, (snap) => {
             if (snap.exists()) setSettings(snap.val());
        });
        
        const reqRef = ref(db, `bank_requests/${sectorId}`);
        const unsubReq = onValue(reqRef, (snap) => {
            const data = snap.val();
            if (data) {
                setRequests(Object.keys(data).map(k => ({ id: k, ...data[k] } as BankRequest)));
            } else {
                setRequests([]);
            }
        });

        return () => {
            unsubscribe();
            unsubSettings();
            unsubReq();
        };
    }, [user.uid, sectorId]);

    const isBankOpen = () => {
        const now = new Date();
        const utcHour = now.getUTCHours();
        const utcMin = now.getUTCMinutes();
        const current = utcHour + utcMin / 60;
        
        const [oH, oM] = settings.openTime.split(':').map(Number);
        const [cH, cM] = settings.closeTime.split(':').map(Number);
        const open = oH + oM / 60;
        const close = cH + cM / 60;
        
        if (close < open) {
            return current >= open || current <= close;
        }
        return current >= open && current <= close;
    };

    const requestTransaction = async (type: 'deposit' | 'withdraw' | 'savings_deposit' | 'savings_withdraw' | 'transfer') => {
        if (!isBankOpen()) {
            alert('Bank is currently closed!');
            return;
        }
        
        const val = parseFloat(amount);
        if (isNaN(val) || val <= 0) {
            alert('Invalid amount');
            return;
        }
        
        if (type === 'deposit' && val < settings.minDeposit && balance === 0) {
             alert(`Minimum initial deposit is $${settings.minDeposit}`);
             return;
        }
        
        // Ensure player has funds before requesting
        if (type === 'deposit' && wallet < val) { alert('Not enough in wallet'); return; }
        if (type === 'withdraw' && balance < val) { alert('Not enough in checking'); return; }
        if (type === 'savings_deposit' && balance < val) { alert('Not enough in checking'); return; }
        if (type === 'savings_withdraw' && savings < val) { alert('Not enough in savings'); return; }
        if (type === 'transfer') {
             if (balance < val) { alert('Not enough in checking'); return; }
             if (!recipientId.trim()) { alert('Invalid recipient UID'); return; }
             if (recipientId === user.uid) { alert('Cannot transfer to yourself'); return; }
        }

        try {
            const reqRef = ref(db, `bank_requests/${sectorId}`);
            await push(reqRef, {
                userId: user.uid,
                type,
                amount: val,
                recipientId: type === 'transfer' ? recipientId : null,
                timestamp: Date.now()
            });
            alert('Request submitted. Please wait for a teller to approve it.');
            setAmount('');
            setRecipientId('');
            setView('menu');
        } catch (e) {
            console.error(e);
            alert('Request failed');
        }
    };
    
    // Employee actions
    const approveRequest = async (req: BankRequest) => {
         try {
             let success = false;
             
             if (req.type === 'transfer') {
                 // Transfer logic
                 await runTransaction(ref(db, `game_states/${req.userId}`), (state) => {
                     if (state) {
                         const bankBal = state.banks?.[sectorId]?.balance || 0;
                         if (bankBal >= req.amount) {
                             if (!state.banks) state.banks = {};
                             if (!state.banks[sectorId]) state.banks[sectorId] = {};
                             state.banks[sectorId].balance = bankBal - req.amount;
                             success = true;
                         }
                     }
                     return state;
                 });
                 if (success && req.recipientId) {
                      const recipientRef = ref(db, `game_states/${req.recipientId}`);
                      await runTransaction(recipientRef, (state) => {
                         if (state) {
                             if (!state.banks) state.banks = {};
                             if (!state.banks[sectorId]) state.banks[sectorId] = {};
                             state.banks[sectorId].balance = (state.banks[sectorId].balance || 0) + req.amount;
                         }
                         return state;
                     });
                 }
             } else {
                 await runTransaction(ref(db, `game_states/${req.userId}`), (state) => {
                    if (!state) return state;
                    
                    let curWallet = state.balance || 0;
                    if (!state.banks) state.banks = {};
                    if (!state.banks[sectorId]) state.banks[sectorId] = { balance: 0, savings: 0 };
                    
                    let curBankBal = state.banks[sectorId].balance || 0;
                    let curBankSav = state.banks[sectorId].savings || 0;
                    
                    if (req.type === 'deposit') {
                        if (curWallet >= req.amount) {
                            state.balance = curWallet - req.amount;
                            state.banks[sectorId].balance = curBankBal + req.amount;
                            success = true;
                        }
                    } else if (req.type === 'withdraw') {
                        if (curBankBal >= req.amount) {
                            state.balance = curWallet + req.amount;
                            state.banks[sectorId].balance = curBankBal - req.amount;
                            success = true;
                        }
                    } else if (req.type === 'savings_deposit') {
                         if (curBankBal >= req.amount) {
                            state.banks[sectorId].balance = curBankBal - req.amount;
                            state.banks[sectorId].savings = curBankSav + req.amount;
                            success = true;
                        }
                    } else if (req.type === 'savings_withdraw') {
                         if (curBankSav >= req.amount) {
                            state.banks[sectorId].savings = curBankSav - req.amount;
                            state.banks[sectorId].balance = curBankBal + req.amount;
                            success = true;
                        }
                    }
                    
                    return state;
                });
             }
             
             if (success) {
                 await remove(ref(db, `bank_requests/${sectorId}/${req.id}`));
             } else {
                 alert('Transaction could not be completed (insufficient funds on processing).');
             }
         } catch(e) {
             console.error(e);
             alert('Approval failed.');
         }
    };
    
    const denyRequest = async (id: string) => {
         await remove(ref(db, `bank_requests/${sectorId}/${id}`));
    };
    
    // Manager actions
    const saveSettings = async () => {
         await update(ref(db, `departments/${sectorId}/bankSettings`), settings);
         alert('Settings updated!');
    };

    if (view === 'staff' && isStaff) {
         return (
              <div className="bg-black/20 p-8 rounded-3xl border border-white/5 shadow-xl">
                 <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black text-2xl text-cyan-400 uppercase tracking-widest italic">{isManager ? 'Manager Console' : 'Teller Console'}</h3>
                    <button onClick={() => setView('menu')} className="text-slate-400 hover:text-white uppercase font-mono text-xs tracking-widest">Close Default</button>
                 </div>
                 
                 {isManager && (
                     <div className="mb-8 p-6 bg-white/5 border border-white/10 rounded-2xl">
                          <h4 className="font-bold text-white mb-4 uppercase tracking-widest font-mono text-sm">Manager Settings</h4>
                          <div className="grid grid-cols-2 gap-4 mb-4">
                              <div>
                                  <label className="block text-[10px] text-slate-500 uppercase tracking-widest mb-1">Open Time (UTC)</label>
                                  <input type="time" value={settings.openTime} onChange={e => setSettings({...settings, openTime: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded p-2 text-white font-mono" />
                              </div>
                              <div>
                                  <label className="block text-[10px] text-slate-500 uppercase tracking-widest mb-1">Close Time (UTC)</label>
                                  <input type="time" value={settings.closeTime} onChange={e => setSettings({...settings, closeTime: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded p-2 text-white font-mono" />
                              </div>
                              <div>
                                  <label className="block text-[10px] text-slate-500 uppercase tracking-widest mb-1">Savings Bonus (%)</label>
                                  <input type="number" step="0.1" value={settings.bonusRate} onChange={e => setSettings({...settings, bonusRate: parseFloat(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded p-2 text-white font-mono" />
                              </div>
                              <div>
                                  <label className="block text-[10px] text-slate-500 uppercase tracking-widest mb-1">Min. Deposit ($)</label>
                                  <input type="number" value={settings.minDeposit} onChange={e => setSettings({...settings, minDeposit: parseFloat(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded p-2 text-white font-mono" />
                              </div>
                          </div>
                          <button onClick={saveSettings} className="w-full py-2 bg-purple-600/20 text-purple-400 font-mono text-xs uppercase tracking-widest hover:bg-purple-600 hover:text-white rounded transition-colors">Apply Settings</button>
                     </div>
                 )}
                 
                 <h4 className="font-bold text-white mb-4 uppercase tracking-widest font-mono text-sm">Pending Transactions</h4>
                 <div className="space-y-2">
                     {requests.length === 0 && <p className="text-slate-500 font-mono text-xs italic">No pending requests.</p>}
                     {requests.map(req => (
                          <div key={req.id} className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between font-mono text-xs">
                              <div>
                                  <p className="text-white font-bold">{req.type.toUpperCase()} - ${req.amount.toFixed(2)}</p>
                                  <p className="text-slate-500">User: {req.userId.substring(0, 8)}... {req.recipientId && `-> To: ${req.recipientId.substring(0, 8)}...`}</p>
                              </div>
                              <div className="flex gap-2">
                                  <button onClick={() => approveRequest(req)} className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500 hover:text-white transition-colors">Approve</button>
                                  <button onClick={() => denyRequest(req.id)} className="px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500 hover:text-white transition-colors">Deny</button>
                              </div>
                          </div>
                     ))}
                 </div>

                 {isManager && <StaffManager departmentId={sectorId} isManager={isManager} />}
              </div>
         );
    }


    if (view !== 'menu') {
        return (
            <div className="bg-black/20 p-8 rounded-3xl border border-white/5 shadow-xl">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black text-2xl text-cyan-400 uppercase tracking-widest italic">{view}</h3>
                    <button onClick={() => setView('menu')} className="text-slate-400 hover:text-white uppercase font-mono text-xs tracking-widest">Cancel</button>
                </div>
                
                <div className="mb-6 grid grid-cols-2 gap-4 text-xs font-mono">
                    <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                        <p className="text-slate-500 uppercase tracking-widest mb-1">Checking</p>
                        <p className="text-xl text-white font-black">${balance.toFixed(2)}</p>
                    </div>
                    {view.startsWith('savings') ? (
                        <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                            <p className="text-slate-500 uppercase tracking-widest mb-1">Savings</p>
                            <p className="text-xl text-white font-black">${savings.toFixed(2)}</p>
                        </div>
                    ) : (
                        <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                            <p className="text-slate-500 uppercase tracking-widest mb-1">Wallet</p>
                            <p className="text-xl text-white font-black">${wallet.toFixed(2)}</p>
                        </div>
                    )}
                </div>
                
                <div className="space-y-4">
                    {view === 'transfer' && (
                        <div>
                            <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest mb-2">Recipient UID</label>
                            <input 
                                type="text" 
                                value={recipientId} 
                                onChange={(e) => setRecipientId(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none transition-all font-mono"
                                placeholder="Enter Recipient UID"
                            />
                        </div>
                    )}
                    <div>
                        <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest mb-2">Amount</label>
                        <input 
                            type="number" 
                            min="0"
                            step="0.01"
                            value={amount} 
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none transition-all font-mono font-bold text-2xl"
                            placeholder="0.00"
                        />
                    </div>
                    <button 
                        onClick={() => {
                            if (view === 'deposit') requestTransaction('deposit');
                            else if (view === 'withdraw') requestTransaction('withdraw');
                            else if (view === 'savings') requestTransaction('savings_deposit'); // default to deposit to savings
                            else if (view === 'transfer') requestTransaction('transfer');
                        }}
                        className="w-full py-4 bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 rounded-xl font-black font-mono uppercase tracking-widest hover:bg-cyan-500 hover:text-black transition-all shadow-lg"
                    >
                        Confirm {view === 'savings' ? 'Deposit to Savings' : view}
                    </button>
                    {view === 'savings' && (
                        <button 
                            onClick={() => requestTransaction('savings_withdraw')}
                            className="w-full py-4 bg-red-600/10 text-red-400 border border-red-500/30 rounded-xl font-black font-mono uppercase tracking-widest hover:bg-red-500 hover:text-black transition-all shadow-lg mt-4 cursor-pointer"
                        >
                            Withdraw from Savings
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-cyan-900/40 to-black p-6 rounded-3xl border border-cyan-500/20 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <div className="text-6xl">💳</div>
                    </div>
                    <p className="text-[10px] text-cyan-500 font-mono font-black uppercase tracking-widest mb-2">Checking Account</p>
                    <p className="text-4xl font-mono font-black text-white">${balance.toFixed(2)}</p>
                    <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center text-xs font-mono text-slate-400">
                        <span>Available Balance</span>
                        <span className="text-emerald-400">Active</span>
                    </div>
                </div>
                
                <div className="bg-gradient-to-br from-purple-900/40 to-black p-6 rounded-3xl border border-purple-500/20 shadow-xl relative overflow-hidden">
                     <div className="absolute top-0 right-0 p-4 opacity-10">
                        <div className="text-6xl">📈</div>
                    </div>
                    <p className="text-[10px] text-purple-500 font-mono font-black uppercase tracking-widest mb-2">Savings Account</p>
                    <p className="text-4xl font-mono font-black text-white">${savings.toFixed(2)}</p>
                    <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center text-xs font-mono text-slate-400">
                        <span>Interest Yield</span>
                        <span className="text-emerald-400">Active</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <button onClick={() => setView('deposit')} className="p-6 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl hover:bg-cyan-500 hover:text-black transition-all group shadow-lg">
                    <div className="text-3xl mb-3 grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all group-hover:scale-110">📥</div>
                    <p className="font-mono font-bold text-cyan-400 group-hover:text-black uppercase tracking-widest text-xs">Deposit</p>
                </button>
                <button onClick={() => setView('withdraw')} className="p-6 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl hover:bg-cyan-500 hover:text-black transition-all group shadow-lg">
                    <div className="text-3xl mb-3 grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all group-hover:scale-110">📤</div>
                    <p className="font-mono font-bold text-cyan-400 group-hover:text-black uppercase tracking-widest text-xs">Withdraw</p>
                </button>
                <button onClick={() => setView('transfer')} className="p-6 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl hover:bg-cyan-500 hover:text-black transition-all group shadow-lg">
                    <div className="text-3xl mb-3 grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all group-hover:scale-110">💸</div>
                    <p className="font-mono font-bold text-cyan-400 group-hover:text-black uppercase tracking-widest text-xs">Transfer</p>
                </button>
                <button onClick={() => setView('savings')} className="p-6 bg-purple-500/10 border border-purple-500/20 rounded-2xl hover:bg-purple-500 hover:text-white transition-all group shadow-lg">
                    <div className="text-3xl mb-3 grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all group-hover:scale-110">🏦</div>
                    <p className="font-mono font-bold text-purple-400 group-hover:text-white uppercase tracking-widest text-xs">Savings</p>
                </button>
            </div>
            
            {isStaff && (
                <div className="mt-8">
                    <button onClick={() => setView('staff')} className="w-full p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl hover:bg-emerald-500 hover:text-black transition-all font-mono font-bold text-emerald-400 uppercase tracking-widest text-sm flex items-center justify-center gap-2">
                        <span>👔</span> Staff Panel {requests.length > 0 && <span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px] animate-pulse">{requests.length}</span>}
                    </button>
                </div>
            )}
            
            <div className="mt-8 p-4 bg-white/5 rounded-xl border border-white/5 font-mono text-xs flex justify-between items-center">
                <span className="text-slate-500 uppercase tracking-widest">Pocket Wallet</span>
                <span className="text-emerald-400 font-black">${wallet.toFixed(2)}</span>
            </div>
        </div>
    );
}
