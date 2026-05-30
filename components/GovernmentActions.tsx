import { useState, useEffect } from 'react';
import BaseModal from './BaseModal';
import { db } from '@/lib/firebase';
import { ref, push, update, onValue, get, runTransaction } from 'firebase/database';
import { User } from 'firebase/auth';

interface GovernmentActionsProps {
  isOpen: boolean;
  onClose: () => void;
  sectorId: string;
  user: User;
  isEmployee: boolean;
  isManager: boolean;
}

export default function GovernmentActions({ isOpen, onClose, sectorId, user, isEmployee, isManager }: GovernmentActionsProps) {
  const [activeAction, setActiveAction] = useState<'ACTIONS' | 'NAME_CHANGE' | 'COMPLAINT' | 'CONSTRUCTION' | 'PENDING_REQUESTS'>('ACTIONS');
  const [balance, setBalance] = useState(0);
  const [rentedHomes, setRentedHomes] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [complaintDesc, setComplaintDesc] = useState('');
  const [homeAddress, setHomeAddress] = useState('');
  const [requests, setRequests] = useState<any[]>([]);
  const [complaints, setComplaints] = useState<any[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const userRef = ref(db, `game_states/${user.uid}`);
    onValue(userRef, (snap) => {
        const data = snap.val();
        setBalance(data?.balance || 0);
        if (data?.rentedApartments) {
            setRentedHomes(Object.entries(data.rentedApartments));
        } else {
            setRentedHomes([]);
        }
    });

    if (isEmployee || isManager) {
        onValue(ref(db, `name_change_requests`), (snap) => {
            const data = snap.val();
            setRequests(data ? Object.entries(data).map(([id, req]: [string, any]) => ({id, ...req})) : []);
        });
        onValue(ref(db, `complaints`), (snap) => {
            const data = snap.val();
            setComplaints(data ? Object.entries(data).map(([id, comp]: [string, any]) => ({id, ...comp})) : []);
        });
    }
  }, [isOpen, user.uid, isEmployee, isManager]);

  const handleNameChangeRequest = async () => {
    if (balance < 0.05) {
        alert("Insufficient funds ($0.05 required).");
        return;
    }
    
    await runTransaction(ref(db, `game_states/${user.uid}/balance`), (current) => (current || 0) - 0.05);

    await push(ref(db, `name_change_requests`), {
        uid: user.uid,
        oldName: user.displayName,
        newName,
        status: 'PENDING',
        requestedAt: Date.now(),
        sectorId
    });
    alert('Name change request submitted.');
    setNewName('');
    setActiveAction("ACTIONS");
  };

  const approveNameChange = async (reqId: string) => {
    await update(ref(db, `name_change_requests/${reqId}`), { status: 'APPROVED', approvedBy: user.displayName });
    alert('Name change approved.');
  };

  const handleComplaint = async () => {
    if (!complaintDesc || !homeAddress) {
        alert("Enter description and select a house.");
        return;
    }

    await push(ref(db, `complaints`), {
        uid: user.uid,
        description: complaintDesc,
        status: 'PENDING',
        requestedAt: Date.now(),
        housingAddressId: homeAddress,
        sectorId
    });
    alert('Complaint submitted to Government.');
    setComplaintDesc('');
    setHomeAddress('');
    setActiveAction("ACTIONS");
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="Government Administration" titleColor="text-cyan-400">
      {activeAction === 'ACTIONS' && (
        <div className="space-y-4">
          <button onClick={() => setActiveAction('NAME_CHANGE')} className="w-full p-4 bg-white/5 hover:bg-cyan-950/30 rounded-xl text-left text-white font-bold">Request Name Change ($0.05)</button>
          <button onClick={() => setActiveAction('COMPLAINT')} className="w-full p-4 bg-white/5 hover:bg-cyan-950/30 rounded-xl text-left text-white font-bold">File Complaint</button>
          
          {(isEmployee || isManager) && (
            <>
              <button onClick={() => setActiveAction('PENDING_REQUESTS')} className="w-full p-4 bg-amber-950/30 hover:bg-amber-900/40 rounded-xl text-left text-amber-200 font-bold border border-amber-500/30">View Pending Requests</button>
              {isManager && (
                <button onClick={() => setActiveAction('CONSTRUCTION')} className="w-full p-4 bg-purple-950/30 hover:bg-purple-900/40 rounded-xl text-left text-purple-200 font-bold border border-purple-500/30">Manage Construction</button>
              )}
            </>
          )}
        </div>
      )}

      {activeAction === 'NAME_CHANGE' && (
        <div className="space-y-4">
            <input className="w-full bg-white/5 p-4 rounded-xl text-white" placeholder="New Name" value={newName} onChange={e => setNewName(e.target.value)} />
            <button onClick={handleNameChangeRequest} className="w-full p-4 bg-cyan-600 rounded-xl text-black font-bold">Submit Request</button>
        </div>
      )}

      {activeAction === 'COMPLAINT' && (
        <div className="space-y-4">
            <textarea className="w-full bg-white/5 p-4 rounded-xl text-white" placeholder="Complaint Description" value={complaintDesc} onChange={e => setComplaintDesc(e.target.value)} />
            <select className="w-full bg-white/5 p-4 rounded-xl text-white" value={homeAddress} onChange={e => setHomeAddress(e.target.value)}>
                <option value="">Select Receiving Address</option>
                {rentedHomes.map(([id, data]) => <option key={id} value={id}>Sector: {id}</option>)}
            </select>
            <button onClick={handleComplaint} className="w-full p-4 bg-cyan-600 rounded-xl text-black font-bold">Submit Complaint</button>
        </div>
      )}

      {activeAction === 'PENDING_REQUESTS' && (
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <h4 className="text-amber-400 font-bold font-mono text-xs uppercase">Name Changes</h4>
            {requests.filter(r => r.status === 'PENDING').map(r => (
                <div key={r.id} className="p-4 bg-white/5 rounded-xl text-xs flex justify-between items-center">
                    <div>
                        <p className="text-white">UID: {r.uid.slice(0,6)}...</p>
                        <p className="text-white font-bold">{r.newName}</p>
                    </div>
                    <button onClick={() => approveNameChange(r.id)} className="text-green-400 p-2 border border-green-500/30 rounded-lg">Approve</button>
                </div>
            ))}
            <h4 className="text-amber-400 font-bold mt-6 font-mono text-xs uppercase">Complaints</h4>
            {complaints.filter(c => c.status === 'PENDING').map(c => (
                <div key={c.id} className="p-4 bg-white/5 rounded-xl text-xs">
                    <p className="text-white">Housing ID: {c.housingAddressId}</p>
                    <p className="text-white mt-1">{c.description}</p>
                </div>
            ))}
        </div>
      )}

      {activeAction !== 'ACTIONS' && (
        <button onClick={() => setActiveAction('ACTIONS')} className="text-slate-500 mt-6 font-mono text-xs uppercase uppercase underline">Back</button>
      )}
    </BaseModal>
  );
}
