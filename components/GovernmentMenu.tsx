'use client';
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { ref, push, update, onValue, get, runTransaction, set } from 'firebase/database';
import { User } from 'firebase/auth';
import StaffManager from './StaffManager';

interface GovernmentMenuProps {
    user: User;
    sectorId: string;
}

interface RentedApartment {
    type: string;
    rentedAt: number;
    roomId: string;
    isLocked: boolean;
    name?: string; // Loaded sector name
}

interface Complaint {
    id: string;
    uid: string;
    complainantName: string;
    description: string;
    status: string;
    requestedAt: number;
    housingAddressId: string;
    sectorId: string;
    response?: string;
    redirectedByUid?: string;
    redirectedByName?: string;
}

interface NameChange {
    id: string;
    uid: string;
    oldName: string;
    newName: string;
    status: string;
    requestedAt: number;
    approvedBy?: string;
}

interface ConstructionProject {
    id: string;
    name: string;
    type: string;
    icon: string;
    hiredCompanySectorId: string;
    progress: number;
    status: string;
    createdByUid: string;
    createdByName: string;
    createdAt: number;
    deedClaimed: boolean;
}

interface ConstructionCompany {
    id: string;
    name: string;
    icon: string;
}

export default function GovernmentMenu({ user, sectorId }: GovernmentMenuProps) {
    const [govtSubtype, setGovtSubtype] = useState<string>('ADMINISTRATION');
    const [balance, setBalance] = useState(0);
    const [isStaff, setIsStaff] = useState(false);
    const [isManager, setIsManager] = useState(false);

    // Visitor States: Name Change
    const [newName, setNewName] = useState('');
    const [nameChangeHistory, setNameChangeHistory] = useState<NameChange[]>([]);

    // Visitor States: Complaint
    const [complaintDesc, setComplaintDesc] = useState('');
    const [selectedAddress, setSelectedAddress] = useState('');
    const [rentedHomes, setRentedHomes] = useState<[string, RentedApartment][]>([]);

    // Staff States: View items
    const [pendingNameChanges, setPendingNameChanges] = useState<NameChange[]>([]);
    const [pendingComplaints, setPendingComplaints] = useState<Complaint[]>([]);
    
    // Reply forms
    const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');

    // Manager States: Construction Projects
    const [constructionCompList, setConstructionCompList] = useState<ConstructionCompany[]>([]);
    const [newProjName, setNewProjName] = useState('');
    const [newProjType, setNewProjType] = useState('BANK');
    const [newProjIcon, setNewProjIcon] = useState('🏢');
    const [selectedCompId, setSelectedCompId] = useState('');
    const [currentProjects, setCurrentProjects] = useState<ConstructionProject[]>([]);
    const [icons8Query, setIcons8Query] = useState('');
    const [icons8Results, setIcons8Results] = useState<string[]>([]);
    const [sectorIcon, setSectorIcon] = useState('🏢');

    // Menu View State
    // Visitors go to 'citizen-desk', staff/managers can also see 'staff-terminal' or 'construction-agency'
    const [activeTab, setActiveTab] = useState<'citizen-desk' | 'staff-terminal' | 'construction-control' | 'staff-management'>('citizen-desk');

    const SECTOR_TYPES = [
        { id: 'BANK', label: 'Bank' },
        { id: 'APARTMENT', label: 'Apartment Complex' },
        { id: 'POLICE', label: 'Police Station' },
        { id: 'FIREFIGHTER', label: 'Fire station' },
        { id: 'RESTAURANT', label: 'Restaurant' },
        { id: 'FACTORY', label: 'Industrial Factory' },
        { id: 'MARKET', label: 'Market / Shop' }
    ];

    useEffect(() => {
        // Load details of the sector
        onValue(ref(db, `departments/${sectorId}`), (snap) => {
            const data = snap.val();
            if (data) {
                setGovtSubtype(data.govtSubtype || 'ADMINISTRATION');
            }
        });

        // Load balance & rented apartments
        onValue(ref(db, `game_states/${user.uid}`), async (snap) => {
            const data = snap.val();
            if (data) {
                setBalance(data.balance || 0);
                if (data.rentedApartments) {
                    const entries = Object.entries(data.rentedApartments) as [string, RentedApartment][];
                    // Retrieve sector names of these sectors for beautiful listing
                    const richEntries = await Promise.all(entries.map(async ([sectId, apt]) => {
                        const sSnap = await get(ref(db, `departments/${sectId}/name`));
                        return [sectId, { ...apt, name: sSnap.exists() ? sSnap.val() : `Setor ${sectId}` }] as [string, RentedApartment];
                    }));
                    setRentedHomes(richEntries);
                } else {
                    setRentedHomes([]);
                }

                // Check staff privileges
                if (data.activeJobId) {
                    const jobSnap = await get(ref(db, `jobs/${data.activeJobId}`));
                    const jobData = jobSnap.val();
                    if (jobData && jobData.departmentId === sectorId) {
                        setIsStaff(true);
                        setIsManager(!!jobData.isManager);
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

        // Load Name Changes list (all)
        onValue(ref(db, `government/name_changes`), (snap) => {
            const val = snap.val();
            if (val) {
                const list = Object.entries(val).map(([id, item]: [string, any]) => ({ id, ...item })) as NameChange[];
                setNameChangeHistory(list);
                setPendingNameChanges(list.filter(item => item.status === 'PENDING'));
            } else {
                setNameChangeHistory([]);
                setPendingNameChanges([]);
            }
        });

        // Load Complaints list
        onValue(ref(db, `government/complaints`), (snap) => {
            const val = snap.val();
            if (val) {
                const list = Object.entries(val).map(([id, item]: [string, any]) => ({ id, ...item })) as Complaint[];
                setPendingComplaints(list.filter(item => item.status === 'PENDING' || item.status === 'REDIRECTED_TO_ADMIN'));
            } else {
                setPendingComplaints([]);
            }
        });

        // Load Construction Companies to hire
        onValue(ref(db, `departments`), (snap) => {
            const value = snap.val();
            if (value) {
                const list = Object.entries(value)
                    .filter(([_, d]: [string, any]) => d.type === 'CONSTRUCTION_COMPANY' || d.type === 'CONSTRUCTION')
                    .map(([id, d]: [string, any]) => ({ id, name: d.name, icon: d.icon || '🏗️' })) as ConstructionCompany[];
                setConstructionCompList(list);
            } else {
                setConstructionCompList([]);
            }
        });

        // Load active Construction Projects
        onValue(ref(db, `construction_projects`), (snap) => {
            const val = snap.val();
            if (val) {
                const list = Object.entries(val).map(([id, item]: [string, any]) => ({ id, ...item })) as ConstructionProject[];
                setCurrentProjects(list);
            } else {
                setCurrentProjects([]);
            }
        });

    }, [user.uid, sectorId]);

    // Visitor triggers name change
    const submitNameChangeRequest = async () => {
        const trimmed = newName.trim();
        if (!trimmed) {
            alert('Por favor introduza o novo nome desejado.');
            return;
        }
        if (balance < 0.05) {
            alert('Saldo insuficiente. Mudar de nome custa $0.05!');
            return;
        }

        try {
            // Deduct balance
            await runTransaction(ref(db, `game_states/${user.uid}/balance`), (current) => (current || 0) - 0.05);

            // Publish request
            await push(ref(db, `government/name_changes`), {
                uid: user.uid,
                oldName: user.displayName || 'Sem Nome',
                newName: trimmed,
                status: 'PENDING',
                requestedAt: Date.now()
            });

            alert('Pedido de alteração submetido com sucesso! Taxa de $0.05 cobrada.');
            setNewName('');
        } catch (e: any) {
            alert('Erro ao registrar alteração: ' + e.message);
        }
    };

    // Employee approves name change
    const approveNameChange = async (req: NameChange) => {
        try {
            const employeeName = user.displayName || 'Funcionário Público';
            // Update the request status
            await update(ref(db, `government/name_changes/${req.id}`), {
                status: 'APPROVED',
                approvedBy: employeeName
            });

            // Make the actual identity update for the targeted user
            await update(ref(db, `game_states/${req.uid}`), {
                displayName: req.newName
            });
            await update(ref(db, `users/${req.uid}`), {
                displayName: req.newName
            });

            alert(`Alteração de nome para "${req.newName}" APRECIADA e APROVADA por ${employeeName}!`);
        } catch (e: any) {
            alert('Erro ao aprovar proposta: ' + e.message);
        }
    };

    // Visitor submits a complaint
    const submitComplaint = async () => {
        const desc = complaintDesc.trim();
        if (!desc) {
            alert('Descreva a reclamação / denúncia.');
            return;
        }
        if (rentedHomes.length === 0) {
            alert('Erro: É obrigatório que possua pelo menos uma habitação/apartamento arrendado para receber correspondência oficial do governo.');
            return;
        }
        if (!selectedAddress) {
            alert('Por favor selecione o apartamento no qual quer receber as respostas governamentais.');
            return;
        }

        try {
            await push(ref(db, `government/complaints`), {
                uid: user.uid,
                complainantName: user.displayName || 'Anónimo',
                description: desc,
                status: 'PENDING',
                requestedAt: Date.now(),
                housingAddressId: selectedAddress,
                sectorId
            });

            alert('A sua queixa formosa foi registada oficialmente na Administração de Governo!');
            setComplaintDesc('');
            setSelectedAddress('');
        } catch (e: any) {
            alert('Erro ao submeter queixa: ' + e.message);
        }
    };

    // Employee responds to complaint
    const respondToComplaint = async (complaint: Complaint) => {
        const text = replyText.trim();
        if (!text) {
            alert('Digite uma resposta válida.');
            return;
        }

        try {
            const senderTag = `Funcionário: ${user.displayName || 'Administrativo'}`;

            // Create Letter in Complainant Mailbox
            const letterRef = push(ref(db, `game_states/${complaint.uid}/mailbox`));
            await set(letterRef, {
                sender: senderTag,
                senderUid: user.uid,
                message: text,
                receivedAt: Date.now(),
                type: 'GOVERNMENT_RESPONSE',
                subject: 'Decisão Administrativo - Queixa',
                address: complaint.housingAddressId
            });

            // Mark complaint as RESOLVED
            await update(ref(db, `government/complaints/${complaint.id}`), {
                status: 'RESOLVED',
                response: text
            });

            alert('Resposta enviada com sucesso para a caixa de correio do cidadão!');
            setReplyText('');
            setActiveReplyId(null);
        } catch (e: any) {
            alert('Erro ao despachar resposta: ' + e.message);
        }
    };

    // Employee redirects complaint to Super Admin
    const redirectComplaintToAdmin = async (complaint: Complaint) => {
        try {
            const helperName = user.displayName || 'Agente Governamental';
            await update(ref(db, `government/complaints/${complaint.id}`), {
                status: 'REDIRECTED_TO_ADMIN',
                redirectedByUid: user.uid,
                redirectedByName: helperName
            });

            alert('A queixa foi transferida com sucesso para apreciação superior do Administrador Geral!');
        } catch (e: any) {
            alert('Erro ao reencaminhar queixa: ' + e.message);
        }
    };

    // Manager starts a construction project
    const createConstructionProject = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanName = newProjName.trim();
        if (!cleanName) {
            alert('Indique o nome do edifício.');
            return;
        }
        if (!selectedCompId) {
            alert('Escolha uma Empresa de Construção civil ativa no mapa.');
            return;
        }

        try {
            const projRef = push(ref(db, `construction_projects`));
            await set(projRef, {
                name: cleanName,
                type: newProjType,
                icon: sectorIcon,
                hiredCompanySectorId: selectedCompId,
                progress: 0,
                status: 'UNDER_CONSTRUCTION',
                createdByUid: user.uid,
                createdByName: user.displayName || 'Gestor Público',
                createdAt: Date.now(),
                deedClaimed: false
            });

            alert(`Empreitada "${cleanName}" lançada com sucesso! Os engenheiros e operários da empresa contratada já podem progredir a obra.`);
            setNewProjName('');
            setSelectedCompId('');
        } catch (e: any) {
            alert('Erro de protocolo: ' + e.message);
        }
    };

    // Manager issues the final corporate license deed to deploy the complete sector
    const issueSectorDeedAndOwnership = async (proj: ConstructionProject) => {
        try {
            // Deploy the new department to /departments path natively
            const newSectorRef = push(ref(db, `departments`));
            const newSectorId = newSectorRef.key;

            if (!newSectorId) throw new Error("ID de setor falhou");

            const sectorData: any = {
                name: proj.name,
                type: proj.type,
                icon: proj.icon || '🏢',
                description: `Edifício público inovador construído sob diretivas governamentais em ${new Date().toLocaleDateString()}.`,
                createdAt: new Date().toISOString()
            };

            if (proj.type === 'APARTMENT') {
                sectorData.rooms = {
                    basic: 10,
                    premium: 2,
                    penthouse: 1,
                    prices: { basic: 500, premium: 2500, penthouse: 10000 }
                };
            }

            // Create sector on map
            await set(newSectorRef, sectorData);

            // Grant Ownership: Set claimant as the official Manager/Owner!
            await set(ref(db, `roles/${user.uid}`), {
                uid: user.uid,
                role: 'Manager',
                departmentId: newSectorId
            });

            // Mark construction project as CLAIMED / COMPLETED
            await update(ref(db, `construction_projects/${proj.id}`), {
                deedClaimed: true,
                status: 'COMMISSIONED',
                finalSectorId: newSectorId
            });

            alert(`Parabéns! O Alvará de Funcionamento do "${proj.name}" foi registado. Você tornou-se o Administrador/Dono proprietário legítimo deste novo edifício com controlo total de contratações!`);
        } catch (e: any) {
            alert('Erro ao emitir alvará: ' + e.message);
        }
    };

    const handleIcons8Search = () => {
        const clean = icons8Query.trim().toLowerCase().replace(/\s+/g, '-');
        if (!clean) return;
        setIcons8Results([
            `https://img.icons8.com/color/96/${clean}.png`,
            `https://img.icons8.com/3d-fluency/94/${clean}.png`,
            `https://img.icons8.com/clouds/100/${clean}.png`,
            `https://img.icons8.com/bubbles/100/${clean}.png`,
            `https://img.icons8.com/isometric/100/${clean}.png`,
            `https://img.icons8.com/plasticine/100/${clean}.png`,
            `https://img.icons8.com/flat-round/100/${clean}.png`
        ]);
    };

    return (
        <div className="bg-black/20 p-6 md:p-8 rounded-[2rem] border border-white/5 space-y-8 shadow-2xl relative">
            
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-white/10 pb-6 gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                        <span className="text-[10px] font-mono font-black text-cyan-400 uppercase tracking-widest">
                            {govtSubtype === 'FINANCE_AGENCY' ? 'Ministério das Finanças' : 'Gabinete de Atendimento Civil'}
                        </span>
                    </div>
                    <h3 className="font-black text-2xl text-white tracking-widest uppercase italic">
                        {govtSubtype === 'FINANCE_AGENCY' ? 'Agência de Finanças' : 'Governo & Administração'}
                    </h3>
                </div>

                {/* Tab select menu */}
                <div className="flex flex-wrap gap-2">
                    <button 
                        onClick={() => setActiveTab('citizen-desk')} 
                        className={`text-xs px-4 py-2 rounded-xl border font-mono font-bold uppercase transition-all tracking-wider ${activeTab === 'citizen-desk' ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30 shadow-lg shadow-cyan-500/5' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}
                    >
                        Atendimento Público
                    </button>
                    
                    {isStaff && (
                        <button 
                            onClick={() => setActiveTab('staff-terminal')} 
                            className={`text-xs px-4 py-2 rounded-xl border font-mono font-bold uppercase transition-all tracking-wider ${activeTab === 'staff-terminal' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}
                        >
                            Balcão de Funcionários {pendingComplaints.length + pendingNameChanges.length > 0 && (
                                <span className="ml-1.5 px-1.5 py-0.5 bg-red-500 text-white rounded-full text-[9px] font-extrabold animate-bounce">
                                    {pendingComplaints.length + pendingNameChanges.length}
                                </span>
                            )}
                        </button>
                    )}

                    {isManager && (
                        <>
                            <button 
                                onClick={() => setActiveTab('construction-control')} 
                                className={`text-xs px-4 py-2 rounded-xl border font-mono font-bold uppercase transition-all tracking-wider ${activeTab === 'construction-control' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}
                            >
                                Plano de Obras
                            </button>
                            <button 
                                onClick={() => setActiveTab('staff-management')} 
                                className={`text-xs px-4 py-2 rounded-xl border font-mono font-bold uppercase transition-all tracking-wider ${activeTab === 'staff-management' ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}
                            >
                                Gerir Funcionários
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* TAB CONTENT: CITIZEN DESK */}
            {activeTab === 'citizen-desk' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    
                    {/* Alterar Nome Panel */}
                    <div className="p-6 bg-white/5 border border-white/5 rounded-3xl space-y-4">
                        <div className="flex gap-3 items-center mb-1">
                            <span className="text-xl">✍️</span>
                            <h4 className="text-sm font-black text-white font-mono uppercase tracking-widest">Averbação de Nome Civil</h4>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            Cidadãos podem requerer a alteração do seu nome oficial na rede urbana. Cada averbação custa <strong className="text-cyan-400 font-mono">$0.05</strong> e requer aprovação manual das autoridades.
                        </p>
                        
                        <div className="space-y-3 pt-3">
                            <div className="text-xs text-slate-400">
                                Nome atual: <span className="font-bold text-white font-mono">{user.displayName || 'Anónimo'}</span>
                            </div>
                            <input 
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Insira o seu novo nome desejado..."
                                className="w-full bg-black/40 border border-white/15 rounded-xl px-4 py-3 text-xs text-white focus:border-cyan-500 outline-none transition-all font-mono"
                            />
                            <button 
                                onClick={submitNameChangeRequest}
                                className="w-full py-3 bg-cyan-600/10 hover:bg-cyan-600 border border-cyan-500/30 text-cyan-400 hover:text-black rounded-xl font-mono font-bold text-xs uppercase tracking-widest transition-all shadow-md shadow-cyan-950/20 active:scale-95"
                            >
                                Submeter Pedido ($0.05)
                            </button>
                        </div>

                        {/* Approved logs */}
                        <div className="pt-4 space-y-2">
                            <label className="block text-[9px] font-mono text-slate-500 uppercase tracking-widest">
                                Histórico de Alterações Recentes
                            </label>
                            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                                {nameChangeHistory.filter(n => n.status === 'APPROVED').slice(-5).map(item => (
                                    <div key={item.id} className="p-2.5 bg-black/20 border border-white/5 rounded-xl flex justify-between items-center text-[10px] font-mono text-slate-400">
                                        <div>
                                            <span className="text-slate-500">{item.oldName}</span> &rarr; <span className="text-cyan-400 font-bold">{item.newName}</span>
                                        </div>
                                        <div className="text-[8px] text-slate-600 font-bold uppercase tracking-widest text-right">
                                            Aprovador: {item.approvedBy || 'Sistema'}
                                        </div>
                                    </div>
                                ))}
                                {nameChangeHistory.filter(n => n.status === 'APPROVED').length === 0 && (
                                    <div className="text-[10px] text-slate-600 italic font-mono p-2">Sem registos oficiais lançados.</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Complaint Panel */}
                    <div className="p-6 bg-white/5 border border-white/5 rounded-3xl space-y-4">
                        <div className="flex gap-3 items-center mb-1">
                            <span className="text-xl">👁️</span>
                            <h4 className="text-sm font-black text-white font-mono uppercase tracking-widest">Gabinete de Queixas e Reclamações</h4>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            Envie reclamações, propostas civis e feedback. Respostas oficiais serão enviadas fisicamente para a <strong className="text-cyan-400 font-mono">Caixa de Correio</strong> da residência indicada.
                        </p>

                        <div className="space-y-3 pt-3">
                            {rentedHomes.length === 0 ? (
                                <div className="text-xs p-3.5 bg-red-950/20 border border-red-900/40 text-red-400 rounded-xl font-bold font-mono">
                                    ⚠️ Sem Caixa Postal: Deve alugar um apartamento primeiro para que possa usufruir de correspondência administrativa do governo.
                                </div>
                            ) : (
                                <>
                                    <textarea 
                                        value={complaintDesc}
                                        onChange={(e) => setComplaintDesc(e.target.value)}
                                        placeholder="Descreva detalhadamente a sua queixa ou sugestão governamental..."
                                        className="w-full bg-black/40 border border-white/15 rounded-xl p-4 text-xs text-white focus:border-cyan-500 outline-none transition-all h-24 resize-none font-mono"
                                    />
                                    
                                    <div className="space-y-1.5">
                                        <label className="block text-[9px] font-mono text-slate-500 uppercase tracking-widest">
                                            Direcionar Correspondência Postal para:
                                        </label>
                                        <select
                                            value={selectedAddress}
                                            onChange={(e) => setSelectedAddress(e.target.value)}
                                            className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white focus:border-cyan-500 outline-none transition-all font-mono"
                                        >
                                            <option value="">-- Escolher Apartamento --</option>
                                            {rentedHomes.map(([id, apt]) => (
                                                <option key={id} value={id} className="bg-slate-950 text-white font-mono text-xs">
                                                    Morada: {apt.name || 'Setor'} (Inst: #{apt.roomId})
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <button 
                                        onClick={submitComplaint}
                                        className="w-full py-3 bg-amber-500/10 hover:bg-amber-500 hover:text-black border border-amber-500/20 rounded-xl font-mono font-bold text-xs uppercase tracking-widest transition-all active:scale-95 shadow-md shadow-amber-950/20"
                                    >
                                        Enviar Reclamação Oficial
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB CONTENT: STAFF TERMINAL */}
            {activeTab === 'staff-terminal' && (
                <div className="space-y-8 animate-in fade-in duration-300">
                    
                    <div className="p-6 bg-white/5 border border-white/5 rounded-3xl space-y-6">
                        <div className="flex justify-between items-center">
                            <h4 className="text-md font-black text-rose-400 font-mono uppercase tracking-widest">Pedidos de Nome Civil Pendentes</h4>
                            <span className="text-xs bg-cyan-950 text-cyan-400 border border-cyan-500/20 px-3 py-1 rounded-full font-mono font-bold">{pendingNameChanges.length} Propostas</span>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {pendingNameChanges.map(req => (
                                <div key={req.id} className="p-4 bg-black/30 border border-white/5 rounded-2xl flex flex-col justify-between gap-4">
                                    <div className="space-y-1 font-mono text-xs">
                                        <p className="text-slate-500">ID Utilizador: <span className="text-cyan-400 font-bold">{req.uid.slice(0, 8)}...</span></p>
                                        <p className="text-slate-300 text-sm">Nome Atual: <strong className="text-white">{req.oldName}</strong></p>
                                        <p className="text-slate-300 text-sm">Novo Nome: <strong className="text-cyan-300 font-bold text-md">{req.newName}</strong></p>
                                    </div>
                                    <button 
                                        onClick={() => approveNameChange(req)}
                                        className="py-2 bg-green-500/20 hover:bg-green-500 hover:text-black border border-green-500/30 text-green-400 font-bold font-mono text-[10px] uppercase tracking-widest rounded-xl transition-all"
                                    >
                                        Aprovar & Atualizar Registo
                                    </button>
                                </div>
                            ))}
                            {pendingNameChanges.length === 0 && (
                                <p className="text-slate-500 font-mono text-xs italic py-2 col-span-full">Nenhum pedido de alteração pendente de momento.</p>
                            )}
                        </div>
                    </div>

                    <div className="p-6 bg-white/5 border border-white/5 rounded-3xl space-y-6">
                        <div className="flex justify-between items-center">
                            <h4 className="text-md font-black text-rose-400 font-mono uppercase tracking-widest font-mono">Processamento de Reclamações Civis</h4>
                            <span className="text-xs bg-amber-950 text-amber-400 border border-amber-500/20 px-3 py-1 rounded-full font-mono font-bold">{pendingComplaints.length} Ativos</span>
                        </div>

                        <div className="space-y-4">
                            {pendingComplaints.map(complaint => (
                                <div key={complaint.id} className="p-5 bg-black/30 border border-white/5 rounded-2xl space-y-4">
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 border-b border-white/5 pb-2">
                                        <div className="font-mono text-[11px]">
                                            <span className="text-slate-400 font-bold uppercase">De:</span> <strong className="text-amber-400 italic">{complaint.complainantName}</strong>
                                            <span className="text-slate-600 block">UID: {complaint.uid.slice(0,8)}...</span>
                                        </div>
                                        <div className="text-[10px] text-slate-500 font-mono">
                                            Resposta a encaminhar para o Setor: <span className="text-white hover:underline">{complaint.housingAddressId}</span>
                                        </div>
                                        <div>
                                            <span className={`text-[9px] font-mono px-2 py-1 rounded font-bold uppercase tracking-wider ${complaint.status === 'REDIRECTED_TO_ADMIN' ? 'bg-red-500/20 text-red-400 border border-red-500/35' : 'bg-amber-500/20 text-amber-400 border border-amber-500/35'}`}>
                                                {complaint.status}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="text-xs text-slate-300 font-mono leading-relaxed bg-white/5 p-3.5 rounded-xl">
                                        {complaint.description}
                                    </div>

                                    {/* Handle redirected tags */}
                                    {complaint.status === 'REDIRECTED_TO_ADMIN' && (
                                        <p className="text-[10px] text-red-500/80 italic font-mono bg-red-950/10 p-2 border border-red-950/20 rounded">
                                            Reencaminhado pelo Funcionário: <strong className="text-white">{complaint.redirectedByName}</strong> (Aguardando Parecer do Administrador Superior)
                                        </p>
                                    )}

                                    {/* Action Buttons */}
                                    {complaint.status !== 'REDIRECTED_TO_ADMIN' && (
                                        <div className="flex flex-wrap gap-3">
                                            <button 
                                                onClick={() => {
                                                    setActiveReplyId(activeReplyId === complaint.id ? null : complaint.id);
                                                    setReplyText('');
                                                }}
                                                className="px-4 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-500 hover:bg-amber-500 hover:text-black rounded-lg text-xs font-mono font-bold uppercase"
                                            >
                                                {activeReplyId === complaint.id ? 'Fechar Resposta' : 'Responder ao Cidadão'}
                                            </button>
                                            
                                            <button 
                                                onClick={() => redirectComplaintToAdmin(complaint)}
                                                className="px-4 py-2 bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white rounded-lg text-xs font-mono font-bold uppercase"
                                            >
                                                Redirecionar ao Admin Superior
                                            </button>
                                        </div>
                                    )}

                                    {activeReplyId === complaint.id && (
                                        <div className="pt-3 space-y-3 border-t border-white/5">
                                            <textarea 
                                                value={replyText}
                                                onChange={(e) => setReplyText(e.target.value)}
                                                placeholder="Escreva a resposta formal que será impressa e enviada à casa do queixoso..."
                                                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white focus:border-amber-500 outline-none h-20 resize-none font-mono"
                                            />
                                            <button 
                                                onClick={() => respondToComplaint(complaint)}
                                                className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-black py-2.5 rounded-xl font-mono text-xs font-bold uppercase tracking-wider"
                                            >
                                                Despachar Carta Postal & Concluir
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {pendingComplaints.length === 0 && (
                                <p className="text-slate-500 font-mono text-xs italic py-2">Sem reclamações ativas em processamento.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB CONTENT: CONSTRUCTION PLAN (MANAGER COMPONENT) */}
            {activeTab === 'construction-control' && (
                <div className="space-y-8 animate-in fade-in duration-300">
                    
                    {/* Create project form */}
                    <div className="p-6 bg-white/5 border border-white/5 rounded-3xl space-y-6">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">🏗️</span>
                            <h4 className="text-md font-black text-purple-400 font-mono uppercase tracking-widest">Encomendar Nova Construção Civil</h4>
                        </div>
                        
                        <form onSubmit={createConstructionProject} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest">Nome do Edifício</label>
                                    <input 
                                        type="text"
                                        value={newProjName}
                                        onChange={(e) => setNewProjName(e.target.value)}
                                        placeholder="e.g. Banco do Norte, Restaurante Central"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-purple-500 outline-none font-mono font-bold"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest">Tipo de Negócio / Setor</label>
                                    <select
                                        value={newProjType}
                                        onChange={(e) => setNewProjType(e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-purple-500 outline-none font-mono font-bold"
                                    >
                                        {SECTOR_TYPES.map(st => (
                                            <option key={st.id} value={st.id} className="bg-slate-950">{st.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Icons8 Icon Search inside Creation */}
                            <div className="p-4 bg-purple-950/15 rounded-2xl border border-purple-500/20 space-y-3">
                                <div className="flex justify-between items-center">
                                    <label className="block text-[10px] font-mono text-purple-300 font-black uppercase tracking-widest">
                                        🌸 Ícone do Prédio (Pesquisa Icons8)
                                    </label>
                                    {sectorIcon && sectorIcon.startsWith('http') && (
                                        <img src={sectorIcon} alt="Preview" className="w-8 h-8 object-contain bg-black/30 p-1 rounded" />
                                    )}
                                </div>
                                
                                <div className="flex gap-2">
                                    <input 
                                        type="text"
                                        value={icons8Query}
                                        onChange={(e) => setIcons8Query(e.target.value)}
                                        placeholder="e.g. bank, home, cop-car, shop, meal"
                                        className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-purple-500 outline-none"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleIcons8Search();
                                            }
                                        }}
                                    />
                                    <button 
                                        type="button"
                                        onClick={handleIcons8Search}
                                        className="px-3 py-2 bg-purple-600/20 text-purple-400 hover:bg-purple-600 hover:text-white rounded-xl font-mono text-xs uppercase"
                                    >
                                        Procurar
                                    </button>
                                </div>

                                {icons8Results.length > 0 && (
                                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 max-h-32 overflow-y-auto pt-1 pr-1">
                                        {icons8Results.map((url, i) => (
                                            <button 
                                                key={i}
                                                type="button"
                                                onClick={() => setSectorIcon(url)}
                                                className={`p-1.5 bg-black/40 rounded-lg hover:border-purple-400 border transition-all flex flex-col items-center justify-center ${sectorIcon === url ? 'border-purple-500 bg-purple-950/20' : 'border-white/5'}`}
                                            >
                                                <img src={url} alt="icon preview" className="w-7 h-7 object-contain" onError={e => (e.target as HTMLElement).style.display = 'none'} />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="block text-[10px] font-mono text-slate-500 font-black uppercase tracking-widest">Empreiteira Contratada (Empresa de Construção civil)</label>
                                    <select
                                        value={selectedCompId}
                                        onChange={(e) => setSelectedCompId(e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-purple-500 outline-none font-mono"
                                        required
                                    >
                                        <option value="">-- Escolher Construtora Comercial --</option>
                                        {constructionCompList.map(cc => (
                                            <option key={cc.id} value={cc.id} className="bg-slate-950">
                                                {cc.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex items-end">
                                    <button 
                                        type="submit"
                                        className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 text-black font-black font-mono text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg hover:shadow-purple-500/25 active:scale-95"
                                    >
                                        Lançar Empreitada de Obra ($1.00 USD)
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>

                    {/* Active construction list */}
                    <div className="p-6 bg-white/5 border border-white/5 rounded-3xl space-y-6">
                        <h4 className="text-sm font-black text-white font-mono uppercase tracking-widest">Empreitadas Civis em Curso</h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {currentProjects.filter(p => !p.deedClaimed).map(proj => {
                                const comp = constructionCompList.find(c => c.id === proj.hiredCompanySectorId);
                                return (
                                    <div key={proj.id} className="p-5 bg-black/30 border border-white/5 rounded-2xl space-y-4">
                                        <div className="flex gap-4 items-center">
                                            <div className="w-14 h-14 bg-white/5 rounded-xl flex items-center justify-center p-2 border border-white/10">
                                                {proj.icon && proj.icon.startsWith('http') ? (
                                                    <img src={proj.icon} alt={proj.name} className="w-full h-full object-contain" />
                                                ) : (
                                                    <span className="text-3xl">{proj.icon || '🏢'}</span>
                                                )}
                                            </div>
                                            <div>
                                                <h5 className="font-bold text-white text-md tracking-tight uppercase">{proj.name}</h5>
                                                <p className="text-[10px] text-purple-400 font-mono font-bold uppercase tracking-wider">Setor Alvo: {proj.type}</p>
                                                <p className="text-[9px] text-slate-500 font-mono">Construtora: {comp ? comp.name : `Setor ${proj.hiredCompanySectorId}`}</p>
                                            </div>
                                        </div>

                                        <div className="space-y-1 bg-black/25 p-3 rounded-xl border border-white/5">
                                            <div className="flex justify-between text-[10px] font-mono text-slate-400 font-bold">
                                                <span>Progresso da Estrutura</span>
                                                <span className={`${proj.progress === 100 ? 'text-green-400 animate-pulse font-extrabold' : 'text-purple-400'}`}>
                                                    {proj.progress}% {proj.progress === 100 ? '(CONCLUÍDO)' : '(EM CONST.)'}
                                                </span>
                                            </div>
                                            <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-white/5">
                                                <div 
                                                    className={`h-full transition-all duration-500 ${proj.progress === 100 ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-gradient-to-r from-purple-500 to-pink-500'}`} 
                                                    style={{ width: `${proj.progress}%` }} 
                                                />
                                            </div>
                                        </div>

                                        {proj.progress === 100 ? (
                                            <div className="pt-2">
                                                <button 
                                                    onClick={() => issueSectorDeedAndOwnership(proj)}
                                                    className="w-full py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-black font-black font-mono text-xs uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                                                >
                                                    📜 Emitir Alvará de Funcionamento e Posse
                                                </button>
                                                <p className="text-[9px] text-slate-400 text-center mt-2 italic">
                                                    Converte a obra finalizada num edifício oficial ativo no City Map. O seu ID torna-se automaticamente Dono/Gestor legítimo!
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="text-[10px] text-center text-slate-500 italic p-3 font-mono border border-dashed border-white/15 rounded-xl">
                                                Aguardando que os operários da construtora executem as ações de obra (no Sector da Construtora) para evoluir a estrutura.
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {currentProjects.filter(p => !p.deedClaimed).length === 0 && (
                                <p className="text-slate-500 font-mono text-xs italic py-2 col-span-full">Nenhuma obra registada de momento.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB CONTENT: STAFF MANAGEMENT (MANAGER COMPONENT) */}
            {activeTab === 'staff-management' && isManager && (
                <div className="animate-in fade-in duration-300">
                    <StaffManager departmentId={sectorId} isManager={isManager} />
                </div>
            )}
        </div>
    );
}
