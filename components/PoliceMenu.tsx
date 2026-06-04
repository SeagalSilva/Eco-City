'use client';
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue, push, update, get } from 'firebase/database';
import { User } from 'firebase/auth';

import { useWorkPermissions } from '@/hooks/useWorkPermissions';

interface PoliceMenuProps {
    user: User;
    sectorId: string;
}

export default function PoliceMenu({ user, sectorId }: PoliceMenuProps) {
    const { isStaff: isPolice, isAdmin, isManager } = useWorkPermissions(user, sectorId);
    
    // Citizen State
    const [managerDocuments, setManagerDocuments] = useState<any[]>([]);
    const [selectedDocId, setSelectedDocId] = useState('');
    const [citizenRequests, setCitizenRequests] = useState<any[]>([]);
    
    // Police State
    const [pendingRequests, setPendingRequests] = useState<any[]>([]);
    const [activeLogsDialog, setActiveLogsDialog] = useState<any | null>(null);

    useEffect(() => {
        // Load citizen inventory documents
        const invRef = ref(db, `game_states/${user.uid}/inventory`);
        onValue(invRef, (snap) => {
            const inv = snap.val();
            if (inv) {
                const docs = Object.keys(inv)
                    .map(k => ({ id: k, ...inv[k] }))
                    .filter(item => item.type === 'EMPLOYMENT_CONTRACT' && item.isManager);
                setManagerDocuments(docs);
            } else {
                setManagerDocuments([]);
            }
        });

        // Load all log requests
        const reqRef = ref(db, `police_log_requests`);
        onValue(reqRef, (snap) => {
            const reqs = snap.val();
            if (reqs) {
                const list = Object.keys(reqs).map(k => ({ id: k, ...reqs[k] }));
                setPendingRequests(list.filter(r => r.status === 'PENDING'));
                setCitizenRequests(list.filter(r => r.requesterUid === user.uid));
            } else {
                setPendingRequests([]);
                setCitizenRequests([]);
            }
        });

    }, [user.uid, sectorId]);

    const requestLogs = async () => {
        if (!selectedDocId) {
            alert('Please select a valid manager document.');
            return;
        }
        
        const doc = managerDocuments.find(d => d.id === selectedDocId);
        if (!doc) return;

        try {
            await push(ref(db, `police_log_requests`), {
                requesterUid: user.uid,
                requesterName: user.displayName || 'Anonymous',
                departmentId: doc.departmentId,
                departmentName: doc.title,
                status: 'PENDING',
                requestedAt: Date.now()
            });
            alert('Request submitted to the police department!');
            setSelectedDocId('');
        } catch (e: any) {
            alert('Failed to submit request: ' + e.message);
        }
    };

    const provideLogs = async (req: any) => {
        try {
            const logsSnap = await get(ref(db, `sectors/${req.departmentId}/actions`));
            const logsObj = logsSnap.val();
            let logs: any[] = [];
            if (logsObj) {
                const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
                logs = Object.values(logsObj)
                    .filter((l: any) => l.timestamp >= oneDayAgo)
                    .sort((a: any, b: any) => b.timestamp - a.timestamp)
                    .slice(0, 50);
            }

            await update(ref(db, `police_log_requests/${req.id}`), {
                status: 'FULFILLED',
                fulfilledBy: user.displayName || 'Police Officer',
                fulfilledAt: Date.now(),
                logs: logs
            });

            alert('Logs provided to the citizen successfully.');
        } catch (e: any) {
            alert('Error providing logs: ' + e.message);
        }
    };
    
    const showLogs = (req: any) => {
        setActiveLogsDialog(req);
    };

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-black text-blue-400 font-mono uppercase tracking-widest border-b border-blue-500/20 pb-4 mb-6">
                Police Department Services
            </h2>

            {/* Citizen Request Area */}
            <div className="p-6 bg-white/5 border border-white/5 rounded-3xl space-y-4">
                <h3 className="font-bold text-white font-mono uppercase text-sm">Request Company Logs</h3>
                <p className="text-xs text-slate-400">
                    As a company manager or owner, you can request the police to investigate and provide the last 24h action logs of your company.
                </p>
                <div className="flex gap-4">
                    <select
                        value={selectedDocId}
                        onChange={e => setSelectedDocId(e.target.value)}
                        className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-xs text-white outline-none font-mono focus:border-blue-500"
                    >
                        <option value="">-- Select Manager Document --</option>
                        {managerDocuments.map(doc => (
                            <option key={doc.id} value={doc.id}>{doc.name}</option>
                        ))}
                    </select>
                    <button 
                        onClick={requestLogs}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-bold uppercase rounded-xl transition-colors"
                    >
                        Request
                    </button>
                </div>
                
                {citizenRequests.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-white/5 space-y-3">
                        <h4 className="text-xs font-bold text-slate-300 font-mono">My Requests</h4>
                        {citizenRequests.map(req => (
                            <div key={req.id} className="p-3 bg-black/30 rounded-xl border border-white/5 flex justify-between items-center text-xs font-mono">
                                <div>
                                    <p className="text-slate-300">Department: <strong className="text-white">{req.departmentName}</strong></p>
                                    <p className="text-[10px] text-slate-500">{new Date(req.requestedAt).toLocaleString()}</p>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className={`px-2 py-1 rounded font-bold uppercase tracking-wider text-[9px] ${req.status === 'PENDING' ? 'bg-amber-500/20 text-amber-500' : 'bg-green-500/20 text-green-500'}`}>
                                        {req.status}
                                    </span>
                                    {req.status === 'FULFILLED' && (
                                        <button onClick={() => showLogs(req)} className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded uppercase text-[10px]">
                                            View Logs
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Police Officer Terminal */}
            {(isPolice || isAdmin) && (
                <div className="p-6 bg-blue-500/10 border border-blue-500/20 rounded-3xl space-y-4">
                    <h3 className="font-bold text-blue-400 font-mono uppercase text-sm flex items-center gap-2">
                        <span>🛡️</span> Police Terminal
                    </h3>
                    <p className="text-xs text-blue-300/70">Process citizen log requests. As an authorized officer, you have access to sector action logs.</p>
                    
                    <div className="space-y-3 pt-2">
                        {pendingRequests.length === 0 && <p className="text-xs italic text-blue-400/50 font-mono">No pending requests.</p>}
                        {pendingRequests.map(req => (
                            <div key={req.id} className="p-4 bg-black/40 border border-blue-500/10 rounded-xl flex justify-between items-center font-mono">
                                <div className="text-xs">
                                    <p className="text-blue-300">Requester: <strong className="text-white">{req.requesterName}</strong></p>
                                    <p className="text-slate-400">Sector: {req.departmentName || req.departmentId}</p>
                                </div>
                                <button 
                                    onClick={() => provideLogs(req)}
                                    className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500 text-blue-400 hover:text-white transition-colors rounded-lg text-xs font-bold uppercase"
                                >
                                    Approve & Provide Logs
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Logs Viewer Modal */}
            {activeLogsDialog && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-blue-500/30 p-6 rounded-3xl w-full max-w-2xl shadow-2xl relative max-h-[80vh] flex flex-col">
                        <button onClick={() => setActiveLogsDialog(null)} className="absolute top-4 right-4 text-slate-500 hover:text-white">✕</button>
                        <h3 className="text-lg font-black text-blue-400 font-mono uppercase tracking-widest mb-2">Sector Activity Logs</h3>
                        <p className="text-xs text-slate-400 font-mono mb-4">Provided by: {activeLogsDialog.fulfilledBy} on {new Date(activeLogsDialog.fulfilledAt).toLocaleString()}</p>
                        
                        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                            {!activeLogsDialog.logs || activeLogsDialog.logs.length === 0 ? (
                                <p className="text-xs text-slate-500 italic font-mono p-4 text-center">No actions logged in the last 24 hours.</p>
                            ) : (
                                activeLogsDialog.logs.map((log: any, idx: number) => (
                                    <div key={idx} className="p-3 bg-black/50 rounded-xl border border-white/5 font-mono text-[10px]">
                                        <div className="flex justify-between text-slate-500 mb-1">
                                            <span>{new Date(log.timestamp).toLocaleString()}</span>
                                            <span className="text-blue-400">UID: {log.uid?.slice(0,8)}</span>
                                        </div>
                                        <p className="text-white">User <strong className="text-emerald-400">{log.employeeName}</strong> ({log.jobTitle}): {log.actionDesc}</p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
