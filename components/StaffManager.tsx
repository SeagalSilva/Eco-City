'use client';
import { useState, useEffect } from 'react';
import ConfirmationModal from './ConfirmationModal';
import { db } from '@/lib/firebase';
import { ref, onValue, update, get, push } from 'firebase/database';

interface StaffManagerProps {
    departmentId: string;
    isManager: boolean;
}

interface Employee {
    uid: string;
    name: string;
    jobId: string;
    jobTitle: string;
}

export default function StaffManager({ departmentId, isManager }: StaffManagerProps) {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [companyDocuments, setCompanyDocuments] = useState<any[]>([]);
    const [jobApplications, setJobApplications] = useState<any[]>([]);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [currentConfirm, setCurrentConfirm] = useState<{title: string, message: string, onConfirm: () => void} | null>(null);

    const triggerConfirmation = (title: string, message: string, onConfirm: () => void) => {
        setCurrentConfirm({title, message, onConfirm});
        setIsConfirmOpen(true);
    }

    useEffect(() => {
        // Fetch jobs in this department first to map IDs to titles
        const fetchEmployees = async () => {
            const jobsSnap = await get(ref(db, 'jobs'));
            const allJobs = jobsSnap.val() || {};
            const deptJobs = Object.keys(allJobs).filter(k => allJobs[k].departmentId === departmentId);
            
            // Listen to all users' game_states to find who is employed here
            const statesRef = ref(db, 'game_states');
            onValue(statesRef, (snapshot) => {
                const states = snapshot.val();
                if (!states) {
                    setEmployees([]);
                    return;
                }
                const emps: Employee[] = [];
                for (const uid in states) {
                    const state = states[uid];
                    if (state.activeJobId && deptJobs.includes(state.activeJobId)) {
                        emps.push({
                            uid,
                            name: state.displayName || 'Unknown Player',
                            jobId: state.activeJobId,
                            jobTitle: allJobs[state.activeJobId]?.title || 'Employee'
                        });
                    }
                }
                setEmployees(emps);
            });
            
            // Listen to company documents
            const docsRef = ref(db, `sectors/${departmentId}/company_documents`);
            onValue(docsRef, (snapshot) => {
                const docsObj = snapshot.val();
                if (docsObj) {
                    setCompanyDocuments(Object.keys(docsObj).map(k => ({ id: k, ...docsObj[k] })));
                } else {
                    setCompanyDocuments([]);
                }
            });

            // Listen to job applications
            const appsRef = ref(db, `sectors/${departmentId}/job_applications`);
            onValue(appsRef, (snapshot) => {
                const appsObj = snapshot.val();
                if (appsObj) {
                    const apps = Object.keys(appsObj).map(k => ({ id: k, ...appsObj[k] }));
                    setJobApplications(apps.filter(app => app.status === 'PENDING'));
                } else {
                    setJobApplications([]);
                }
            });
        };
        fetchEmployees();
    }, [departmentId]);

    const fireEmployee = async (uid: string) => {
        triggerConfirmation('Fire Employee', 'Are you sure you want to fire this employee?', async () => {
            try {
                await update(ref(db, `game_states/${uid}`), {
                    activeJobId: null
                });
                alert('Employee fired.');
            } catch (e) {
                console.error(e);
                alert('Failed to fire employee.');
            }
        });
    };

    const hireApplicant = async (app: any) => {
        triggerConfirmation('Hire Candidate', `Hire ${app.applicantName} as ${app.jobTitle}?`, async () => {
            try {
                const contractData = {
                    type: 'EMPLOYMENT_CONTRACT',
                    name: `Contract: ${app.jobTitle}`,
                    icon: '📄',
                    jobId: app.jobId,
                    jobTitle: app.jobTitle,
                    departmentId: departmentId,
                    isManager: app.isManager || false,
                    employeeUid: app.applicantUid,
                    employeeName: app.applicantName,
                    hiredAt: Date.now(),
                    expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
                    signed: false
                };

                // Add to user inventory
                await push(ref(db, `game_states/${app.applicantUid}/inventory`), contractData);
                
                // Add duplicate to company records
                await push(ref(db, `sectors/${departmentId}/company_documents`), contractData);

                // Verify user state
                await update(ref(db, `game_states/${app.applicantUid}`), {
                    activeJobId: app.jobId,
                    tasksCompletedToday: 0
                });

                // Update app status
                await update(ref(db, `sectors/${departmentId}/job_applications/${app.id}`), { status: 'HIRED' });

                alert('Applicant hired successfully.');
            } catch (e: any) {
                alert('Failed to hire applicant: ' + e.message);
            }
        });
    };

    const rejectApplicant = async (app: any) => {
        triggerConfirmation('Reject Candidate', `Reject ${app.applicantName}'s application?`, async () => {
            try {
                await update(ref(db, `sectors/${departmentId}/job_applications/${app.id}`), { status: 'REJECTED' });
                alert('Applicant rejected.');
            } catch (e: any) {
                alert('Failed to reject applicant: ' + e.message);
            }
        });
    };

    if (!isManager) return null;

    return (
        <div className="mt-8 p-6 bg-red-500/5 border border-red-500/20 rounded-2xl">
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
            <h4 className="font-bold text-red-400 mb-4 uppercase tracking-widest font-mono text-sm flex items-center gap-2">
                <span>🔥</span> Personnel Management
            </h4>
            <div className="space-y-2">
                {employees.length === 0 && <p className="text-slate-500 font-mono text-xs italic">No employees found.</p>}
                {employees.map(emp => (
                    <div key={emp.uid} className="flex items-center justify-between p-3 bg-black/40 border border-red-500/10 rounded-xl font-mono text-xs">
                        <div>
                            <p className="text-white font-bold">{emp.jobTitle}</p>
                            <p className="text-slate-500">Name: <strong className="text-slate-400">{emp.name}</strong> | ID: {emp.uid.substring(0, 8)}</p>
                        </div>
                        <button 
                            onClick={() => fireEmployee(emp.uid)}
                            className="px-3 py-1 bg-red-500/20 text-red-500 rounded hover:bg-red-500 hover:text-white transition-colors uppercase tracking-widest"
                        >
                            Fire
                        </button>
                    </div>
                ))}
            </div>

            <div className="mt-8">
                <h4 className="font-bold text-slate-300 mb-4 uppercase tracking-widest font-mono text-sm flex items-center gap-2">
                    <span>📝</span> Job Applications
                </h4>
                <div className="space-y-2">
                    {jobApplications.length === 0 && <p className="text-slate-500 font-mono text-xs italic">No pending applications.</p>}
                    {jobApplications.map(app => (
                        <div key={app.id} className="flex items-center justify-between p-3 bg-black/40 border border-blue-500/10 rounded-xl font-mono text-xs">
                            <div>
                                <p className="text-white font-bold">{app.jobTitle}</p>
                                <p className="text-slate-500">Applicant: <strong className="text-slate-400">{app.applicantName}</strong> | ID: {app.applicantUid.substring(0, 8)}</p>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => hireApplicant(app)}
                                    className="px-3 py-1 bg-emerald-500/20 text-emerald-500 rounded hover:bg-emerald-500 hover:text-white transition-colors uppercase tracking-widest"
                                >
                                    Hire
                                </button>
                                <button 
                                    onClick={() => rejectApplicant(app)}
                                    className="px-3 py-1 bg-red-500/20 text-red-500 rounded hover:bg-red-500 hover:text-white transition-colors uppercase tracking-widest"
                                >
                                    Reject
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            
            <div className="mt-8">
                <h4 className="font-bold text-slate-300 mb-4 uppercase tracking-widest font-mono text-sm flex items-center gap-2">
                    <span>📄</span> Company Documents (HR)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-2">
                    {companyDocuments.length === 0 && <p className="text-slate-500 font-mono text-xs italic">No documents on record.</p>}
                    {companyDocuments.map(doc => (
                        <div key={doc.id} className="p-3 bg-black/30 border border-white/5 rounded-xl font-mono text-xs flex gap-3 items-center">
                            <span className="text-2xl">{doc.icon || '📄'}</span>
                            <div>
                                <p className="text-white font-bold">{doc.name}</p>
                                <p className="text-[10px] text-slate-400">Employee: {doc.employeeName}</p>
                                <p className="text-[9px] text-slate-500">Hired on: {new Date(doc.hiredAt).toLocaleDateString()}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
