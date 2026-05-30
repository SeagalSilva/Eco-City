import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  titleColor?: string;
}

export default function BaseModal({ isOpen, onClose, title, children, titleColor = 'text-cyan-400' }: BaseModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] w-full max-w-lg p-8 shadow-2xl relative overflow-y-auto max-h-[90vh] custom-scrollbar">
        <div className="absolute top-0 right-0 p-4">
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">&times; Close</button>
        </div>
        <h3 className={`text-2xl font-black font-mono ${titleColor} tracking-tight uppercase italic mb-6`}>
            {title}
        </h3>
        {children}
      </div>
    </div>,
    document.body
  );
}
