import React from 'react';
import { X } from 'lucide-react';

interface TextPopupProps {
  text: string;
  onClose: () => void;
}

const TextPopup: React.FC<TextPopupProps> = ({ text, onClose }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
        <div className="absolute inset-0" onPointerDown={onClose}></div>
        <div className="bg-surfaceLight border border-white/10 p-4 rounded-xl shadow-2xl max-w-[90vw] md:max-w-md pointer-events-auto animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Detected Text</span>
                <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full"><X size={16}/></button>
            </div>
            <div className="text-lg leading-relaxed select-text text-zinc-100 font-medium whitespace-pre-wrap">
                {text}
            </div>
        </div>
    </div>
  );
};

export default TextPopup;