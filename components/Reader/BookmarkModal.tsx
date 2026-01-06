
import React, { useState } from 'react';
// Fix: Import Language from i18n service where it is defined
import { Bookmark } from '../../types';
import { t, Language } from '../../services/i18n';
import { X, Trash2, Save } from 'lucide-react';

interface BookmarkModalProps {
  bookmark: Bookmark;
  language: Language;
  onSave: (bm: Bookmark) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const BookmarkModal: React.FC<BookmarkModalProps> = ({ bookmark, language, onSave, onDelete, onClose }) => {
  const [title, setTitle] = useState(bookmark.title || '');
  const [note, setNote] = useState(bookmark.note || '');
  const [color, setColor] = useState(bookmark.color);

  const colors: Bookmark['color'][] = ['blue', 'green', 'yellow', 'purple', 'red'];

  const handleSave = () => {
    onSave({
      ...bookmark,
      title: title.trim() || undefined,
      note: note.trim() || undefined,
      color
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-zinc-900/50">
            <h2 className="font-bold text-zinc-100">{t(language, 'editBookmark')}</h2>
            <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors"><X size={20}/></button>
        </div>
        
        <div className="p-5 space-y-4">
            <div className="flex items-center gap-3 bg-zinc-900/40 p-3 rounded-xl border border-white/5">
                <div className={`w-3 h-3 rounded-full ${
                    color === 'blue' ? 'bg-blue-500' : 
                    color === 'green' ? 'bg-green-500' : 
                    color === 'yellow' ? 'bg-yellow-500' : 
                    color === 'purple' ? 'bg-purple-500' : 'bg-red-500'
                }`} />
                <span className="text-sm font-medium text-zinc-300">Page {bookmark.pageIndex + 1}</span>
            </div>

            <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1.5 block px-1">{t(language, 'bookmarkTitle')}</label>
                <input 
                    type="text" 
                    value={title} 
                    onChange={e => setTitle(e.target.value)}
                    placeholder={`Page ${bookmark.pageIndex + 1}`}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors text-white"
                />
            </div>

            <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1.5 block px-1">{t(language, 'bookmarkNote')}</label>
                <textarea 
                    value={note} 
                    onChange={e => setNote(e.target.value)}
                    rows={3}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors text-white resize-none"
                />
            </div>

            <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500 mb-2 block px-1">{t(language, 'bookmarkColor')}</label>
                <div className="flex justify-between px-1">
                    {colors.map(c => (
                        <button 
                            key={c}
                            onClick={() => setColor(c)}
                            className={`w-8 h-8 rounded-full border-2 transition-all ${color === c ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'} ${
                                c === 'blue' ? 'bg-blue-500' : 
                                c === 'green' ? 'bg-green-500' : 
                                c === 'yellow' ? 'bg-yellow-500' : 
                                c === 'purple' ? 'bg-purple-500' : 'bg-red-500'
                            }`}
                        />
                    ))}
                </div>
            </div>
        </div>

        <div className="p-4 bg-zinc-900/50 border-t border-white/5 flex gap-3">
            <button 
                onClick={() => onDelete(bookmark.id)} 
                className="p-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                title={t(language, 'deleteBookmark')}
            >
                <Trash2 size={20}/>
            </button>
            <button 
                onClick={handleSave} 
                className="flex-1 py-3 bg-primary hover:bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
            >
                <Save size={18}/> {t(language, 'save')}
            </button>
        </div>
      </div>
    </div>
  );
};

export default BookmarkModal;
