'use client';
import ConfirmationModal from './ConfirmationModal';
import BaseModal from './BaseModal';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import { User } from 'firebase/auth';
import { db, handleDatabaseError, OperationType } from '@/lib/firebase';
import { ref, onValue, push, remove, update, set } from 'firebase/database';

interface Department {
    id: string;
    name: string;
    description: string;
    icon?: string;
    type?: string;
    roomsBasic?: number;
    roomsPremium?: number;
    roomsPenthouse?: number;
}

interface Job {
    id: string;
    title: string;
    departmentId: string;
    pay: number;
    requirements?: string;
    tasks?: string[];
    shiftDuration?: number; // in seconds
    maxPositions?: number;
    isManager?: boolean;
}

interface TaskTag {
    id: string;
    label: string;
    type?: string;
    targetValue?: number;
    color?: string;
    adLink?: string;
    confirmationLink?: string;
}

interface RoleAssignment {
    uid: string;
    role: string;
    departmentId?: string;
}

interface UserData {
    uid: string;
    email: string;
    displayName: string;
}

const generateProtocolToken = () => {
    return Math.random().toString(36).substring(2, 11);
};

export default function AdminPanel({ user, onBack }: { user: User; onBack: () => void }) {
    const [departments, setDepartments] = useState<Department[]>([]);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [roles, setRoles] = useState<RoleAssignment[]>([]);
    const [users, setUsers] = useState<UserData[]>([]);
    const [taskTags, setTaskTags] = useState<TaskTag[]>([]);
    const [systemSettings, setSystemSettings] = useState({ taxiPrice: 15 });
    const [levels, setLevels] = useState<{ id: string, level: number, xpRequired: number, reward: string }[]>([]);
    const [activeTab, setActiveTab] = useState('settings');
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [currentConfirm, setCurrentConfirm] = useState<{title: string, message: string, onConfirm: () => void} | null>(null);
    
    // Protocol Modal State
    const [isProtocolModalOpen, setIsProtocolModalOpen] = useState(false);
    const [editingProtocol, setEditingProtocol] = useState<TaskTag | null>(null);
    const [protocolLabel, setProtocolLabel] = useState('');
    const [protocolType, setProtocolType] = useState('WATCH_ADS');
    const [protocolGoal, setProtocolGoal] = useState(1);
    const [protocolAdLink, setProtocolAdLink] = useState('');
    const [protocolConfirmationLink, setProtocolConfirmationLink] = useState('');

    const PROTOCOL_TYPES = [
        { id: 'WAIT', label: 'Wait (Minutes)' },
        { id: 'WATCH_ADS', label: 'Watch Ads' }
    ];
    
    // Sector Modal State
    const [isSectorModalOpen, setIsSectorModalOpen] = useState(false);
    const [editingSector, setEditingSector] = useState<Department | null>(null);
    const [sectorName, setSectorName] = useState('');
    const [sectorIcon, setSectorIcon] = useState('🏢');
    const [sectorDescription, setSectorDescription] = useState('');
    const [sectorType, setSectorType] = useState('BANK');
    const [roomsBasic, setRoomsBasic] = useState(30);
    const [roomsPremium, setRoomsPremium] = useState(30);
    const [roomsPenthouse, setRoomsPenthouse] = useState(30);
    const [govtSubtype, setGovtSubtype] = useState('ADMINISTRATION');
    const [icons8Query, setIcons8Query] = useState('');
    const [icons8Results, setIcons8Results] = useState<string[]>([]);

    const SECTOR_TYPES = [
        { id: 'BANK', label: 'Bank' },
        { id: 'APARTMENT', label: 'Apartment' },
        { id: 'POLICE', label: 'Police' },
        { id: 'FIREFIGHTER', label: 'Firefighter' },
        { id: 'RESTAURANT', label: 'Restaurant' },
        { id: 'FACTORY', label: 'Factory' },
        { id: 'GOVERNMENT', label: 'Government' },
        { id: 'COURT', label: 'Court' },
        { id: 'MARKET', label: 'Market' },
        { id: 'CONSTRUCTION_COMPANY', label: 'Construction Company' }
    ];

    // Job Modal State
    const [isJobModalOpen, setIsJobModalOpen] = useState(false);
    const [editingJob, setEditingJob] = useState<Job | null>(null);
    const [jobTitle, setJobTitle] = useState('');
    const [jobPay, setJobPay] = useState(0);
    const [jobSectorId, setJobSectorId] = useState('');
    const [jobRequirements, setJobRequirements] = useState('');
    const [jobTasks, setJobTasks] = useState('');
    const [jobDuration, setJobDuration] = useState(60);
    const [jobMaxPositions, setJobMaxPositions] = useState(1);
    const [jobIsManager, setJobIsManager] = useState(false);

    useEffect(() => {
        const unsubDeps = onValue(ref(db, 'departments'), (snapshot) => {
            const data = snapshot.val();
            setDepartments(data ? Object.keys(data).map(key => ({ id: key, ...data[key] } as Department)) : []);
        });
        const unsubJobs = onValue(ref(db, 'jobs'), (snapshot) => {
            const data = snapshot.val();
            setJobs(data ? Object.keys(data).map(key => ({ id: key, ...data[key] } as Job)) : []);
        });
        const unsubRoles = onValue(ref(db, 'roles'), (snapshot) => {
            const data = snapshot.val();
            setRoles(data ? Object.keys(data).map(key => ({ uid: key, ...data[key] } as RoleAssignment)) : []);
        });
        const unsubUsers = onValue(ref(db, 'users'), (snapshot) => {
            const data = snapshot.val();
            setUsers(data ? Object.keys(data).map(key => ({ uid: key, ...data[key] } as UserData)) : []);
        });
        const unsubTags = onValue(ref(db, 'task_tags'), (snapshot) => {
            const data = snapshot.val();
            setTaskTags(data ? Object.keys(data).map(key => ({ id: key, ...data[key] } as TaskTag)) : []);
        });
        const unsubSettings = onValue(ref(db, 'system_settings'), (snapshot) => {
             const data = snapshot.val();
             if (data) setSystemSettings({ taxiPrice: data.taxiPrice ?? 15 });
        });
        const unsubLevels = onValue(ref(db, 'levels'), (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setLevels(Object.keys(data).map(key => ({ id: key, ...data[key] } as any)).sort((a,b) => a.level - b.level));
            } else {
                setLevels([]);
            }
        });
        return () => { unsubDeps(); unsubJobs(); unsubRoles(); unsubUsers(); unsubTags(); unsubSettings(); unsubLevels(); };
    }, []);

    const addLevel = async () => {
        const level = levels.length + 1;
        await push(ref(db, 'levels'), { level, xpRequired: level * 100, reward: '' });
    };

    const updateLevel = async (id: string, updates: any) => {
        await update(ref(db, `levels/${id}`), updates);
    };

    const removeLevel = async (id: string) => {
        await remove(ref(db, `levels/${id}`));
    };

    const openAddProtocol = () => {
        setEditingProtocol(null);
        setProtocolLabel('');
        setProtocolType('WATCH_ADS');
        setProtocolGoal(1);
        setProtocolAdLink('');
        // Generate a random confirmation link for the ad provider to call or redirect to
        const token = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36);
        setProtocolConfirmationLink(typeof window !== 'undefined' ? `${window.location.origin}/verify?token=${token}` : '');
        setIsProtocolModalOpen(true);
    };

    const openEditProtocol = (tag: TaskTag) => {
        setEditingProtocol(tag);
        setProtocolLabel(tag.label);
        setProtocolType(tag.type || 'WATCH_ADS');
        setProtocolGoal(tag.targetValue || 1);
        setProtocolAdLink(tag.adLink || '');
        const token = generateProtocolToken();
        setProtocolConfirmationLink(tag.confirmationLink || (typeof window !== 'undefined' ? `${window.location.origin}/verify?token=${token}` : ''));
        setIsProtocolModalOpen(true);
    };

    const saveProtocol = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!protocolLabel) return;

        const tagData = {
            label: protocolLabel,
            type: protocolType,
            targetValue: Number(protocolGoal),
            adLink: protocolType === 'WATCH_ADS' ? protocolAdLink : null,
            confirmationLink: protocolType === 'WATCH_ADS' ? protocolConfirmationLink : null,
            updatedAt: new Date().toISOString()
        };

        try {
            if (editingProtocol) {
                await update(ref(db, `task_tags/${editingProtocol.id}`), tagData);
                alert('Protocol updated successfully!');
            } else {
                await push(ref(db, 'task_tags'), { ...tagData, createdAt: new Date().toISOString() });
                alert('Protocol added successfully!');
            }
            setIsProtocolModalOpen(false);
        } catch (e: any) {
            handleDatabaseError(e, editingProtocol ? OperationType.UPDATE : OperationType.CREATE, 'task_tags');
            alert('Error saving protocol: ' + e.message);
        }
    };

    const removeTaskTag = async (id: string) => {
        triggerConfirmation('Remove Protocol', 'Remove this task tag?', async () => {
            await remove(ref(db, `task_tags/${id}`));
        });
    };

    const triggerConfirmation = (title: string, message: string, onConfirm: () => void) => {
        setCurrentConfirm({title, message, onConfirm});
        setIsConfirmOpen(true);
    }

    const openAddSector = () => {
        setEditingSector(null);
        setSectorName('');
        setSectorIcon('🏢');
        setSectorDescription('');
        setSectorType('BANK');
        setRoomsBasic(30);
        setRoomsPremium(30);
        setRoomsPenthouse(30);
        setIsSectorModalOpen(true);
    };

    const openEditSector = (dept: Department) => {
        setEditingSector(dept);
        setSectorName(dept.name);
        setSectorIcon(dept.icon || '🏢');
        setSectorDescription(dept.description);
        setSectorType(dept.type || 'BANK');
        setRoomsBasic(dept.roomsBasic || 30);
        setRoomsPremium(dept.roomsPremium || 30);
        setRoomsPenthouse(dept.roomsPenthouse || 30);
        setIsSectorModalOpen(true);
    };

    const saveSector = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!sectorName) return;

        try {
            const sectorData: any = {
                name: sectorName,
                icon: sectorIcon,
                description: sectorDescription,
                type: sectorType,
                updatedAt: new Date().toISOString()
            };

            if (sectorType === 'GOVERNMENT') {
                sectorData.govtSubtype = govtSubtype;
            }

            if (sectorType === 'APARTMENT') {
                sectorData.rooms = {
                    basic: 5,
                    premium: 0,
                    penthouse: 0
                };
            }

            if (editingSector) {
                await update(ref(db, `departments/${editingSector.id}`), sectorData);
                alert('Sector updated successfully!');
            } else {
                await push(ref(db, 'departments'), { ...sectorData, createdAt: new Date().toISOString() });
                alert('Sector added successfully!');
            }
            setIsSectorModalOpen(false);
        } catch (e: any) {
            handleDatabaseError(e, editingSector ? OperationType.UPDATE : OperationType.CREATE, 'departments');
            alert('Error saving sector: ' + e.message);
        }
    };

    const removeDepartment = async (id: string, name: string) => {
        triggerConfirmation('Delete Sector', `Are you sure you want to delete the sector "${name}"? This will remove all associated jobs, rooms, and rented units!`, async () => {
            try {
                // Remove related jobs
                const jobsToRemove = jobs.filter(job => job.departmentId === id);
                for (const job of jobsToRemove) {
                    await set(ref(db, `jobs/${job.id}`), null);
                }

                // Remove the sector itslef (and nested data)
                await set(ref(db, `departments/${id}`), null);

                alert('Sector and all associated data successfully removed.');
            } catch (e: any) {
                console.error("Error removing sector:", e);
                alert('Error removing sector: ' + e.message);
            }
        });
    };

    const openAddJob = (initialDeptId?: string) => {
        setEditingJob(null);
        setJobTitle('');
        setJobPay(50);
        setJobSectorId(initialDeptId || (departments.length > 0 ? departments[0].id : ''));
        setJobRequirements('');
        setJobTasks('');
        setJobDuration(60);
        setJobMaxPositions(1);
        setJobIsManager(false);
        setIsJobModalOpen(true);
    };

    const openEditJob = (job: Job) => {
        setEditingJob(job);
        setJobTitle(job.title);
        setJobPay(job.pay);
        setJobSectorId(job.departmentId);
        setJobRequirements(job.requirements || '');
        setJobTasks(job.tasks ? job.tasks.join('\n') : '');
        setJobDuration(job.shiftDuration || 60);
        setJobMaxPositions(job.maxPositions || 1);
        setJobIsManager(job.isManager || false);
        setIsJobModalOpen(true);
    };

    const saveJob = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!jobTitle || !jobSectorId) return;

        const jobData = {
            title: jobTitle,
            pay: Number(jobPay),
            departmentId: jobSectorId,
            requirements: jobRequirements,
            tasks: jobTasks.split('\n').filter(t => t.trim() !== ''),
            shiftDuration: Number(jobDuration),
            maxPositions: Number(jobMaxPositions),
            isManager: jobIsManager,
            updatedAt: new Date().toISOString()
        };

        try {
            if (editingJob) {
                await update(ref(db, `jobs/${editingJob.id}`), jobData);
                alert('Job updated successfully!');
            } else {
                await push(ref(db, 'jobs'), { ...jobData, createdAt: new Date().toISOString() });
                alert('Job added successfully!');
            }
            setIsJobModalOpen(false);
        } catch (e: any) {
            handleDatabaseError(e, editingJob ? OperationType.UPDATE : OperationType.CREATE, 'jobs');
            alert('Error saving job: ' + e.message);
        }
    };

    const editRole = async (role: RoleAssignment) => {
        const newRole = prompt('Update Authority Title:', role.role);
        const sectorRef = prompt('Update Sector Link (optional):', role.departmentId || '');
        if (newRole) {
            await update(ref(db, `roles/${role.uid}`), { 
                role: newRole, 
                departmentId: sectorRef || null 
            }).then(() => alert('Role updated successfully!'))
            .catch(e => {
                handleDatabaseError(e, OperationType.UPDATE, `roles/${role.uid}`);
                alert('Error updating role: ' + e.message);
            });
        }
    };

    const assignRole = async (preselectedUid?: string) => {
        const targetId = preselectedUid || prompt('Citizen Identity:');
        const role = prompt('Authority Level (admin, moderator, citizen):', 'moderator');
        const sectorRef = prompt('Sector Link (Optional):');
        if (targetId && role) {
            await update(ref(db, `roles/${targetId}`), { 
                uid: targetId, 
                role: role.toLowerCase(), 
                departmentId: sectorRef || null 
            }).then(() => alert('Role assigned successfully!'))
            .catch(e => {
                handleDatabaseError(e, OperationType.UPDATE, `roles/${targetId}`);
                alert('Error assigning role: ' + e.message);
            });
        }
    };

    const seedDefaults = async () => {
        triggerConfirmation('Restore Defaults', 'Seed default departments and jobs?', async () => {
            const defaultDeps = [
                { name: 'Bank', icon: '🏦', description: 'Financial district' },
                { name: 'Apartments', icon: '🏠', description: 'Living Quarters' },
                { name: 'Shopping Mall', icon: '🛍️', description: 'Resource Market' },
                { name: 'Service Area', icon: '🛠️', description: 'Maintenance' },
                { name: 'Government', icon: '🏛️', description: 'Policy Controls' },
                { name: 'Commercial', icon: '🏢', description: 'Biz & Trade' }
            ];

            const defaultItemDefs = [
                { name: 'Cama', icon: '🛏️' },
                { name: 'Geleira', icon: '🧊' },
                { name: 'Fogão', icon: '🍳' },
                { name: 'Guarda fato', icon: '👕' },
                { name: 'PC', icon: '💻' }
            ];

            for (const dep of defaultDeps) {
                const newDepRef = push(ref(db, 'departments'));
                await set(newDepRef, { ...dep, createdAt: new Date().toISOString() });
                
                // Add a default job for each department
                await push(ref(db, 'jobs'), {
                    title: `${dep.name} Assistant`,
                    pay: 30 + Math.floor(Math.random() * 50),
                    requirements: 'Level 1 basic training',
                    tasks: ['Log shift start', 'Perform routine inspection', 'Finalize reports'],
                    shiftDuration: 15,
                    departmentId: newDepRef.key,
                    createdAt: new Date().toISOString()
                });
            }

            for (const item of defaultItemDefs) {
                await push(ref(db, 'item_definitions'), { ...item, createdAt: new Date().toISOString() });
            }
        });
    };

    const saveSystemSettings = async () => {
        await update(ref(db, 'system_settings'), systemSettings);
        alert('System settings updated');
    };

    return (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-6 md:p-10 shadow-2xl text-slate-100 max-h-[85vh] overflow-y-auto custom-scrollbar">
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

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 pb-6 border-b border-white/10 gap-6">
                <div>
                    <button onClick={onBack} className="text-emerald-400 mb-2 flex items-center gap-2 hover:translate-x-1 transition-transform font-mono text-xs uppercase tracking-widest">&larr; Return to City</button>
                    <h2 className="text-3xl md:text-4xl font-black text-red-500 font-mono tracking-tighter uppercase whitespace-pre-wrap italic">Central Admin Console</h2>
                </div>
                <button onClick={seedDefaults} className="px-6 py-3 bg-blue-600/20 border border-blue-600/30 text-blue-400 rounded-2xl hover:bg-blue-600 hover:text-white transition-all font-mono font-bold text-xs uppercase tracking-widest active:scale-95 shadow-lg shadow-blue-500/10">Restore Default Data</button>
            </div>

            <div className="space-y-16">
                <div className="flex gap-4 pb-6 overflow-x-auto">
                    {['settings', 'levels', 'roles', 'sectors', 'tasks', 'jobs'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 rounded-full font-mono text-xs uppercase ${activeTab === tab ? 'bg-red-600 text-white' : 'bg-white/5 text-slate-400'}`}>{tab}</button>
                    ))}
                </div>
                {/* System Settings */}
                {activeTab === 'settings' && (
                <section>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-6 bg-red-500 rounded-full" />
                            <h3 className="text-2xl font-black font-mono text-white tracking-tight uppercase italic">System Settings</h3>
                        </div>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-mono">Global Taxi Price ($)</label>
                            <div className="flex gap-2">
                                <input 
                                    type="number" 
                                    value={systemSettings.taxiPrice} 
                                    onChange={e => setSystemSettings(s => ({ ...s, taxiPrice: parseFloat(e.target.value) || 0 }))}
                                    className="flex-1 bg-black/40 border border-white/10 rounded p-2 text-white font-mono" 
                                />
                                <button onClick={saveSystemSettings} className="px-4 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white rounded font-mono text-xs uppercase tracking-widest transition-colors font-bold">Save</button>
                            </div>
                        </div>
                    </div>
                </section>
                )}

                {/* Leveling System */}
                {activeTab === 'levels' && (
                    <section>
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-1.5 h-6 bg-purple-500 rounded-full" />
                                <h3 className="text-2xl font-black font-mono text-white tracking-tight uppercase italic">Levels & Rewards</h3>
                            </div>
                            <button onClick={addLevel} className="px-4 py-2 bg-purple-600/10 border border-purple-500/30 text-purple-400 rounded-xl hover:bg-purple-600 hover:text-black transition-all font-mono font-bold text-[10px] uppercase tracking-widest">New Level</button>
                        </div>
                        <div className="grid gap-4">
                            {levels.map(level => (
                                <div key={level.id} className="p-6 bg-white/5 rounded-3xl border border-white/5 flex gap-4 items-center">
                                    <div className="text-xl font-black text-purple-400 font-mono w-16">Lvl {level.level}</div>
                                    <input type="number" className="bg-black/40 border border-white/10 rounded p-2 font-mono text-sm" value={level.xpRequired} onChange={(e) => updateLevel(level.id, { xpRequired: Number(e.target.value) })} />
                                    <input type="text" className="bg-black/40 border border-white/10 rounded p-2 font-mono text-sm flex-1" value={level.reward} onChange={(e) => updateLevel(level.id, { reward: e.target.value })} placeholder="Reward description..." />
                                    <button onClick={() => removeLevel(level.id)} className="text-red-400">✕</button>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
                {/* Authorities & Moderation */}
                {activeTab === 'roles' && (
                <section>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
                            <h3 className="text-2xl font-black font-mono text-white tracking-tight uppercase italic">Citizen Roles</h3>
                        </div>
                        <button onClick={() => assignRole()} className="px-5 py-2.5 bg-emerald-600/10 border border-emerald-500/30 text-emerald-400 rounded-xl hover:bg-emerald-600 hover:text-black transition-all font-mono font-bold text-[10px] uppercase tracking-widest">New Appointment</button>
                    </div>
                    
                    <div className="p-8 bg-black/40 border border-white/5 rounded-3xl mb-8 shadow-inner">
                        <h4 className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-[0.2em] mb-6">Population Directory (Select user to promote)</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {users.map(u => (
                                <button 
                                    key={u.uid} 
                                    onClick={() => assignRole(u.uid)}
                                    className="p-4 bg-white/5 rounded-2xl border border-white/5 text-left hover:border-emerald-500 transition-all group active:scale-95 overflow-hidden relative"
                                >
                                    <div className="absolute inset-0 bg-emerald-500/0 group-hover:bg-emerald-500/5 transition-colors" />
                                    <p className="font-bold text-xs truncate text-slate-200 group-hover:text-emerald-400 mb-1">{u.displayName || u.email}</p>
                                    <p className="text-[9px] text-slate-600 font-mono italic truncate">{u.uid}</p>
                                    {roles.find(r => r.uid === u.uid) && (
                                        <p className="mt-2 text-[8px] font-black text-emerald-500 uppercase tracking-tighter decoration-emerald-500 underline underline-offset-4">{roles.find(r => r.uid === u.uid)?.role}</p>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {roles.map(role => (
                            <div key={role.uid} className="group p-5 bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 flex justify-between items-center hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all duration-500">
                                <div>
                                    <p className="font-mono text-[9px] text-slate-600 italic truncate max-w-[120px] mb-1">{role.uid}</p>
                                    <p className="font-black text-emerald-400 italic text-lg tracking-tighter uppercase">{role.role}</p>
                                    {role.departmentId && <p className="text-[10px] text-slate-500 font-mono">Sector: {departments.find(d => d.id === role.departmentId)?.name || role.departmentId}</p>}
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => editRole(role)} className="p-2 text-emerald-500/50 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-xl transition-all font-mono font-black text-[10px] uppercase">Edit</button>
                                    <button onClick={() => remove(ref(db, `roles/${role.uid}`))} className="p-2 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all font-mono font-black text-[10px] uppercase">Revoke</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
                )}

                {activeTab === 'sectors' && (
                    <section className="space-y-6">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="w-1.5 h-6 bg-cyan-500 rounded-full" />
                                <h3 className="text-2xl font-black font-mono text-white tracking-tight uppercase italic">City Sectors</h3>
                            </div>
                            <button onClick={openAddSector} className="px-4 py-2 bg-cyan-600/10 border border-cyan-500/30 text-cyan-400 rounded-xl hover:bg-cyan-600 hover:text-black transition-all font-mono font-bold text-[10px] uppercase tracking-widest">New Sector</button>
                        </div>
                        <div className="grid gap-4">
                            {departments.length === 0 && (
                                <div className="bg-cyan-500/10 border border-cyan-500/30 p-8 rounded-3xl flex flex-col items-center justify-center gap-4 text-center border-dashed">
                                    <p className="text-cyan-300 font-mono text-sm italic">No sectors registered in the city network.</p>
                                    <button onClick={seedDefaults} className="px-6 py-3 bg-cyan-600/20 border border-cyan-600/30 text-cyan-400 rounded-2xl hover:bg-cyan-600 hover:text-black transition-all font-mono font-bold text-xs uppercase tracking-widest active:scale-95 shadow-lg shadow-cyan-500/10">Initialize City Sectors</button>
                                </div>
                            )}
                            {departments.map(dept => (
                                <div key={dept.id} className="p-6 bg-white/5 rounded-3xl border border-white/5 group hover:border-cyan-500/50 transition-all duration-500 shadow-xl">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex gap-4 items-center">
                                            <span className="bg-white/5 p-3 rounded-2xl flex items-center justify-center w-16 h-16">
                                                {dept.icon && dept.icon.startsWith('http') ? (
                                                    <img src={dept.icon} alt={dept.name} className="w-10 h-10 object-contain" />
                                                ) : (
                                                    <span className="text-4xl">{dept.icon || '🏢'}</span>
                                                )}
                                            </span>
                                            <div>
                                                <p className="font-black text-xl text-cyan-400 tracking-tighter uppercase italic">{dept.name}</p>
                                                <p className="text-[10px] text-cyan-600 font-mono font-black uppercase tracking-widest">{SECTOR_TYPES.find(t => t.id === dept.type)?.label || dept.type || 'BANCO'}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <button onClick={() => openEditSector(dept)} className="px-3 py-1 bg-cyan-600/10 text-cyan-500 border border-cyan-500/30 hover:bg-cyan-600 hover:text-white rounded-lg transition-all font-mono font-black text-[10px] uppercase">Edit</button>
                                            <button onClick={() => openAddJob(dept.id)} className="px-3 py-1 bg-amber-600/10 text-amber-500 border border-amber-500/30 hover:bg-amber-600 hover:text-white rounded-lg transition-all font-mono font-black text-[10px] uppercase">+ Job</button>
                                            <button onClick={() => removeDepartment(dept.id, dept.name)} className="px-3 py-1 bg-red-600/10 text-red-500 border border-red-500/30 hover:bg-red-600 hover:text-white rounded-lg transition-all font-mono font-black text-[10px] uppercase">Remove</button>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-400 font-medium leading-relaxed italic">{dept.description || 'No data recorded.'}</p>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {activeTab === 'tasks' && (
                    <section className="space-y-6">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="w-1.5 h-6 bg-pink-500 rounded-full" />
                                <h3 className="text-2xl font-black font-mono text-white tracking-tight uppercase italic">Task Protocols</h3>
                            </div>
                            <button onClick={openAddProtocol} className="px-4 py-2 bg-pink-600/10 border border-pink-500/30 text-pink-400 rounded-xl hover:bg-pink-600 hover:text-black transition-all font-mono font-bold text-[10px] uppercase tracking-widest">New Protocol</button>
                        </div>
                        <div className="p-8 bg-black/40 border border-white/5 rounded-3xl shadow-inner">
                            <div className="flex flex-wrap gap-3">
                                {taskTags.length === 0 && <p className="text-slate-600 font-mono text-[10px] italic">No protocols defined. These serve as mission categories.</p>}
                                {taskTags.filter(t => PROTOCOL_TYPES.map(pt => pt.id).includes(t.type || '')).map(tag => (
                                    <div key={tag.id} className="flex items-center gap-3 px-4 py-2 bg-pink-500/10 border border-pink-500/20 rounded-full group hover:border-pink-500/50 transition-all">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-mono font-black text-pink-400 uppercase tracking-tighter">{tag.label}</span>
                                            <span className="text-[7px] font-mono text-slate-500 uppercase tracking-[0.2em]">{PROTOCOL_TYPES.find(t => t.id === tag.type)?.label || 'Generic'} ({tag.targetValue || 1})</span>
                                        </div>
                                        <div className="flex items-center gap-2 border-l border-pink-500/20 pl-2">
                                            <button onClick={() => openEditProtocol(tag)} className="text-pink-500/30 hover:text-pink-400 transition-colors text-[10px] font-bold uppercase">Edit</button>
                                            <button onClick={() => removeTaskTag(tag.id)} className="text-pink-400/50 hover:text-red-500 hover:scale-110 transition-all text-xl font-black leading-none">&times;</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                )}

                    {/* Protocol Modal */}
                    <BaseModal isOpen={isProtocolModalOpen} onClose={() => setIsProtocolModalOpen(false)} title={editingProtocol ? 'Refactor Protocol' : 'Sync New Protocol'}>
                        <form onSubmit={saveProtocol} className="space-y-6">
                            <div>
                                <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest mb-2">Protocol Label</label>
                                <input 
                                    type="text" 
                                    value={protocolLabel} 
                                    onChange={(e) => setProtocolLabel(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-pink-500 outline-none transition-all font-bold"
                                    placeholder="e.g. AD-SKELETON"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest mb-2">Sync Type</label>
                                    <select 
                                        value={protocolType}
                                        onChange={(e) => setProtocolType(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-pink-500 outline-none transition-all font-bold text-xs"
                                    >
                                        {PROTOCOL_TYPES.map(type => (
                                            <option key={type.id} value={type.id} className="bg-slate-900">{type.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest mb-2">Goal Value</label>
                                    <input 
                                        type="number" 
                                        value={protocolGoal} 
                                        onChange={(e) => setProtocolGoal(Number(e.target.value))}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-pink-500 outline-none transition-all font-mono font-bold"
                                        min="1"
                                        required
                                    />
                                </div>
                            </div>
                            {protocolType === 'WATCH_ADS' && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest mb-2">Ad URL (Redirect To)</label>
                                        <input 
                                            type="url" 
                                            value={protocolAdLink} 
                                            onChange={(e) => setProtocolAdLink(e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-pink-500 outline-none transition-all font-bold"
                                            placeholder="https://example.com/ad"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest mb-2">Confirmation Link (Verification URL)</label>
                                        <input 
                                            type="url" 
                                            value={protocolConfirmationLink} 
                                            onChange={(e) => setProtocolConfirmationLink(e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-pink-500 outline-none transition-all font-bold"
                                            placeholder="https://example.com/confirm?token=..."
                                            required
                                        />
                                    </div>
                                </div>
                            )}
                            <div className="flex gap-4 pt-4">
                                <button 
                                    type="button" 
                                    onClick={() => setIsProtocolModalOpen(false)}
                                    className="flex-1 py-3 border border-white/10 text-slate-400 rounded-xl hover:bg-white/5 transition-all font-mono font-bold text-xs uppercase"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    className="flex-1 py-3 bg-pink-600 text-black rounded-xl hover:bg-pink-500 transition-all font-mono font-black text-xs uppercase tracking-widest shadow-lg shadow-pink-500/20"
                                >
                                    {editingProtocol ? 'Update Protocol' : 'Deploy Protocol'}
                                </button>
                            </div>
                        </form>
                    </BaseModal>

                    {/* Sector Modal */}
                    <BaseModal isOpen={isSectorModalOpen} onClose={() => setIsSectorModalOpen(false)} title={editingSector ? 'Edit Sector' : 'Add New Sector'}>
                        <form onSubmit={saveSector} className="space-y-6">
                            <div className="flex gap-4">
                                <div className="w-20">
                                    <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest mb-2">Icon</label>
                                    <input 
                                        type="text" 
                                        value={sectorIcon} 
                                        onChange={(e) => setSectorIcon(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-2xl text-center focus:border-cyan-500 outline-none transition-all truncate"
                                        placeholder="🏢"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest mb-2">Name</label>
                                    <input 
                                        type="text" 
                                        value={sectorName} 
                                        onChange={(e) => setSectorName(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none transition-all font-bold"
                                        placeholder="e.g. Police HQ"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Icons8 Icon Search Component */}
                            <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                                <div className="flex justify-between items-center">
                                    <label className="block text-[10px] font-mono text-cyan-400 font-extrabold uppercase tracking-widest">
                                        🌸 Search Icons8 Library
                                    </label>
                                    {sectorIcon && sectorIcon.startsWith('http') && (
                                        <img src={sectorIcon} alt="Active preview" className="w-8 h-8 object-contain" />
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <input 
                                        type="text"
                                        value={icons8Query}
                                        onChange={(e) => setIcons8Query(e.target.value)}
                                        placeholder="e.g. money-bag, shield, burger, building"
                                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-cyan-500 outline-none transition-all"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                const clean = icons8Query.trim().toLowerCase().replace(/\s+/g, '-');
                                                if (clean) {
                                                    setIcons8Results([
                                                        `https://img.icons8.com/color/96/${clean}.png`,
                                                        `https://img.icons8.com/3d-fluency/94/${clean}.png`,
                                                        `https://img.icons8.com/clouds/100/${clean}.png`,
                                                        `https://img.icons8.com/bubbles/100/${clean}.png`,
                                                        `https://img.icons8.com/isometric/100/${clean}.png`,
                                                        `https://img.icons8.com/plasticine/100/${clean}.png`,
                                                        `https://img.icons8.com/flat-round/100/${clean}.png`
                                                    ]);
                                                }
                                            }
                                        }}
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            const clean = icons8Query.trim().toLowerCase().replace(/\s+/g, '-');
                                            if (clean) {
                                                setIcons8Results([
                                                    `https://img.icons8.com/color/96/${clean}.png`,
                                                    `https://img.icons8.com/3d-fluency/94/${clean}.png`,
                                                    `https://img.icons8.com/clouds/100/${clean}.png`,
                                                    `https://img.icons8.com/bubbles/100/${clean}.png`,
                                                    `https://img.icons8.com/isometric/100/${clean}.png`,
                                                    `https://img.icons8.com/plasticine/100/${clean}.png`,
                                                    `https://img.icons8.com/flat-round/100/${clean}.png`
                                                ]);
                                            }
                                        }}
                                        className="px-3 py-2 bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600 hover:text-black rounded-xl font-mono text-xs uppercase"
                                    >
                                        Search
                                    </button>
                                </div>
                                
                                {/* Preset Search buttons */}
                                <div className="flex flex-wrap gap-1">
                                    {['bank', 'home', 'shield', 'fireman', 'burger', 'factory', 'government', 'gavel', 'store', 'crane'].map(tag => (
                                        <button 
                                            key={tag}
                                            type="button"
                                            onClick={() => {
                                                setIcons8Query(tag);
                                                setIcons8Results([
                                                    `https://img.icons8.com/color/96/${tag}.png`,
                                                    `https://img.icons8.com/3d-fluency/94/${tag}.png`,
                                                    `https://img.icons8.com/clouds/100/${tag}.png`,
                                                    `https://img.icons8.com/bubbles/100/${tag}.png`,
                                                    `https://img.icons8.com/isometric/100/${tag}.png`,
                                                    `https://img.icons8.com/plasticine/100/${tag}.png`,
                                                    `https://img.icons8.com/flat-round/100/${tag}.png`
                                                ]);
                                            }}
                                            className="px-2 py-1 bg-white/5 hover:bg-cyan-900/30 text-slate-400 hover:text-white rounded-md text-[10px] font-mono capitalize"
                                        >
                                            {tag}
                                        </button>
                                    ))}
                                </div>

                                {icons8Results.length > 0 && (
                                    <div className="grid grid-cols-4 gap-2 pt-2 max-h-40 overflow-y-auto">
                                        {icons8Results.map((url, i) => (
                                            <button 
                                                key={i}
                                                type="button"
                                                onClick={() => {
                                                    setSectorIcon(url);
                                                }}
                                                className={`p-2 bg-black/30 rounded-xl hover:bg-cyan-950/20 border transition-all flex flex-col items-center justify-center gap-1 ${sectorIcon === url ? 'border-cyan-500 bg-cyan-950/10' : 'border-white/10'}`}
                                            >
                                                <img 
                                                    src={url} 
                                                    alt="icon preview" 
                                                    width={40} 
                                                    height={40} 
                                                    className="object-contain" 
                                                    onError={(e) => {
                                                        const target = e.target as HTMLImageElement;
                                                        target.style.display = 'none';
                                                    }} 
                                                />
                                                <span className="text-[8px] text-slate-500 font-mono">
                                                    {url.includes('/color/') ? 'Color' : url.includes('/3d-fluency/') ? '3D' : url.includes('/clouds/') ? 'Clouds' : url.includes('/bubbles/') ? 'Bubbles' : url.includes('/isometric/') ? 'Iso' : url.includes('/plasticine/') ? 'Clay' : 'Flat'}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest mb-2">Sector Type</label>
                                <select 
                                    value={sectorType}
                                    onChange={(e) => setSectorType(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none transition-all font-bold text-xs"
                                >
                                    {SECTOR_TYPES.map(type => (
                                        <option key={type.id} value={type.id} className="bg-slate-900">{type.label}</option>
                                    ))}
                                </select>
                            </div>
                            {sectorType === 'GOVERNMENT' && (
                                <div>
                                    <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest mb-2">Government Subtype</label>
                                    <select 
                                        value={govtSubtype}
                                        onChange={(e) => setGovtSubtype(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none transition-all font-bold text-xs"
                                    >
                                        <option value="ADMINISTRATION" className="bg-slate-900">Administration</option>
                                        <option value="FINANCE_AGENCY" className="bg-slate-900">Finance Agency</option>
                                    </select>
                                </div>
                            )}
                            {sectorType === 'APARTMENT' && (
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest mb-2">Basic Rooms</label>
                                        <input type="number" className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none transition-all font-bold" value={roomsBasic} onChange={e => setRoomsBasic(Number(e.target.value))} />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest mb-2">Premium Rooms</label>
                                        <input type="number" className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none transition-all font-bold" value={roomsPremium} onChange={e => setRoomsPremium(Number(e.target.value))} />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest mb-2">Penthouse Rooms</label>
                                        <input type="number" className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none transition-all font-bold" value={roomsPenthouse} onChange={e => setRoomsPenthouse(Number(e.target.value))} />
                                    </div>
                                </div>
                            )}
                            <div>
                                <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest mb-2">Description</label>
                                <textarea 
                                    value={sectorDescription} 
                                    onChange={(e) => setSectorDescription(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none transition-all h-24 resize-none"
                                    placeholder="Describe the sector's purpose..."
                                />
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button 
                                    type="button" 
                                    onClick={() => setIsSectorModalOpen(false)}
                                    className="flex-1 py-3 border border-white/10 text-slate-400 rounded-xl hover:bg-white/5 transition-all font-mono font-bold text-xs uppercase"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    className="flex-1 py-3 bg-cyan-600 text-black rounded-xl hover:bg-cyan-500 transition-all font-mono font-black text-xs uppercase tracking-widest shadow-lg shadow-cyan-500/20"
                                >
                                    {editingSector ? 'Update Sector' : 'Authorize Sector'}
                                </button>
                            </div>
                        </form>
                    </BaseModal>

                {activeTab === 'jobs' && (
                    <section className="space-y-6">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="w-1.5 h-6 bg-amber-500 rounded-full" />
                                <h3 className="text-2xl font-black font-mono text-white tracking-tight uppercase italic">Market Nodes</h3>
                            </div>
                            <button onClick={() => openAddJob()} className="px-4 py-2 bg-amber-600/10 border border-amber-500/30 text-amber-400 rounded-xl hover:bg-amber-600 hover:text-black transition-all font-mono font-bold text-[10px] uppercase tracking-widest">Add Job</button>
                        </div>
                        <div className="grid gap-4">
                            {jobs.length === 0 && (
                                <p className="text-slate-500 font-mono text-xs italic py-4">No jobs registered.</p>
                            )}
                            {jobs.map(job => (
                                <div key={job.id} className="p-6 bg-white/5 rounded-3xl border border-white/5 group hover:border-amber-500/50 transition-all duration-500 shadow-xl">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <p className="font-black text-xl text-slate-100 tracking-tighter uppercase italic">{job.title}</p>
                                            <p className="text-[10px] text-amber-500 font-mono font-black uppercase tracking-widest">Income: ${job.pay.toFixed(2)} | Duration: {job.shiftDuration || 30}s</p>
                                            <p className="text-[10px] text-amber-400 font-mono font-bold mt-1">Status: {job.isManager ? 'Manager' : 'Employee'} | Capacity: {job.maxPositions || 1}</p>
                                            {job.requirements && <p className="text-[9px] text-slate-500 font-mono italic mt-1">Reqs: {job.requirements}</p>}
                                            {job.tasks && <p className="text-[9px] text-slate-500 font-mono italic">Missions: {job.tasks.length}</p>}
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => openEditJob(job)} className="p-2 text-amber-500/50 hover:text-amber-500 hover:bg-amber-500/10 rounded-xl transition-all font-mono font-black text-[10px] uppercase">Edit</button>
                                            <button onClick={() => remove(ref(db, `jobs/${job.id}`))} className="p-2 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all font-mono font-black text-[10px] uppercase">Remove</button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1 h-1 bg-slate-700 rounded-full" />
                                        <p className="text-[9px] text-slate-600 font-mono uppercase tracking-widest font-black">Sector: {departments.find(d => d.id === job.departmentId)?.name || job.departmentId}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
                    {/* Job Modal */}
                    <BaseModal isOpen={isJobModalOpen} onClose={() => setIsJobModalOpen(false)} title={editingJob ? 'Refactor Job' : 'Release Job Node'} titleColor="text-amber-400">
                        <form onSubmit={saveJob} className="space-y-6">
                            <div>
                                <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest mb-2">Job Title</label>
                                <input 
                                    type="text" 
                                    value={jobTitle} 
                                    onChange={(e) => setJobTitle(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-amber-500 outline-none transition-all font-bold"
                                    placeholder="e.g. System Security"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest mb-2">Pay ($)</label>
                                    <input 
                                        type="number" 
                                        value={jobPay} 
                                        onChange={(e) => setJobPay(Number(e.target.value))}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-amber-500 outline-none transition-all font-mono font-bold"
                                        min="0"
                                        step="0.01"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest mb-2">Shift Duration (sec)</label>
                                    <input 
                                        type="number" 
                                        value={jobDuration} 
                                        onChange={(e) => setJobDuration(Number(e.target.value))}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-amber-500 outline-none transition-all font-mono font-bold"
                                        min="1"
                                        required
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest mb-2">Max Positions</label>
                                    <input 
                                        type="number" 
                                        value={jobMaxPositions} 
                                        onChange={(e) => setJobMaxPositions(Number(e.target.value))}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-amber-500 outline-none transition-all font-mono font-bold"
                                        min="1"
                                        required
                                    />
                                </div>
                                <div className="flex items-center">
                                    <label className="flex items-center gap-3 cursor-pointer mt-4">
                                        <input 
                                            type="checkbox" 
                                            checked={jobIsManager} 
                                            onChange={(e) => setJobIsManager(e.target.checked)}
                                            className="w-5 h-5 accent-amber-500 rounded bg-white/5 border-white/10"
                                        />
                                        <span className="text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest">Manager Role</span>
                                    </label>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest mb-2">Sector</label>
                                <select 
                                    value={jobSectorId} 
                                    onChange={(e) => setJobSectorId(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-amber-500 outline-none transition-all font-bold"
                                    required
                                >
                                    {departments.map(d => (
                                        <option key={d.id} value={d.id} className="bg-slate-900">{d.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest mb-2">Requirements</label>
                                <input 
                                    type="text" 
                                    value={jobRequirements} 
                                    onChange={(e) => setJobRequirements(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-amber-500 outline-none transition-all"
                                    placeholder="e.g. Strength: 5, Level: 2"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest mb-2">Daily Tasks (One per line)</label>
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {taskTags.map(tag => (
                                        <button 
                                            key={tag.id}
                                            type="button"
                                            onClick={() => setJobTasks(prev => prev + (prev.trim() ? '\n' : '') + `[${tag.label}] `)}
                                            className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[9px] font-mono text-pink-400 hover:border-pink-500 transition-all font-black uppercase"
                                        >
                                            + {tag.label}
                                        </button>
                                    ))}
                                </div>
                                <textarea 
                                    value={jobTasks} 
                                    onChange={(e) => setJobTasks(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-amber-500 outline-none transition-all h-24 resize-none"
                                    placeholder="Task 1&#10;Task 2&#10;Task 3"
                                />
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button 
                                    type="button" 
                                    onClick={() => setIsJobModalOpen(false)}
                                    className="flex-1 py-3 border border-white/10 text-slate-400 rounded-xl hover:bg-white/5 transition-all font-mono font-bold text-xs uppercase"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    className="flex-1 py-3 bg-amber-600 text-black rounded-xl hover:bg-amber-500 transition-all font-mono font-black text-xs uppercase tracking-widest shadow-lg shadow-amber-500/20"
                                >
                                    {editingJob ? 'Update Node' : 'Initialize Node'}
                                </button>
                            </div>
                        </form>
                    </BaseModal>
            </div>
        </div>
    );
}
