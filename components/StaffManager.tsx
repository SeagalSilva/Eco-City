'use client';
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue, update, get } from 'firebase/database';

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
        };
        fetchEmployees();
    }, [departmentId]);

    const fireEmployee = async (uid: string) => {
        if (!confirm('Are you sure you want to fire this employee?')) return;
        try {
            await update(ref(db, `game_states/${uid}`), {
                activeJobId: null
            });
            alert('Employee fired.');
        } catch (e) {
            console.error(e);
            alert('Failed to fire employee.');
        }
    };

    if (!isManager) return null;

    return (
        <div className="mt-8 p-6 bg-red-500/5 border border-red-500/20 rounded-2xl">
            <h4 className="font-bold text-red-400 mb-4 uppercase tracking-widest font-mono text-sm flex items-center gap-2">
                <span>🔥</span> Personnel Management
            </h4>
            <div className="space-y-2">
                {employees.length === 0 && <p className="text-slate-500 font-mono text-xs italic">No employees found.</p>}
                {employees.map(emp => (
                    <div key={emp.uid} className="flex items-center justify-between p-3 bg-black/40 border border-red-500/10 rounded-xl font-mono text-xs">
                        <div>
                            <p className="text-white font-bold">{emp.jobTitle}</p>
                            <p className="text-slate-500">ID: {emp.uid.substring(0, 8)}</p>
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
        </div>
    );
}
