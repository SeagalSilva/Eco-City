'use client';
import { useState, useEffect } from 'react';
import { ref, onValue, update, runTransaction } from 'firebase/database';
import { db, auth, handleDatabaseError, OperationType } from '@/lib/firebase';

interface Job {
    id: string;
    title: string;
    departmentId: string;
    pay: number;
    requirements?: string;
    tasks?: string[];
    shiftDuration?: number;
    maxPositions?: number;
    isManager?: boolean;
}

interface Department {
    id: string;
    name: string;
    type?: string;
}

interface UserWorkState {
    activeJobId?: string;
    tasksCompletedToday?: number;
    lastPayClaimDate?: string;
    balance?: number;
    lastCompletedAdToken?: string;
}

interface TaskTag {
    id: string;
    label: string;
    type?: string;
    targetValue?: number;
    adLink?: string;
    confirmationLink?: string;
}

export default function WorkView({ district, onBack }: { district: string | null; onBack: () => void }) {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [taskTags, setTaskTags] = useState<TaskTag[]>([]);
    const [userWorkState, setUserWorkState] = useState<UserWorkState | null>(null);
    const [activeEmployeesCount, setActiveEmployeesCount] = useState<Record<string, number>>({});
    const [isWorking, setIsWorking] = useState(false);
    const [workProgress, setWorkProgress] = useState(0);
    const [adConfirmationInput, setAdConfirmationInput] = useState('');
    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [currentProjects, setCurrentProjects] = useState<any[]>([]);

    const authUser = auth.currentUser;

    const [isResigning, setIsResigning] = useState(false);

    useEffect(() => {
        const unsubJobs = onValue(ref(db, 'jobs'), (snapshot) => {
            const data = snapshot.val();
            setJobs(data ? Object.keys(data).map(key => ({ id: key, ...data[key] } as Job)) : []);
        });
        const unsubDeps = onValue(ref(db, 'departments'), (snapshot) => {
            const data = snapshot.val();
            setDepartments(data ? Object.keys(data).map(key => ({ id: key, ...data[key] } as Department)) : []);
        });
        const unsubTags = onValue(ref(db, 'task_tags'), (snapshot) => {
            const data = snapshot.val();
            setTaskTags(data ? Object.keys(data).map(key => ({ id: key, ...data[key] } as TaskTag)) : []);
        });

        // Compute how many people are in each job globally
        const unsubAllWork = onValue(ref(db, 'game_states'), (snapshot) => {
            const data = snapshot.val();
            const counts: Record<string, number> = {};
            if (data) {
                Object.values(data).forEach((state: any) => {
                    if (state.activeJobId) {
                        counts[state.activeJobId] = (counts[state.activeJobId] || 0) + 1;
                    }
                });
            }
            setActiveEmployeesCount(counts);
        });

        const unsubProjects = onValue(ref(db, 'construction_projects'), (snapshot) => {
            const data = snapshot.val();
            setCurrentProjects(data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : []);
        });

        if (authUser) {
            const unsubWork = onValue(ref(db, `game_states/${authUser.uid}`), (snapshot) => {
                const data = snapshot.val();
                if (data) {
                    setUserWorkState({
                        activeJobId: data.activeJobId,
                        tasksCompletedToday: data.tasksCompletedToday || 0,
                        lastPayClaimDate: data.lastPayClaimDate,
                        balance: data.balance || 0
                    });
                } else {
                    setUserWorkState({ tasksCompletedToday: 0 });
                }
            });
            return () => { unsubJobs(); unsubDeps(); unsubWork(); unsubTags(); unsubAllWork(); unsubProjects(); };
        }

        return () => { unsubJobs(); unsubDeps(); unsubTags(); unsubAllWork(); unsubProjects(); };
    }, [authUser]);

    const activeJob = jobs.find(j => j.id === userWorkState?.activeJobId);
    const activeJobDept = departments.find(d => d.id === activeJob?.departmentId);
    const isConstructionCompany = activeJobDept?.type === 'CONSTRUCTION_COMPANY' || activeJobDept?.type === 'CONSTRUCTION';
    const companyProjects = currentProjects.filter(p => !p.deedClaimed && p.hiredCompanySectorId === activeJob?.departmentId && p.status === 'UNDER_CONSTRUCTION');

    const activeTaskIdx = userWorkState?.tasksCompletedToday || 0;
    const activeTaskStr = activeJob?.tasks?.[activeTaskIdx] || '';
    const activeProtocolMatch = activeTaskStr.match(/\[(.*?)\]/);
    const activeProtocolLabel = activeProtocolMatch ? activeProtocolMatch[1] : null;
    const activeTag = taskTags.find(t => t.label === activeProtocolLabel);

    const applyForJob = async (job: Job) => {
        if (!authUser) return;
        if (userWorkState?.activeJobId) {
            alert('You already have an active job. Resign first to apply for a new one.');
            return;
        }

        const currentEmployees = activeEmployeesCount[job.id] || 0;
        const maxCapacity = job.maxPositions || 1;
        if (currentEmployees >= maxCapacity) {
            alert('This position is currently full. No vacancies available.');
            return;
        }
        
        try {
            await update(ref(db, `game_states/${authUser.uid}`), {
                activeJobId: job.id,
                tasksCompletedToday: 0
            });
            alert(`You are now working as ${job.title}!`);
        } catch (e: any) {
            handleDatabaseError(e, OperationType.UPDATE, `game_states/${authUser.uid}`);
        }
    };

    const tryResign = () => setIsResigning(true);

    const resign = async () => {
        if (!authUser) return;
        try {
            await update(ref(db, `game_states/${authUser.uid}`), {
                activeJobId: null,
                tasksCompletedToday: 0
            });
            setIsResigning(false);
        } catch (e: any) {
            handleDatabaseError(e, OperationType.UPDATE, `game_states/${authUser.uid}`);
        }
    };

    const performWork = async (currentTag?: TaskTag) => {
        if (!activeJob || isWorking || !authUser) return;
        
        setIsWorking(true);
        setWorkProgress(0);
        
        let duration = (activeJob.shiftDuration || 30) * 1000;
        if (currentTag && currentTag.type === 'WAIT') {
            // override duration to wait for the configured amount of minutes
            duration = (currentTag.targetValue || 1) * 60 * 1000;
        }
        
        const interval = 100;
        const steps = duration / interval;
        let currentStep = 0;

        const timer = setInterval(() => {
            currentStep++;
            setWorkProgress(Math.min(100, (currentStep / steps) * 100));
            if (currentStep >= steps) {
                clearInterval(timer);
                completeTask();
            }
        }, interval);
    };

    const completeTask = async () => {
        if (!authUser || !activeJob) return;
        
        try {
            const newCount = (userWorkState?.tasksCompletedToday || 0) + 1;
            await update(ref(db, `game_states/${authUser.uid}`), {
                tasksCompletedToday: newCount
            });

            // If working in construction and selected a pending project, progress it!
            if (isConstructionCompany && selectedProjectId) {
                const projRef = ref(db, `construction_projects/${selectedProjectId}`);
                await runTransaction(projRef, (proj) => {
                    if (proj) {
                        const nextProg = Math.min(100, (proj.progress || 0) + 10);
                        proj.progress = nextProg;
                        if (nextProg === 100) {
                            proj.status = 'COMPLETED';
                        }
                    }
                    return proj;
                });
                alert('Missão Concluída! Adicionou +10% de progresso à empreitada civil contratada.');
            } else {
                alert('Task completed successfully!');
            }

            setIsWorking(false);
            setWorkProgress(0);
        } catch (e: any) {
            handleDatabaseError(e, OperationType.UPDATE, `game_states/${authUser.uid}`);
            setIsWorking(false);
        }
    };

    const claimSalary = async () => {
        if (!authUser || !activeJob) return;

        const requiredTasks = activeJob.tasks?.length || 1;
        if ((userWorkState?.tasksCompletedToday || 0) < requiredTasks) {
            alert(`You need to complete all tasks (${requiredTasks}) before claiming your salary.`);
            return;
        }

        try {
            await runTransaction(ref(db, `game_states/${authUser.uid}`), (state) => {
                if (state) {
                    state.balance = (state.balance || 0) + activeJob.pay;
                    state.tasksCompletedToday = 0; 
                }
                return state;
            });
            alert(`Payday! You received $${activeJob.pay.toFixed(2)}`);
        } catch (e: any) {
            handleDatabaseError(e, OperationType.UPDATE, `game_states/${authUser.uid}`);
        }
    };

    // Filter jobs by department ID (district prop now passes department ID)
    const filteredJobs = district 
        ? jobs.filter(job => job.departmentId === district)
        : jobs;

    return (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-10 shadow-2xl text-slate-100">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                     <button onClick={onBack} className="text-emerald-400 mb-2 flex items-center gap-2 hover:translate-x-1 transition-transform font-mono text-sm uppercase tracking-widest">&larr; Return to Sector</button>
                     <h2 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 font-mono tracking-tighter uppercase whitespace-pre-wrap">Employment Hub</h2>
                </div>
                
                <div className="flex items-center gap-2 px-4 py-2 bg-black/30 border border-white/5 rounded-2xl">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">System Online</span>
                </div>
            </div>

            {activeJob ? (
                /* ACTIVE JOB DASHBOARD */
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="p-8 bg-emerald-500/5 border border-emerald-500/20 rounded-[2.5rem] relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-6 flex gap-2">
                           <button onClick={tryResign} className="px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all font-mono font-black text-[10px] uppercase tracking-widest">Resign</button>
                        </div>
                        
                        {isResigning && (
                            <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm rounded-[2.5rem]">
                                <div className="text-center">
                                    <h4 className="text-xl font-black italic text-white uppercase tracking-tighter mb-4">Confirm Resignation?</h4>
                                    <p className="text-slate-400 font-mono text-sm mb-6 max-w-[250px] mx-auto">You will lose today&apos;s progress and your current position.</p>
                                    <div className="flex gap-4 justify-center">
                                        <button onClick={() => setIsResigning(false)} className="px-6 py-2 border border-white/10 text-slate-400 rounded-xl hover:bg-white/5 transition-all font-mono font-bold text-xs uppercase">Cancel</button>
                                        <button onClick={resign} className="px-6 py-2 bg-red-600 text-white rounded-xl hover:bg-red-500 transition-all font-mono font-black text-xs uppercase tracking-widest shadow-lg shadow-red-500/20">Resign</button>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        <div className="flex flex-col md:flex-row gap-8 items-start md:items-center mb-8">
                            <div className="text-6xl bg-white/5 p-6 rounded-[2rem] shadow-xl">🛠️</div>
                            <div>
                                <p className="text-xs text-emerald-500 font-mono font-black uppercase tracking-[0.2em] mb-1">Contracted Personnel</p>
                                <h3 className="text-4xl font-black italic tracking-tighter uppercase text-white">{activeJob.title}</h3>
                                <p className="text-slate-400 font-medium">Stationed at: <span className="text-slate-100">{departments.find(d => d.id === activeJob.departmentId)?.name}</span></p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="p-6 bg-black/40 rounded-3xl border border-white/5">
                                <p className="text-[10px] text-slate-500 uppercase font-black font-mono tracking-widest mb-2">Daily Revenue</p>
                                <p className="text-3xl font-mono font-black text-emerald-400">${activeJob.pay.toFixed(2)}</p>
                            </div>
                            <div className="p-6 bg-black/40 rounded-3xl border border-white/5">
                                <p className="text-[10px] text-slate-500 uppercase font-black font-mono tracking-widest mb-2">Missions</p>
                                <p className="text-3xl font-mono font-black text-emerald-400">{userWorkState?.tasksCompletedToday || 0} / {activeJob.tasks?.length || 1}</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Tasks List */}
                        <div className="space-y-6">
                            <h4 className="text-xl font-black font-mono uppercase italic text-slate-100 flex items-center gap-2">
                                <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                                Assigned Objectives
                            </h4>
                            <div className="space-y-3">
                                {(activeJob.tasks || ['Complete standard shift']).map((task, idx) => {
                                    // Detect protocol in brackets like [ADMIN-SYNC]
                                    const protocolMatch = task.match(/\[(.*?)\]/);
                                    const protocolLabel = protocolMatch ? protocolMatch[1] : null;
                                    const tag = taskTags.find(t => t.label === protocolLabel);
                                    const isCompleted = idx < (userWorkState?.tasksCompletedToday || 0);

                                    return (
                                        <div key={idx} className={`p-5 rounded-2xl border transition-all duration-500 flex flex-col gap-2 ${isCompleted ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-white/5 border-white/10 text-slate-400'}`}>
                                            <div className="flex items-center gap-4">
                                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono font-black text-[10px] ${isCompleted ? 'bg-emerald-500 text-black' : 'bg-white/10 text-white'}`}>
                                                    {idx + 1}
                                                </div>
                                                <p className="flex-1 font-medium italic tracking-tight">{task.replace(/\[.*?\]/, '').trim() || 'General Mission'}</p>
                                                {isCompleted && <span>✓</span>}
                                            </div>
                                            {tag && (
                                                <div className="ml-10 flex items-center gap-2">
                                                    <span className="px-2 py-0.5 bg-pink-500/20 text-pink-400 text-[8px] font-mono font-black rounded uppercase tracking-widest border border-pink-500/20">
                                                        Protocol: {tag.label}
                                                    </span>
                                                    <span className="text-[9px] font-mono text-slate-500 uppercase italic">
                                                        Goal: {tag.targetValue || 1} units
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Working Area */}
                        <div className="p-10 bg-black/40 border border-white/5 rounded-[2.5rem] flex flex-col items-center justify-center gap-10 text-center relative overflow-hidden group min-h-[400px]">
                           {isWorking ? (
                               <>
                                   <div className="relative">
                                       <svg className="w-40 h-40 transform -rotate-90">
                                           <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-white/5" />
                                           <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={440} strokeDashoffset={440 - (440 * workProgress) / 100} className="text-emerald-500 transition-all duration-100 ease-linear shadow-[0_0_20px_rgba(16,185,129,0.5)]" />
                                       </svg>
                                       <div className="absolute inset-0 flex items-center justify-center">
                                           <span className="text-4xl animate-pulse">⚡</span>
                                       </div>
                                   </div>
                                   <div>
                                       <p className="text-lg font-black font-mono text-emerald-400 animate-pulse tracking-widest uppercase">Processing Mission...</p>
                                       <p className="text-xs text-slate-500 font-mono mt-2 tracking-tighter italic">Energy output at 100% capacity</p>
                                   </div>
                               </>
                           ) : (
                               <>
                                   <div className="text-8xl group-hover:scale-110 transition-transform duration-700">🕹️</div>
                                   <div className="space-y-2">
                                       <p className="text-slate-400 font-mono text-sm max-w-[200px] italic">Ready to commence the next objective in the grid.</p>
                                   </div>

                                   {isConstructionCompany && (
                                       <div className="w-full max-w-xs space-y-2 p-4 bg-purple-500/5 border border-purple-500/20 rounded-2xl text-left mx-auto">
                                           <p className="text-[10px] font-mono text-purple-400 font-black uppercase tracking-widest text-center">
                                               🏗️ Selecionar Obra a Progredir
                                           </p>
                                           <select
                                               value={selectedProjectId}
                                               onChange={(e) => setSelectedProjectId(e.target.value)}
                                               className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-purple-500 font-mono outline-none"
                                           >
                                               <option value="">-- Trabalho Interno (Sem Obra) --</option>
                                               {companyProjects.map(proj => (
                                                   <option key={proj.id} value={proj.id} className="bg-slate-950 text-white font-mono text-xs">
                                                       {proj.name} ({proj.progress}%)
                                                   </option>
                                               ))}
                                           </select>
                                           <p className="text-[9px] text-slate-500 leading-normal text-center italic">
                                               Garante o envio de esforços (+10% por missão) para concluir a infraestrutura.
                                           </p>
                                       </div>
                                   )}

                                   {(userWorkState?.tasksCompletedToday || 0) < (activeJob.tasks?.length || 1) ? (
                                       activeTag?.type === 'WATCH_ADS' ? (
                                           <div className="w-full space-y-4">
                                               <button 
                                                   onClick={() => {
                                                       if(activeTag.adLink) window.open(activeTag.adLink, '_blank');
                                                       // If no confirmation link is required, we can just complete it
                                                       if (!activeTag.confirmationLink) completeTask();
                                                   }}
                                                   className="w-full py-5 bg-pink-600 text-black rounded-[1.5rem] font-black font-mono uppercase tracking-[0.2em] hover:bg-pink-400 transition-all shadow-lg shadow-pink-500/20 active:scale-95 text-lg italic animate-bounce"
                                               >
                                                   Watch Ad &rarr;
                                               </button>
                                               {activeTag.confirmationLink && (
                                                    <div className="p-4 bg-black/40 rounded-2xl border border-pink-500/30">
                                                        <p className="text-[10px] text-pink-400 uppercase tracking-widest font-mono mb-2">Awaiting Verification</p>
                                                        <p className="text-xs text-slate-400 font-mono mb-4">Complete the ad to automatically verify this mission.</p>
                                                        {userWorkState?.lastCompletedAdToken && activeTag.confirmationLink.includes(userWorkState.lastCompletedAdToken) ? (
                                                            <button 
                                                                onClick={() => {
                                                                     completeTask();
                                                                     // Clear token to allow repeating tasks
                                                                     update(ref(db, `game_states/${authUser?.uid}`), { lastCompletedAdToken: null });
                                                                }}
                                                                className="w-full py-3 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-xl font-black font-mono uppercase tracking-widest hover:bg-emerald-500 hover:text-black transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] animate-pulse"
                                                            >
                                                                Confirm Mission Complete
                                                            </button>
                                                        ) : (
                                                            <button 
                                                                disabled
                                                                className="w-full py-3 bg-white/5 text-slate-500 rounded-xl font-black font-mono uppercase tracking-widest cursor-not-allowed"
                                                            >
                                                                Waiting for Ad Finish...
                                                            </button>
                                                        )}
                                                    </div>
                                               )}
                                           </div>
                                       ) : (
                                           <button 
                                               onClick={() => performWork(activeTag)}
                                               className="w-full py-5 bg-emerald-600 text-black rounded-[1.5rem] font-black font-mono uppercase tracking-[0.2em] hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 text-lg italic"
                                           >
                                               {activeTag?.type === 'WAIT' ? `Wait ${activeTag.targetValue} Min` : 'Initiate Work'}
                                           </button>
                                       )
                                   ) : (
                                       <button 
                                           onClick={claimSalary}
                                           className="w-full py-5 bg-blue-600 text-white rounded-[1.5rem] font-black font-mono uppercase tracking-[0.2em] hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/40 active:scale-95 text-lg italic animate-bounce"
                                       >
                                           Claim Salary (${activeJob.pay.toFixed(2)})
                                       </button>
                                   )}
                               </>
                           )}
                        </div>
                    </div>
                </div>
            ) : (
                /* JOB DISCOVERY LISTING */
                <>
                    {filteredJobs.length === 0 ? (
                        <div className="p-20 text-center border-2 border-dashed border-white/5 rounded-3xl bg-black/20">
                            <div className="text-5xl mb-4 opacity-20">🚫</div>
                            <p className="text-slate-500 font-medium italic">No employment opportunities detected in this sector.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredJobs.map(job => {
                                const deptName = departments.find(d => d.id === job.departmentId)?.name || 'Generic sector';
                                const activeCount = activeEmployeesCount[job.id] || 0;
                                const maxCapacity = job.maxPositions || 1;
                                const isFull = activeCount >= maxCapacity;

                                return (
                                    <div 
                                        key={job.id} 
                                        className="relative group p-8 bg-black/40 border border-white/5 rounded-3xl hover:border-emerald-500 transition-all duration-500 text-left overflow-hidden shadow-xl"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/0 via-emerald-500/0 to-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                                        
                                        <div className="flex justify-between items-start mb-2">
                                            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-[0.2em] font-black">{deptName}</p>
                                            {job.isManager && (
                                                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-500 text-[8px] font-mono font-black rounded uppercase tracking-widest border border-amber-500/20">
                                                    Manager
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="font-black text-2xl mb-4 text-slate-200 group-hover:text-white transition-colors leading-tight italic tracking-tighter uppercase">{job.title}</h3>
                                        
                                        <div className="space-y-3 mb-8">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs">👥</span>
                                                <p className={`text-[10px] font-mono font-bold ${isFull ? 'text-red-400' : 'text-emerald-400'}`}>
                                                    Availability: {activeCount} / {maxCapacity}
                                                </p>
                                            </div>
                                            {job.requirements && (
                                                <div className="flex items-start gap-2">
                                                    <span className="text-xs">📜</span>
                                                    <p className="text-[10px] text-slate-400 font-mono italic leading-tight">{job.requirements}</p>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs">🎯</span>
                                                <p className="text-[10px] text-slate-500 font-mono">Missions: {job.tasks?.length || 1}</p>
                                            </div>
                                        </div>

                                        <div className="flex justify-between items-end relative z-10">
                                            <div>
                                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Standard Pay</p>
                                                <p className="text-3xl font-mono font-black text-emerald-400 tracking-tighter tabular-nums">${job.pay.toFixed(2)}</p>
                                            </div>
                                            <button 
                                                onClick={() => !isFull && applyForJob(job)}
                                                className={`${isFull ? 'bg-red-500/10 text-red-500 border-red-500/20 cursor-not-allowed opacity-50' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-black border-emerald-500/20 shadow-emerald-500/10 shadow-lg'} text-[10px] font-mono px-4 py-2 rounded-xl font-black border transition-all uppercase tracking-widest`}
                                                disabled={isFull}
                                            >
                                                {isFull ? 'Full' : 'Apply'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
