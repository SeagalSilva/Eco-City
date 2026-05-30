'use client';
import { User } from 'firebase/auth';
import { useState } from 'react';

type Message = { role: 'user' | 'system', content: string };

export default function Chat({ user, onClose }: { user: User, onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
      { role: 'system', content: 'Welcome to your Eco City Assistant. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');

  const send = () => {
    if (!input) return;
    
    // Add user message
    const newMessages: Message[] = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');
    
    // Process command
    const cmd = input.trim().toLowerCase();
    let response = "Unknown command. Try: 'Buy Slot [number]'";
    
    if (cmd.startsWith('buy slot ')) {
        const slot = cmd.split(' ')[2];
        if (slot) {
            response = `Transaction processed: Purchased Slot ${slot}.`;
        }
    }
    
    // Add system response
    setTimeout(() => {
        setMessages(prev => [...prev, { role: 'system', content: response }]);
    }, 500);
  };
  
  return (
    <div className="h-full w-full bg-[#0a0a0a] border-l border-white/10 p-6 flex flex-col text-slate-100 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-black font-mono text-emerald-400 tracking-tighter italic uppercase">City Assistant</h2>
            <button onClick={onClose} className="p-2 text-slate-500 hover:text-white transition-colors">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto mb-6 p-4 bg-black/40 rounded-2xl border border-white/5 font-mono text-xs leading-relaxed custom-scrollbar">
            {messages.map((m, i) => (
                <div key={i} className={`mb-3 ${m.role === 'user' ? 'text-blue-400 pl-2 border-l-2 border-blue-500/30' : 'text-emerald-400 pl-2 border-l-2 border-emerald-500/30'}`}>
                    <div className="text-[9px] uppercase font-black opacity-30 mb-1">{m.role}</div>
                    {m.content}
                </div>
            ))}
        </div>
        <div className="flex gap-2">
            <input 
                value={input} 
                onChange={e => setInput(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && send()}
                className="flex-1 bg-white/5 border-white/10 border p-3 rounded-xl font-mono text-slate-100 focus:outline-none focus:border-emerald-500 transition-all text-sm"
                placeholder="Ask something..."
            />
            <button onClick={send} className="px-6 py-3 bg-emerald-500 text-black rounded-xl hover:bg-white transition-all font-black uppercase tracking-widest text-[10px]">Send</button>
        </div>
    </div>
  );
}
