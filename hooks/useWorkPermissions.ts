import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue, get } from 'firebase/database';
import { User } from 'firebase/auth';

export function useWorkPermissions(user: User | null, sectorId: string) {
    const [isStaff, setIsStaff] = useState(false);
    const [isManager, setIsManager] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isStateOwned, setIsStateOwned] = useState(false);

    // Keep intermediate state for calculation
    const [rawStaff, setRawStaff] = useState(false);
    const [rawManager, setRawManager] = useState(false);

    useEffect(() => {
        if (!user || !sectorId) {
            setIsStaff(false);
            setIsManager(false);
            setIsAdmin(false);
            setIsStateOwned(false);
            return;
        }

        // Check if user is admin
        const unsubAdmin = onValue(ref(db, `admins/${user.uid}`), (snap) => {
            setIsAdmin(snap.exists() && snap.val() === true);
        });

        // Check if sector is state owned
        const unsubState = onValue(ref(db, `sectors/${sectorId}/company_documents`), (snap) => {
            if (snap.exists()) {
                const docsObj = snap.val();
                const isGov = Object.values(docsObj).some((doc: any) => 
                    doc.type === 'EMPLOYMENT_CONTRACT' && 
                    doc.employeeUid === 'GOVERNMENT'
                );
                setIsStateOwned(isGov);
            } else {
                setIsStateOwned(false);
            }
        });

        // Check active job and inventory
        const unsubUser = onValue(ref(db, `game_states/${user.uid}`), async (snap) => {
            const data = snap.val();
            let isM = false;
            let isS = false;
            
            if (data && data.activeJobId) {
                const jobSnap = await get(ref(db, `jobs/${data.activeJobId}`));
                const jobData = jobSnap.val();
                if (jobData && jobData.departmentId === sectorId) {
                    isS = true;
                    if (jobData.isManager) isM = true;
                }
            }
            
            if (data && data.inventory) {
                const inv = Object.values(data.inventory) as any[];
                for (const item of inv) {
                    // Ownership Deeds might not be 'signed' if they are automatically generated as OWNER.
                    // But we require signing for regular employment contracts. Thus, we check if signed, OR if it's an OWNER deed.
                    if (item.type === 'EMPLOYMENT_CONTRACT' && item.departmentId === sectorId) {
                        if (item.signed || item.jobId === 'OWNER') {
                            isS = true;
                            if (item.isManager) isM = true;
                        }
                    }
                }
            }

            setRawStaff(isS);
            setRawManager(isM);
        });

        return () => {
            unsubAdmin();
            unsubState();
            unsubUser();
        };
    }, [user, sectorId]);

    // Derived permissions
    useEffect(() => {
        if (isAdmin && isStateOwned) {
            setIsManager(true);
            setIsStaff(true);
        } else {
            setIsManager(rawManager);
            setIsStaff(rawStaff);
        }
    }, [isAdmin, isStateOwned, rawManager, rawStaff]);

    return { isStaff, isManager, isAdmin, isStateOwned };
}
