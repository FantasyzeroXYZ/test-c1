

import React, { useState } from 'react';
import { Bookmark, ThemeMode } from '../../types';
import { t, Language } from '../../services/i18n';
import { X, Trash2, Save, Download, Crop, Plus, Eye, Edit3 } from 'lucide-react';

interface BookmarkModalProps {
  bookmark: Bookmark;
  language: Language;
  theme: ThemeMode;
  onSave: (bm: Bookmark) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onAddCrop: () => void;
  onDownloadCrop: (crop: {x:number, y:number, w:number, h:number}) => void;
  onPreviewCrop: (crop: {x:number, y:number, w:number, h:number}) => void;
}

const BookmarkModal: React.FC<BookmarkModalProps> = ({ 
    bookmark, language, theme, onSave, onDelete, onClose, onAddCrop, onDownloadCrop, onPreviewCrop 
}) => {
  // Use default title "Page X" if empty
  const [title, setTitle] = useState(bookmark.title || `Page ${bookmark.pageIndex + 1}`);
  const [note, setNote] = useState(bookmark.note || '');
  const [color, setColor] = useState(bookmark.color);
  
  // rangeInput holds the number of additional pages (0 means single page)
  const initialRange = bookmark.endPageIndex ? bookmark.endPageIndex - bookmark.pageIndex : 0;
  const [rangeInput, setRangeInput] = useState<string>(initialRange.toString());

  // Crop state
  const [localCrops, setLocalCrops] = useState(bookmark.crops || []);
  const [editingCropId, setEditingCropId] = useState<string | null>(null);
  const [editCropName, setEditCropName] = useState('');

  const colors: Bookmark['color'][] = ['blue', 'green', 'yellow', 'purple', 'red'];

  // Ensure all crops have IDs (legacy support)
  const getSafeCrops = () => {
      return localCrops.map((c, i) => ({
          ...c,
          id: c.id || `crop_${Date.now()}_${i}`
      }));
  };

  const handleSave = () => {
    const range = parseInt(rangeInput) || 0;
    const endIdx = range > 0 ? bookmark.pageIndex + range : undefined;

    onSave({
      ...bookmark,
      title: title.trim(),
      note: note.trim() || undefined,
      color,
      endPageIndex: endIdx,
      crops: getSafeCrops()
    });
  };

  const handleDeleteCrop = (cropId: string) => {
      setLocalCrops(prev => prev.filter(c => c.id !== cropId));
  };

  const startEditingCrop = (crop: any) => {
      setEditingCropId(crop.id);
      setEditCropName(crop.name || '');
  };

  const saveCropName = () => {
      if (editingCropId) {
          setLocalCrops(prev => prev.map(c => c.id === editingCropId ? { ...c, name: editCropName } : c));
          setEditingCropId(null);
      }
  };

  const currentRange = parseInt(rangeInput) || 0;
  const calculatedEndPage = bookmark.pageIndex + 1 + currentRange;

  // Theme styles
  const isLight = theme === 'light';
  const bgMain = isLight ? 'bg-white' : 'bg-surface';
  const bgSub = isLight ? 'bg-zinc-50' : 'bg-zinc-900/50';
  const border = isLight ? 'border-zinc-200' : 'border-white/10';
  const textMain = isLight ? 'text-zinc-900' : 'text-zinc-100';
  const textSub = isLight ? 'text-zinc-500' : 'text-zinc-400';
  const inputBg = isLight ? 'bg-zinc-100 text-zinc-900' : 'bg-black/40 text-white';
  const hoverBtn = isLight ? 'hover:bg-zinc-200' : 'hover:bg-white/10';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`${bgMain} border ${border} rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]`}>
        <div className={`p-4 border-b ${border} flex justify-between items-center ${bgSub} shrink-0`}>
            <h2 className={`font-bold ${textMain}`}>{t(language, 'editBookmark')}</h2>
            <button onClick={onClose} className={`p-1 rounded-full transition-colors ${textSub} ${hoverBtn}`}><X size={20}/></button>
        </div>
        
        <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar">
            
            {/* Title First */}
            <div>
                <label className={`text-[10px] uppercase font-bold mb-1.5 block px-1 ${textSub}`}>{t(language, 'bookmarkTitle')}</label>
                <input 
                    type="text" 
                    value={title} 
                    onChange={e => setTitle(e.target.value)}
                    placeholder={`Page ${bookmark.pageIndex + 1}`}
                    className={`w-full border ${border} rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors ${inputBg}`}
                />
            </div>

            {/* Page Info & Range on same line */}
            <div className="flex gap-2">
                <div className={`flex-1 flex items-center gap-3 p-2 rounded-xl border ${border} ${isLight ? 'bg-zinc-50' : 'bg-zinc-900/40'}`}>
                    <div className={`w-2 h-2 rounded-full ${
                        color === 'blue' ? 'bg-blue-500' : 
                        color === 'green' ? 'bg-green-500' : 
                        color === 'yellow' ? 'bg-yellow-500' : 
                        color === 'purple' ? 'bg-purple-500' : 'bg-red-500'
                    }`} />
                    <span className={`text-xs font-medium ${textMain}`}>Page {bookmark.pageIndex + 1}</span>
                </div>

                <div className="flex-1 flex items-center gap-2">
                    <input 
                        type="number" 
                        min="0"
                        value={rangeInput} 
                        onChange={e => setRangeInput(e.target.value)}
                        className={`w-16 text-center border ${border} rounded-xl px-2 py-2 text-sm outline-none focus:border-primary transition-colors ${inputBg}`}
                    />
                    <div className={`flex-1 p-2 rounded-xl border ${border} text-xs text-center ${inputBg}`}>
                       {calculatedEndPage}
                    </div>
                </div>
            </div>

            <div>
                <label className={`text-[10px] uppercase font-bold mb-1.5 block px-1 ${textSub}`}>{t(language, 'bookmarkNote')}</label>
                <textarea 
                    value={note} 
                    onChange={e => setNote(e.target.value)}
                    rows={3}
                    className={`w-full border ${border} rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors resize-none ${inputBg}`}
                />
            </div>

            <div>
                <label className={`text-[10px] uppercase font-bold mb-2 block px-1 ${textSub}`}>{t(language, 'bookmarkColor')}</label>
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

            {/* Image Crops Section */}
            <div>
                <div className="flex justify-between items-center mb-2 px-1">
                    <label className={`text-[10px] uppercase font-bold ${textSub}`}>{t(language, 'region')}</label>
                    <button onClick={onAddCrop} className="text-xs flex items-center gap-1 text-primary hover:text-opacity-80 transition-colors">
                        <Plus size={12}/> {t(language, 'addRegion')}
                    </button>
                </div>
                {localCrops.length > 0 ? (
                    <div className="space-y-2">
                        {localCrops.map((crop, idx) => (
                            <div key={crop.id || idx} className={`flex items-center justify-between p-2 rounded-lg border ${border} ${isLight ? 'bg-zinc-100' : 'bg-black/20'}`}>
                                {editingCropId === crop.id ? (
                                    <div className="flex-1 flex gap-1 mr-2">
                                        <input 
                                            value={editCropName}
                                            onChange={e => setEditCropName(e.target.value)}
                                            className={`flex-1 text-xs px-1 rounded border ${border} outline-none ${inputBg}`}
                                            autoFocus
                                            onKeyDown={e => e.key === 'Enter' && saveCropName()}
                                        />
                                        <button onClick={saveCropName} className="text-green-500"><Save size={14}/></button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 overflow-hidden flex-1 cursor-pointer" onClick={() => startEditingCrop(crop)}>
                                        <span className={`text-xs ${textSub} font-bold`}>#{idx + 1}</span>
                                        <span className={`text-xs truncate ${textMain}`}>{crop.name || t(language, 'region')}</span>
                                        <Edit3 size={10} className={`${textSub} opacity-50`} />
                                    </div>
                                )}
                                
                                <div className="flex gap-1 shrink-0">
                                    <button onClick={() => onPreviewCrop(crop)} className={`p-1.5 rounded transition-colors ${textSub} hover:text-primary hover:bg-black/5`} title={t(language, 'preview')}>
                                        <Eye size={14}/>
                                    </button>
                                    <button onClick={() => onDownloadCrop(crop)} className={`p-1.5 rounded transition-colors ${textSub} hover:text-primary hover:bg-black/5`} title={t(language, 'downloadCover')}>
                                        <Download size={14}/>
                                    </button>
                                    <button onClick={() => handleDeleteCrop(crop.id)} className={`p-1.5 rounded transition-colors ${textSub} hover:text-red-500 hover:bg-black/5`} title={t(language, 'delete')}>
                                        <Trash2 size={14}/>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className={`text-xs italic px-1 ${textSub}`}>{t(language, 'noRegions')}</p>
                )}
            </div>
        </div>

        <div className={`p-4 border-t ${border} ${bgSub} flex gap-3 shrink-0`}>
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