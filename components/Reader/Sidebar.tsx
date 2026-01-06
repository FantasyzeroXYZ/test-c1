
import React, { useState, useEffect, useRef } from 'react';
import { AnkiSettingsType, ReaderSettings, Book, Keybindings, Bookmark } from '../../types';
import { X, Eye, Highlighter, Database, Book as BookIcon, Monitor, Globe, Layout, ArrowRightLeft, ChevronDown, ChevronRight, Upload, Layers, MessageSquare, PanelBottom, Keyboard, RotateCcw, Check, Download, Mic, Cpu, Bookmark as BookmarkIcon, Edit3, Trash2, Settings, Loader2, RefreshCw, Wifi, Tag } from 'lucide-react';
import { getDecks, getModels, getModelFields } from '../../services/anki';
import { updateBookTranslatedFile, updateBookOffset, exportData } from '../../services/db';
import { OCR_LANGUAGES } from '../../services/ocr';
import { t } from '../../services/i18n';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  book?: Book;
  onBookUpdate?: () => void;
  showOcr: boolean;
  setShowOcr: (v: boolean) => void;
  ankiSettings: AnkiSettingsType;
  setAnkiSettings: (s: AnkiSettingsType) => void;
  readerSettings: ReaderSettings;
  setReaderSettings: (s: ReaderSettings) => void;
  bookmarks?: Bookmark[];
  onJumpToPage?: (idx: number) => void;
  onEditBookmark?: (bm: Bookmark) => void;
  onDeleteBookmark?: (id: string) => void;
}

const Section: React.FC<{ 
    title: string; 
    children: React.ReactNode;
    defaultOpen?: boolean;
    icon?: React.ReactNode;
}> = ({ title, children, defaultOpen = false, icon }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="mb-4 border-b border-white/5 last:border-0 pb-4">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 px-1 hover:text-zinc-300">
                <div className="flex items-center gap-2">
                    {icon}
                    {title}
                </div>
                {isOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
            </button>
            {isOpen && <div className="space-y-3 animate-in slide-in-from-top-1">{children}</div>}
        </div>
    );
};

const Toggle: React.FC<{ label: string; checked: boolean; onChange: () => void; icon?: React.ReactNode }> = ({ label, checked, onChange, icon }) => (
    <button onClick={onChange} className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all duration-200 ${checked ? 'bg-primary/10 border-primary/50 text-primary' : 'bg-surfaceLight border-transparent hover:bg-white/5 text-zinc-400'}`}>
        <div className="flex items-center gap-3">
            {icon}
            <span className="text-sm font-medium">{label}</span>
        </div>
        <div className={`w-10 h-5 rounded-full relative transition-colors ${checked ? 'bg-primary' : 'bg-zinc-700'}`}>
             <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all shadow-sm ${checked ? 'left-6' : 'left-1'}`} />
        </div>
    </button>
);

const Sidebar: React.FC<SidebarProps> = ({
    isOpen, onClose, book, onBookUpdate, showOcr, setShowOcr, ankiSettings, setAnkiSettings, readerSettings, setReaderSettings, bookmarks, onJumpToPage, onEditBookmark, onDeleteBookmark
}) => {
    const [recordingKey, setRecordingKey] = useState<keyof Keybindings | null>(null);
    const [offsetInput, setOffsetInput] = useState(book?.pageOffset || 0);
    const [loadingAnki, setLoadingAnki] = useState(false);
    const [decks, setDecks] = useState<string[]>([]);
    const [models, setModels] = useState<string[]>([]);
    const [fields, setFields] = useState<string[]>([]);
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

    useEffect(() => {
        const loadVoices = () => {
            setVoices(window.speechSynthesis.getVoices());
        };
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
        return () => { window.speechSynthesis.onvoiceschanged = null; };
    }, []);

    // Gamepad Poll for Recording
    useEffect(() => {
        if (!recordingKey) return;
        let rafId: number;
        
        const handleInputRecord = (inputName: string) => {
            setReaderSettings({
                ...readerSettings,
                keybindings: {
                    ...readerSettings.keybindings,
                    [recordingKey]: [inputName] // Replace, don't append for simplicity in recording UI
                }
            });
            setRecordingKey(null);
        };

        const pollRecording = () => {
            const gamepads = navigator.getGamepads();
            for (const gp of gamepads) {
                if (!gp) continue;
                // Check buttons
                for (let i = 0; i < gp.buttons.length; i++) {
                    if (gp.buttons[i].pressed) {
                        handleInputRecord(`GP_Btn_${i}`);
                        return; // Stop polling once found
                    }
                }
                // Check axes (threshold 0.5)
                for (let i = 0; i < gp.axes.length; i++) {
                    if (gp.axes[i] < -0.5) {
                        handleInputRecord(`GP_Axis_${i}_-`);
                        return;
                    }
                    if (gp.axes[i] > 0.5) {
                        handleInputRecord(`GP_Axis_${i}_+`);
                        return;
                    }
                }
            }
            rafId = requestAnimationFrame(pollRecording);
        };
        rafId = requestAnimationFrame(pollRecording);
        return () => cancelAnimationFrame(rafId);
    }, [recordingKey, readerSettings, setReaderSettings]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (recordingKey) {
                e.preventDefault();
                e.stopPropagation();
                setReaderSettings({
                    ...readerSettings,
                    keybindings: {
                        ...readerSettings.keybindings,
                        [recordingKey]: [e.key]
                    }
                });
                setRecordingKey(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [recordingKey, readerSettings, setReaderSettings]);


    const handleTestAnki = async () => {
        setLoadingAnki(true);
        try {
            const d = await getDecks(ankiSettings);
            const m = await getModels(ankiSettings);
            setDecks(d);
            setModels(m);
            if(m.length > 0 && !ankiSettings.noteType) setAnkiSettings({...ankiSettings, noteType: m[0]});
            alert(t(readerSettings.language, 'connectionSuccess'));
        } catch (e) {
            alert(t(readerSettings.language, 'connectionFailed'));
        } finally {
            setLoadingAnki(false);
        }
    };

    useEffect(() => {
        if (decks.length > 0 && ankiSettings.noteType) {
            getModelFields(ankiSettings.noteType, ankiSettings).then(setFields).catch(console.error);
        }
    }, [ankiSettings.noteType, decks]);

    const handleOffsetChange = async () => {
        if (book) {
            await updateBookOffset(book.id, offsetInput);
            if (onBookUpdate) onBookUpdate();
        }
    };

    const handleTransUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (book && e.target.files && e.target.files[0]) {
            await updateBookTranslatedFile(book.id, e.target.files[0]);
            if (onBookUpdate) onBookUpdate();
        }
    };

    const formatKey = (k: string) => {
        if (k === ' ') return 'Space';
        if (k.startsWith('Arrow')) return k.replace('Arrow', '');
        if (k.startsWith('GP_Btn_')) return `Gamepad ${k.split('_')[2]}`;
        if (k.startsWith('GP_Axis_')) return `Axis ${k.split('_')[2]} ${k.split('_')[3]}`;
        return k.toUpperCase();
    };

    return (
        <div className={`fixed inset-y-0 right-0 w-80 bg-surface/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-[100] transition-transform duration-300 flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/20">
                <h2 className="font-bold flex items-center gap-2 text-zinc-100"><Layout size={18}/> {t(readerSettings.language, 'settings')}</h2>
                <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white"><X size={20}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {book && (
                    <Section title={t(readerSettings.language, 'bookDetails')} icon={<BookIcon size={14}/>} defaultOpen>
                        <div className="bg-surfaceLight/50 rounded-xl p-3 border border-white/5 space-y-3">
                             <div>
                                <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1 block">{t(readerSettings.language, 'translation')}</label>
                                <div className="flex gap-2">
                                    <label className="flex-1 flex items-center justify-center gap-2 p-2 bg-black/40 hover:bg-white/5 border border-white/10 rounded-lg cursor-pointer text-xs font-medium text-zinc-300 transition-colors">
                                        <Upload size={14}/> {t(readerSettings.language, 'uploadTrans')}
                                        <input type="file" className="hidden" accept=".zip,.cbz" onChange={handleTransUpload} />
                                    </label>
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1 block">{t(readerSettings.language, 'pageOffset')}</label>
                                <div className="flex gap-2">
                                    <input type="number" value={offsetInput} onChange={e => setOffsetInput(parseInt(e.target.value) || 0)} className="w-20 bg-black/40 border border-white/10 rounded-lg px-2 text-sm" />
                                    <button onClick={handleOffsetChange} className="flex-1 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg text-xs font-bold transition-colors">{t(readerSettings.language, 'update')}</button>
                                </div>
                                <p className="text-[10px] text-zinc-500 mt-1">{t(readerSettings.language, 'pageOffsetDesc')}</p>
                            </div>
                        </div>
                    </Section>
                )}

                {book && bookmarks && bookmarks.length > 0 && (
                    <Section title={t(readerSettings.language, 'bookmarks')} icon={<BookmarkIcon size={14}/>} defaultOpen>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                            {bookmarks.map(bm => (
                                <div key={bm.id} className="flex items-center justify-between p-2 bg-black/20 rounded-lg border border-white/5 hover:border-white/10 group">
                                    <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => { if(onJumpToPage) onJumpToPage(bm.pageIndex); }}>
                                        <div className={`w-2 h-2 rounded-full ${
                                            bm.color === 'blue' ? 'bg-blue-500' : 
                                            bm.color === 'green' ? 'bg-green-500' : 
                                            bm.color === 'yellow' ? 'bg-yellow-500' : 
                                            bm.color === 'purple' ? 'bg-purple-500' : 'bg-red-500'
                                        }`} />
                                        <div className="flex flex-col">
                                            <span className="text-xs font-medium text-zinc-200">{bm.title || `Page ${bm.pageIndex + 1}`}</span>
                                            {bm.note && <span className="text-[10px] text-zinc-500 truncate max-w-[140px]">{bm.note}</span>}
                                        </div>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => onEditBookmark?.(bm)} className="p-1 text-zinc-400 hover:text-white"><Edit3 size={12}/></button>
                                        <button onClick={() => onDeleteBookmark?.(bm.id)} className="p-1 text-zinc-400 hover:text-red-400"><Trash2 size={12}/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Section>
                )}
                
                <Section title={t(readerSettings.language, 'display')} icon={<Monitor size={14}/>}>
                    <div className="space-y-3">
                         <Toggle label={t(readerSettings.language, 'showOcr')} checked={showOcr} onChange={() => setShowOcr(!showOcr)} icon={<Eye size={16}/>} />
                         <Toggle label={t(readerSettings.language, 'useLiveOcr')} checked={readerSettings.useLiveOcr} onChange={() => setReaderSettings({...readerSettings, useLiveOcr: !readerSettings.useLiveOcr})} icon={<Cpu size={16}/>} />
                         
                         {readerSettings.useLiveOcr && (
                            <div>
                                <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1.5 block px-1">{t(readerSettings.language, 'ocrLanguage')}</label>
                                <select 
                                    value={readerSettings.tesseractLanguage} 
                                    onChange={(e) => setReaderSettings({...readerSettings, tesseractLanguage: e.target.value})}
                                    className="w-full bg-surfaceLight border border-transparent hover:border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary"
                                >
                                    {OCR_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                                </select>
                            </div>
                         )}

                         <div>
                            <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1.5 block px-1">{t(readerSettings.language, 'overlayStyle')}</label>
                            <div className="grid grid-cols-3 gap-2">
                                {['hidden', 'outline', 'fill'].map(style => (
                                    <button 
                                        key={style}
                                        onClick={() => setReaderSettings({...readerSettings, overlayStyle: style as any})}
                                        className={`py-2 text-[10px] uppercase font-bold rounded-lg border transition-all ${readerSettings.overlayStyle === style ? 'bg-primary border-primary text-white shadow-lg' : 'bg-surfaceLight border-transparent text-zinc-500 hover:text-zinc-300'}`}
                                    >
                                        {style === 'hidden' ? t(readerSettings.language, 'styleHidden').split(' ')[0] : 
                                         style === 'outline' ? t(readerSettings.language, 'styleOutline').split(' ')[0] : 
                                         t(readerSettings.language, 'styleFill').split(' ')[0]}
                                    </button>
                                ))}
                            </div>
                         </div>
                    </div>
                </Section>

                <Section title={t(readerSettings.language, 'reading')} icon={<BookIcon size={14}/>}>
                     <div className="space-y-4">
                        <div>
                            <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1.5 block px-1">{t(readerSettings.language, 'viewMode')}</label>
                            <div className="flex bg-surfaceLight p-1 rounded-xl">
                                <button onClick={() => setReaderSettings({...readerSettings, pageViewMode: 'single'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${readerSettings.pageViewMode === 'single' ? 'bg-zinc-700 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}>{t(readerSettings.language, 'singlePage')}</button>
                                <button onClick={() => setReaderSettings({...readerSettings, pageViewMode: 'double'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${readerSettings.pageViewMode === 'double' ? 'bg-zinc-700 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}>{t(readerSettings.language, 'doublePage')}</button>
                                <button onClick={() => setReaderSettings({...readerSettings, pageViewMode: 'webtoon'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${readerSettings.pageViewMode === 'webtoon' ? 'bg-zinc-700 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}>{t(readerSettings.language, 'webtoonMode')}</button>
                            </div>
                        </div>

                         <div>
                            <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1.5 block px-1">{t(readerSettings.language, 'direction')}</label>
                            <div className="flex bg-surfaceLight p-1 rounded-xl">
                                <button onClick={() => setReaderSettings({...readerSettings, readingDirection: 'ltr'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${readerSettings.readingDirection === 'ltr' ? 'bg-zinc-700 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}>{t(readerSettings.language, 'ltr')}</button>
                                <button onClick={() => setReaderSettings({...readerSettings, readingDirection: 'rtl'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${readerSettings.readingDirection === 'rtl' ? 'bg-zinc-700 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}>{t(readerSettings.language, 'rtl')}</button>
                            </div>
                        </div>

                        <Toggle label={t(readerSettings.language, 'enableCompare')} checked={readerSettings.compareMode} onChange={() => setReaderSettings({...readerSettings, compareMode: !readerSettings.compareMode})} icon={<ArrowRightLeft size={16}/>} />
                        
                        {readerSettings.compareMode && readerSettings.pageViewMode === 'double' && (
                             <div>
                                <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1.5 block px-1">{t(readerSettings.language, 'comparisonLayout')}</label>
                                <div className="grid grid-cols-1 gap-2">
                                    <button onClick={() => setReaderSettings({...readerSettings, comparisonLayout: 'standard'})} className={`w-full py-2 px-3 text-xs font-bold rounded-lg border text-left transition-all ${readerSettings.comparisonLayout === 'standard' ? 'bg-primary/20 border-primary text-primary' : 'bg-surfaceLight border-transparent text-zinc-500 hover:text-zinc-300'}`}>
                                        {t(readerSettings.language, 'standardLayout')}
                                    </button>
                                    <button onClick={() => setReaderSettings({...readerSettings, comparisonLayout: 'swapped'})} className={`w-full py-2 px-3 text-xs font-bold rounded-lg border text-left transition-all ${readerSettings.comparisonLayout === 'swapped' ? 'bg-primary/20 border-primary text-primary' : 'bg-surfaceLight border-transparent text-zinc-500 hover:text-zinc-300'}`}>
                                        {t(readerSettings.language, 'swappedLayout')}
                                    </button>
                                </div>
                            </div>
                        )}
                     </div>
                </Section>

                <Section title={t(readerSettings.language, 'shortcuts')} icon={<Keyboard size={14}/>}>
                     {recordingKey && (
                         <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center cursor-pointer" onClick={() => setRecordingKey(null)}>
                             <div className="bg-surface p-6 rounded-2xl border border-white/10 shadow-2xl animate-in zoom-in-95 text-center">
                                 <Keyboard size={48} className="mx-auto text-primary mb-4 animate-pulse" />
                                 <h3 className="text-xl font-bold mb-2">{t(readerSettings.language, 'pressKey')}</h3>
                                 <p className="text-zinc-400 text-sm">Keyboard key or Gamepad button/axis</p>
                             </div>
                         </div>
                     )}
                     <div className="space-y-2">
                         {Object.entries(readerSettings.keybindings).map(([action, keys]) => (
                             <div key={action} className="flex items-center justify-between p-2 bg-surfaceLight rounded-lg border border-white/5">
                                 <span className="text-xs font-medium text-zinc-400 capitalize">{t(readerSettings.language, action as any)}</span>
                                 <div className="flex gap-2">
                                     {keys.map((k, i) => (
                                         <span key={i} className="px-2 py-1 bg-black/40 rounded text-[10px] font-mono border border-white/10 text-zinc-300">{formatKey(k)}</span>
                                     ))}
                                     <button onClick={() => setRecordingKey(action as any)} className="p-1 hover:bg-white/10 rounded text-primary hover:text-white transition-colors"><Edit3 size={12}/></button>
                                 </div>
                             </div>
                         ))}
                         <button 
                            onClick={() => setReaderSettings({...readerSettings, keybindings: { nextPage: ['ArrowRight', ' '], prevPage: ['ArrowLeft'], toggleMenu: ['m'], fullscreen: ['f'] }})}
                            className="w-full py-2 text-xs font-bold text-zinc-500 hover:text-zinc-300 flex items-center justify-center gap-2 mt-2"
                        >
                            <RotateCcw size={12}/> {t(readerSettings.language, 'resetKeys')}
                        </button>
                     </div>
                </Section>

                <Section title={t(readerSettings.language, 'general')} icon={<Settings size={14}/>}>
                     <div className="space-y-4">
                        <div>
                            <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1.5 block px-1">{t(readerSettings.language, 'language')}</label>
                            <div className="flex bg-surfaceLight p-1 rounded-xl">
                                <button onClick={() => setReaderSettings({...readerSettings, language: 'zh'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${readerSettings.language === 'zh' ? 'bg-zinc-700 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}>中文</button>
                                <button onClick={() => setReaderSettings({...readerSettings, language: 'en'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${readerSettings.language === 'en' ? 'bg-zinc-700 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}>English</button>
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1.5 block px-1">{t(readerSettings.language, 'dictionaryLanguage')}</label>
                            <select 
                                value={readerSettings.dictionaryLanguage || 'en'} 
                                onChange={(e) => setReaderSettings({...readerSettings, dictionaryLanguage: e.target.value as any})}
                                className="w-full bg-surfaceLight border border-transparent hover:border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary text-zinc-300"
                            >
                                <option value="en">English (EN)</option>
                                <option value="zh">Chinese (ZH)</option>
                                <option value="ja">Japanese (JP)</option>
                                <option value="es">Spanish (ES)</option>
                                <option value="fr">French (FR)</option>
                                <option value="ru">Russian (RU)</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1.5 block px-1">{t(readerSettings.language, 'dictionaryMode')}</label>
                            <div className="flex bg-surfaceLight p-1 rounded-xl">
                                <button onClick={() => setReaderSettings({...readerSettings, dictionaryMode: 'panel'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${readerSettings.dictionaryMode === 'panel' ? 'bg-zinc-700 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}>{t(readerSettings.language, 'dictPanel')}</button>
                                <button onClick={() => setReaderSettings({...readerSettings, dictionaryMode: 'popup'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${readerSettings.dictionaryMode === 'popup' ? 'bg-zinc-700 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}>{t(readerSettings.language, 'dictPopup')}</button>
                            </div>
                        </div>

                         <div>
                            <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1.5 block px-1">{t(readerSettings.language, 'ttsVoice')}</label>
                            <select 
                                value={readerSettings.ttsVoiceURI} 
                                onChange={(e) => setReaderSettings({...readerSettings, ttsVoiceURI: e.target.value})}
                                className="w-full bg-surfaceLight border border-transparent hover:border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary text-zinc-300"
                            >
                                <option value="">Default</option>
                                {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
                            </select>
                        </div>

                        <button onClick={() => exportData(readerSettings)} className="w-full py-2 bg-surfaceLight hover:bg-white/5 border border-white/5 rounded-xl text-xs font-bold text-zinc-300 flex items-center justify-center gap-2">
                            <Download size={14}/> {t(readerSettings.language, 'exportData')}
                        </button>
                     </div>
                </Section>

                <Section title={t(readerSettings.language, 'anki')} icon={<Database size={14}/>}>
                     <div className="space-y-3">
                         <div className="grid grid-cols-3 gap-2">
                             <div className="col-span-2">
                                <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1 block">{t(readerSettings.language, 'ip')}</label>
                                <input type="text" value={ankiSettings.ip} onChange={e => setAnkiSettings({...ankiSettings, ip: e.target.value})} className="w-full bg-surfaceLight border border-transparent focus:border-primary rounded-lg px-2 py-1.5 text-xs" />
                             </div>
                             <div>
                                <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1 block">{t(readerSettings.language, 'port')}</label>
                                <input type="text" value={ankiSettings.port} onChange={e => setAnkiSettings({...ankiSettings, port: e.target.value})} className="w-full bg-surfaceLight border border-transparent focus:border-primary rounded-lg px-2 py-1.5 text-xs" />
                             </div>
                         </div>
                         <button onClick={handleTestAnki} disabled={loadingAnki} className="w-full py-2 bg-primary/20 hover:bg-primary/30 text-primary rounded-xl text-xs font-bold flex items-center justify-center gap-2">
                             {loadingAnki ? <Loader2 className="animate-spin" size={14}/> : <Wifi size={14}/>} {t(readerSettings.language, 'testConnection')}
                         </button>

                         {decks.length > 0 && (
                             <div className="space-y-3 pt-2 border-t border-white/5 animate-in slide-in-from-top-2">
                                 <div>
                                    <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1 block">{t(readerSettings.language, 'deck')}</label>
                                    <select value={ankiSettings.deck} onChange={e => setAnkiSettings({...ankiSettings, deck: e.target.value})} className="w-full bg-surfaceLight rounded-lg px-2 py-1.5 text-xs outline-none focus:border-primary border border-transparent">
                                        {decks.map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                 </div>
                                 <div>
                                    <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1 block">{t(readerSettings.language, 'noteType')}</label>
                                    <select value={ankiSettings.noteType} onChange={e => setAnkiSettings({...ankiSettings, noteType: e.target.value})} className="w-full bg-surfaceLight rounded-lg px-2 py-1.5 text-xs outline-none focus:border-primary border border-transparent">
                                        {models.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                 </div>
                                 <div>
                                     <label className="text-[10px] uppercase font-bold text-zinc-500 mb-2 block">{t(readerSettings.language, 'fieldMapping')}</label>
                                     <div className="space-y-2 pl-2 border-l border-white/10">
                                        <div className="grid grid-cols-3 items-center gap-2">
                                            <span className="text-[10px] text-zinc-400">Word</span>
                                            <select value={ankiSettings.wordField} onChange={e => setAnkiSettings({...ankiSettings, wordField: e.target.value})} className="col-span-2 bg-black/20 rounded px-2 py-1 text-[10px] border border-white/5">
                                                <option value="">(None)</option>
                                                {fields.map(f => <option key={f} value={f}>{f}</option>)}
                                            </select>
                                        </div>
                                        <div className="grid grid-cols-3 items-center gap-2">
                                            <span className="text-[10px] text-zinc-400">Sentence</span>
                                            <select value={ankiSettings.sentenceField} onChange={e => setAnkiSettings({...ankiSettings, sentenceField: e.target.value})} className="col-span-2 bg-black/20 rounded px-2 py-1 text-[10px] border border-white/5">
                                                <option value="">(None)</option>
                                                {fields.map(f => <option key={f} value={f}>{f}</option>)}
                                            </select>
                                        </div>
                                        <div className="grid grid-cols-3 items-center gap-2">
                                            <span className="text-[10px] text-zinc-400">Meaning</span>
                                            <select value={ankiSettings.meaningField} onChange={e => setAnkiSettings({...ankiSettings, meaningField: e.target.value})} className="col-span-2 bg-black/20 rounded px-2 py-1 text-[10px] border border-white/5">
                                                <option value="">(None)</option>
                                                {fields.map(f => <option key={f} value={f}>{f}</option>)}
                                            </select>
                                        </div>
                                        <div className="grid grid-cols-3 items-center gap-2">
                                            <span className="text-[10px] text-zinc-400">Audio</span>
                                            <select value={ankiSettings.audioField} onChange={e => setAnkiSettings({...ankiSettings, audioField: e.target.value})} className="col-span-2 bg-black/20 rounded px-2 py-1 text-[10px] border border-white/5">
                                                <option value="">(None)</option>
                                                {fields.map(f => <option key={f} value={f}>{f}</option>)}
                                            </select>
                                        </div>
                                     </div>
                                 </div>
                                 <div>
                                    <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1 block">{t(readerSettings.language, 'tags')}</label>
                                    <div className="flex items-center gap-2 bg-surfaceLight rounded-lg px-2 py-1 border border-transparent focus-within:border-primary">
                                        <Tag size={12} className="text-zinc-500"/>
                                        <input type="text" value={ankiSettings.tags} onChange={e => setAnkiSettings({...ankiSettings, tags: e.target.value})} className="w-full bg-transparent text-xs outline-none" placeholder="tag1, tag2" />
                                    </div>
                                 </div>
                             </div>
                         )}
                     </div>
                </Section>
            </div>
        </div>
    );
};

export default Sidebar;
