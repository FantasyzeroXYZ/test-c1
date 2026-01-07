
import React, { useState, useEffect } from 'react';
import { AnkiSettingsType, ReaderSettings, Book, Keybindings, Bookmark, WebSearchEngine } from '../../types';
import { X, Eye, Book as BookIcon, Monitor, Globe, Layout, ArrowRightLeft, ChevronDown, ChevronRight, Upload, Keyboard, RotateCcw, Download, Mic, Database, Wifi, Tag, Sun, Moon, Edit3, Trash2, Settings, Loader2, Save, Bookmark as BookmarkIcon } from 'lucide-react';
import { getDecks, getModels, getModelFields } from '../../services/anki';
import { updateBookTranslatedFile, updateBookOffset, exportData } from '../../services/db';
import { t } from '../../services/i18n';
import { OCR_LANGUAGES } from '../../services/ocr';

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
    theme: 'light' | 'dark';
}> = ({ title, children, defaultOpen = false, icon, theme }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const textColor = theme === 'light' ? 'text-zinc-600' : 'text-zinc-500';
    const hoverColor = theme === 'light' ? 'hover:text-zinc-800' : 'hover:text-zinc-300';
    const borderColor = theme === 'light' ? 'border-zinc-200' : 'border-white/5';

    return (
        <div className={`mb-4 border-b ${borderColor} last:border-0 pb-4`}>
            <button onClick={() => setIsOpen(!isOpen)} className={`w-full flex items-center justify-between text-xs font-bold ${textColor} uppercase tracking-wider mb-2 px-1 ${hoverColor}`}>
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

const Toggle: React.FC<{ label: string; checked: boolean; onChange: () => void; icon?: React.ReactNode; theme: 'light' | 'dark' }> = ({ label, checked, onChange, icon, theme }) => {
    const bgColor = theme === 'light' ? 'bg-zinc-100' : 'bg-surfaceLight';
    const hoverColor = theme === 'light' ? 'hover:bg-zinc-200' : 'hover:bg-white/5';
    const textColor = theme === 'light' ? 'text-zinc-700' : 'text-zinc-400';
    
    return (
    <button onClick={onChange} className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all duration-200 ${checked ? 'bg-primary/10 border-primary/50 text-primary' : `${bgColor} border-transparent ${hoverColor} ${textColor}`}`}>
        <div className="flex items-center gap-3">
            {icon}
            <span className="text-sm font-medium">{label}</span>
        </div>
        <div className={`w-10 h-5 rounded-full relative transition-colors ${checked ? 'bg-primary' : 'bg-zinc-500'}`}>
             <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all shadow-sm ${checked ? 'left-6' : 'left-1'}`} />
        </div>
    </button>
)};

const Sidebar: React.FC<SidebarProps> = ({
    isOpen, onClose, book, onBookUpdate, showOcr, setShowOcr, ankiSettings, setAnkiSettings, readerSettings, setReaderSettings, bookmarks, onJumpToPage, onEditBookmark, onDeleteBookmark
}) => {
    const [recordingKey, setRecordingKey] = useState<keyof Keybindings | null>(null);
    const [offsetInput, setOffsetInput] = useState(book?.pageOffset || 0);
    const [loadingAnki, setLoadingAnki] = useState(false);
    // Add state to track if connection has been manually verified
    const [isAnkiConnected, setIsAnkiConnected] = useState(false);
    
    const [decks, setDecks] = useState<string[]>([]);
    const [models, setModels] = useState<string[]>([]);
    const [fields, setFields] = useState<string[]>([]);
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    
    // Search Engine Logic
    const isTrans = ['bing_trans', 'deepl', 'baidu_trans', 'youdao_trans'].includes(readerSettings.webSearchEngine);
    const [searchCategory, setSearchCategory] = useState<'search' | 'translate'>(isTrans ? 'translate' : 'search');

    useEffect(() => {
        const isNowTrans = ['bing_trans', 'deepl', 'baidu_trans', 'youdao_trans'].includes(readerSettings.webSearchEngine);
        setSearchCategory(isNowTrans ? 'translate' : 'search');
    }, [readerSettings.webSearchEngine]);

    useEffect(() => {
        const loadVoices = () => {
            setVoices(window.speechSynthesis.getVoices());
        };
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
        return () => { window.speechSynthesis.onvoiceschanged = null; };
    }, []);

    // Keep exact logic for key recording to avoid breaking changes
    useEffect(() => {
        if (!recordingKey) return;
        let rafId: number;
        const handleInputRecord = (inputName: string) => {
            setReaderSettings({ ...readerSettings, keybindings: { ...readerSettings.keybindings, [recordingKey]: [inputName] } });
            setRecordingKey(null);
        };
        const pollRecording = () => {
            const gamepads = navigator.getGamepads();
            for (const gp of gamepads) {
                if (!gp) continue;
                for (let i = 0; i < gp.buttons.length; i++) { if (gp.buttons[i].pressed) { handleInputRecord(`GP_Btn_${i}`); return; } }
                for (let i = 0; i < gp.axes.length; i++) {
                    if (gp.axes[i] < -0.5) { handleInputRecord(`GP_Axis_${i}_-`); return; }
                    if (gp.axes[i] > 0.5) { handleInputRecord(`GP_Axis_${i}_+`); return; }
                }
            }
            rafId = requestAnimationFrame(pollRecording);
        };
        rafId = requestAnimationFrame(pollRecording);
        return () => cancelAnimationFrame(rafId);
    }, [recordingKey, readerSettings, setReaderSettings]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (recordingKey) { e.preventDefault(); e.stopPropagation(); setReaderSettings({ ...readerSettings, keybindings: { ...readerSettings.keybindings, [recordingKey]: [e.key] } }); setRecordingKey(null); }
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
            setIsAnkiConnected(true);
            
            // Auto-select if current is invalid or empty to ensure fields load
            let newSettings = { ...ankiSettings };
            let changed = false;
            
            if (d.length > 0 && (!newSettings.deck || !d.includes(newSettings.deck))) {
                newSettings.deck = d[0];
                changed = true;
            }
            
            if (m.length > 0 && (!newSettings.noteType || !m.includes(newSettings.noteType))) {
                newSettings.noteType = m[0];
                changed = true;
            }
            
            if (changed) {
                setAnkiSettings(newSettings);
            }
        } catch (e) {
            setIsAnkiConnected(false);
            alert(t(readerSettings.language, 'connectionFailed'));
        } finally {
            setLoadingAnki(false);
        }
    };
    
    // Only load model fields when connected and model changes
    useEffect(() => {
        if(ankiSettings.noteType && isAnkiConnected) {
            setFields([]); // Clear fields while loading
            getModelFields(ankiSettings.noteType, ankiSettings).then(setFields).catch(() => {});
        }
    }, [ankiSettings.noteType, isAnkiConnected]);

    const handleOffsetChange = async () => {
        if (book) { await updateBookOffset(book.id, offsetInput); if (onBookUpdate) onBookUpdate(); }
    };

    const handleTransUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (book && e.target.files && e.target.files[0]) { await updateBookTranslatedFile(book.id, e.target.files[0]); if (onBookUpdate) onBookUpdate(); }
    };

    const formatKey = (k: string) => {
        if (k === ' ') return 'Space';
        if (k.startsWith('Arrow')) return k.replace('Arrow', '');
        if (k.startsWith('GP_Btn_')) return `Gamepad ${k.split('_')[2]}`;
        if (k.startsWith('GP_Axis_')) return `Axis ${k.split('_')[2]} ${k.split('_')[3]}`;
        return k.toUpperCase();
    };

    const theme = readerSettings.theme;
    const isLight = theme === 'light';
    const bgClass = isLight ? 'bg-white/95 border-zinc-200' : 'bg-surface/95 border-white/10';
    const textMain = isLight ? 'text-zinc-800' : 'text-zinc-100';
    const textSub = isLight ? 'text-zinc-500' : 'text-zinc-400';
    const inputBg = isLight ? 'bg-zinc-100 border-zinc-200' : 'bg-black/40 border-white/10';
    const itemBg = isLight ? 'bg-zinc-100' : 'bg-surfaceLight';
    const itemHover = isLight ? 'hover:bg-zinc-200' : 'hover:bg-white/5';

    return (
        <div className={`fixed inset-y-0 right-0 w-80 backdrop-blur-xl border-l shadow-2xl z-[100] transition-transform duration-300 flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'} ${bgClass}`}>
            <div className={`p-4 border-b flex items-center justify-between ${isLight ? 'bg-zinc-50/50 border-zinc-200' : 'bg-black/20 border-white/10'}`}>
                <h2 className={`font-bold flex items-center gap-2 ${textMain}`}><Layout size={18}/> {t(readerSettings.language, 'settings')}</h2>
                <button onClick={onClose} className={`p-2 rounded-full ${textSub} ${itemHover}`}><X size={20}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-current scrollbar-track-transparent">
                {book && (
                    <Section title={t(readerSettings.language, 'bookDetails')} icon={<BookIcon size={14}/>} theme={theme}>
                        <div className={`rounded-xl p-3 border space-y-3 ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-surfaceLight/50 border-white/5'}`}>
                             <div>
                                <label className={`text-[10px] uppercase font-bold mb-1 block ${textSub}`}>{t(readerSettings.language, 'translation')}</label>
                                <div className="flex gap-2">
                                    <label className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg cursor-pointer text-xs font-medium transition-colors border ${inputBg} ${itemHover} ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
                                        <Upload size={14}/> {t(readerSettings.language, 'uploadTrans')}
                                        <input type="file" className="hidden" accept=".zip,.cbz" onChange={handleTransUpload} />
                                    </label>
                                </div>
                            </div>
                            
                            <div>
                                <label className={`text-[10px] uppercase font-bold mb-1 block ${textSub}`}>{t(readerSettings.language, 'pageOffset')}</label>
                                <div className="flex gap-2">
                                    <input type="number" value={offsetInput} onChange={e => setOffsetInput(parseInt(e.target.value) || 0)} className={`w-20 rounded-lg px-2 text-sm border ${inputBg}`} />
                                    <button onClick={handleOffsetChange} className="flex-1 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg text-xs font-bold transition-colors">{t(readerSettings.language, 'update')}</button>
                                </div>
                                <p className={`text-[10px] mt-1 ${textSub}`}>{t(readerSettings.language, 'pageOffsetDesc')}</p>
                            </div>
                        </div>
                    </Section>
                )}

                {book && bookmarks && bookmarks.length > 0 && (
                    <Section title={t(readerSettings.language, 'bookmarks')} icon={<BookmarkIcon size={14}/>} theme={theme}>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                            {bookmarks.map(bm => (
                                <div key={bm.id} className={`flex items-center justify-between p-2 rounded-lg border group ${isLight ? 'bg-zinc-50 border-zinc-200 hover:border-zinc-300' : 'bg-black/20 border-white/5 hover:border-white/10'}`}>
                                    <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => { if(onJumpToPage) onJumpToPage(bm.pageIndex); }}>
                                        <div className={`w-2 h-2 rounded-full ${
                                            bm.color === 'blue' ? 'bg-blue-500' : 
                                            bm.color === 'green' ? 'bg-green-500' : 
                                            bm.color === 'yellow' ? 'bg-yellow-500' : 
                                            bm.color === 'purple' ? 'bg-purple-500' : 'bg-red-500'
                                        }`} />
                                        <div className="flex flex-col">
                                            <span className={`text-xs font-medium ${textMain}`}>{bm.title || `Page ${bm.pageIndex + 1}`}</span>
                                            {bm.note && <span className={`text-[10px] truncate max-w-[140px] ${textSub}`}>{bm.note}</span>}
                                        </div>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => onEditBookmark?.(bm)} className={`p-1 ${textSub} hover:text-primary`}><Edit3 size={12}/></button>
                                        <button onClick={() => onDeleteBookmark?.(bm.id)} className={`p-1 ${textSub} hover:text-red-400`}><Trash2 size={12}/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Section>
                )}
                
                <Section title={t(readerSettings.language, 'display')} icon={<Monitor size={14}/>} theme={theme}>
                    <div className="space-y-3">
                         <Toggle label={t(readerSettings.language, 'showOcr')} checked={showOcr} onChange={() => setShowOcr(!showOcr)} icon={<Eye size={16}/>} theme={theme} />
                         
                         {showOcr && (
                            <div className="animate-in slide-in-from-top-1">
                                <label className={`text-[10px] uppercase font-bold mb-1.5 block px-1 ${textSub}`}>{t(readerSettings.language, 'ocrLanguage')}</label>
                                <select 
                                    value={readerSettings.tesseractLanguage} 
                                    onChange={(e) => setReaderSettings({...readerSettings, tesseractLanguage: e.target.value})}
                                    className={`w-full rounded-xl px-3 py-2 text-sm outline-none border ${inputBg} ${textMain}`}
                                >
                                    {OCR_LANGUAGES.map(l => (
                                        <option key={l.code} value={l.code}>{l.name}</option>
                                    ))}
                                </select>
                            </div>
                         )}

                         <div>
                            <label className={`text-[10px] uppercase font-bold mb-1.5 block px-1 ${textSub}`}>{t(readerSettings.language, 'theme')}</label>
                            <div className={`flex p-1 rounded-xl ${itemBg}`}>
                                <button onClick={() => setReaderSettings({...readerSettings, theme: 'light'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${readerSettings.theme === 'light' ? 'bg-white text-black shadow-md' : `${textSub} hover:text-primary`}`}><Sun size={12}/> {t(readerSettings.language, 'themeLight')}</button>
                                <button onClick={() => setReaderSettings({...readerSettings, theme: 'dark'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${readerSettings.theme === 'dark' ? 'bg-zinc-700 text-white shadow-md' : `${textSub} hover:text-primary`}`}><Moon size={12}/> {t(readerSettings.language, 'themeDark')}</button>
                            </div>
                        </div>

                         <div>
                            <label className={`text-[10px] uppercase font-bold mb-1.5 block px-1 ${textSub}`}>{t(readerSettings.language, 'overlayStyle')}</label>
                            <div className="grid grid-cols-3 gap-2">
                                {['hidden', 'outline', 'fill'].map(style => (
                                    <button 
                                        key={style}
                                        onClick={() => setReaderSettings({...readerSettings, overlayStyle: style as any})}
                                        className={`py-2 text-[10px] uppercase font-bold rounded-lg border transition-all ${readerSettings.overlayStyle === style ? 'bg-primary border-primary text-white shadow-lg' : `${itemBg} border-transparent ${textSub} ${itemHover}`}`}
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

                <Section title={t(readerSettings.language, 'reading')} icon={<BookIcon size={14}/>} theme={theme}>
                     <div className="space-y-4">
                        <div>
                            <label className={`text-[10px] uppercase font-bold mb-1.5 block px-1 ${textSub}`}>{t(readerSettings.language, 'viewMode')}</label>
                            <div className={`flex p-1 rounded-xl ${itemBg}`}>
                                <button onClick={() => setReaderSettings({...readerSettings, pageViewMode: 'single'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${readerSettings.pageViewMode === 'single' ? (isLight ? 'bg-white text-black shadow-md' : 'bg-zinc-700 text-white shadow-md') : `${textSub} ${itemHover}`}`}>{t(readerSettings.language, 'singlePage')}</button>
                                <button onClick={() => setReaderSettings({...readerSettings, pageViewMode: 'double'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${readerSettings.pageViewMode === 'double' ? (isLight ? 'bg-white text-black shadow-md' : 'bg-zinc-700 text-white shadow-md') : `${textSub} ${itemHover}`}`}>{t(readerSettings.language, 'doublePage')}</button>
                                <button onClick={() => setReaderSettings({...readerSettings, pageViewMode: 'webtoon'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${readerSettings.pageViewMode === 'webtoon' ? (isLight ? 'bg-white text-black shadow-md' : 'bg-zinc-700 text-white shadow-md') : `${textSub} ${itemHover}`}`}>{t(readerSettings.language, 'webtoonMode')}</button>
                            </div>
                        </div>

                         <div>
                            <label className={`text-[10px] uppercase font-bold mb-1.5 block px-1 ${textSub}`}>{t(readerSettings.language, 'direction')}</label>
                            <div className={`flex p-1 rounded-xl ${itemBg}`}>
                                <button onClick={() => setReaderSettings({...readerSettings, readingDirection: 'ltr'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${readerSettings.readingDirection === 'ltr' ? (isLight ? 'bg-white text-black shadow-md' : 'bg-zinc-700 text-white shadow-md') : `${textSub} ${itemHover}`}`}>{t(readerSettings.language, 'ltr')}</button>
                                <button onClick={() => setReaderSettings({...readerSettings, readingDirection: 'rtl'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${readerSettings.readingDirection === 'rtl' ? (isLight ? 'bg-white text-black shadow-md' : 'bg-zinc-700 text-white shadow-md') : `${textSub} ${itemHover}`}`}>{t(readerSettings.language, 'rtl')}</button>
                            </div>
                        </div>

                        <Toggle label={t(readerSettings.language, 'enableCompare')} checked={readerSettings.compareMode} onChange={() => setReaderSettings({...readerSettings, compareMode: !readerSettings.compareMode})} icon={<ArrowRightLeft size={16}/>} theme={theme} />
                        
                        {readerSettings.compareMode && readerSettings.pageViewMode === 'double' && (
                             <div>
                                <label className={`text-[10px] uppercase font-bold mb-1.5 block px-1 ${textSub}`}>{t(readerSettings.language, 'comparisonLayout')}</label>
                                <div className="grid grid-cols-1 gap-2">
                                    <button onClick={() => setReaderSettings({...readerSettings, comparisonLayout: 'standard'})} className={`w-full py-2 px-3 text-xs font-bold rounded-lg border text-left transition-all ${readerSettings.comparisonLayout === 'standard' ? 'bg-primary/20 border-primary text-primary' : `${itemBg} border-transparent ${textSub} ${itemHover}`}`}>
                                        {t(readerSettings.language, 'standardLayout')}
                                    </button>
                                    <button onClick={() => setReaderSettings({...readerSettings, comparisonLayout: 'swapped'})} className={`w-full py-2 px-3 text-xs font-bold rounded-lg border text-left transition-all ${readerSettings.comparisonLayout === 'swapped' ? 'bg-primary/20 border-primary text-primary' : `${itemBg} border-transparent ${textSub} ${itemHover}`}`}>
                                        {t(readerSettings.language, 'swappedLayout')}
                                    </button>
                                </div>
                            </div>
                        )}
                     </div>
                </Section>

                <Section title={t(readerSettings.language, 'general')} icon={<Settings size={14}/>} theme={theme}>
                     <div className="space-y-4">
                        <div>
                            <label className={`text-[10px] uppercase font-bold mb-1.5 block px-1 ${textSub}`}>{t(readerSettings.language, 'language')}</label>
                            <div className={`flex p-1 rounded-xl ${itemBg}`}>
                                <button onClick={() => setReaderSettings({...readerSettings, language: 'zh'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${readerSettings.language === 'zh' ? (isLight ? 'bg-white text-black shadow-md' : 'bg-zinc-700 text-white shadow-md') : `${textSub} ${itemHover}`}`}>中文</button>
                                <button onClick={() => setReaderSettings({...readerSettings, language: 'en'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${readerSettings.language === 'en' ? (isLight ? 'bg-white text-black shadow-md' : 'bg-zinc-700 text-white shadow-md') : `${textSub} ${itemHover}`}`}>English</button>
                            </div>
                        </div>

                        <div>
                            <label className={`text-[10px] uppercase font-bold mb-1.5 block px-1 ${textSub}`}>{t(readerSettings.language, 'dictionaryLanguage')}</label>
                            <select 
                                value={readerSettings.learningLanguage || 'en'} 
                                onChange={(e) => setReaderSettings({...readerSettings, learningLanguage: e.target.value as any})}
                                className={`w-full rounded-xl px-3 py-2 text-sm outline-none border ${inputBg} ${textMain}`}
                            >
                                <option value="en">English (EN)</option>
                                <option value="zh">Chinese (ZH)</option>
                                <option value="ja">Japanese (JP)</option>
                                <option value="ko">Korean (KO)</option>
                                <option value="es">Spanish (ES)</option>
                                <option value="fr">French (FR)</option>
                                <option value="de">German (DE)</option>
                                <option value="ru">Russian (RU)</option>
                                <option value="it">Italian (IT)</option>
                                <option value="pt">Portuguese (PT)</option>
                            </select>
                        </div>

                        <div>
                            <label className={`text-[10px] uppercase font-bold mb-1.5 block px-1 ${textSub}`}>{t(readerSettings.language, 'webSearchEngine')}</label>
                            <div className="space-y-2">
                                <select 
                                    value={searchCategory}
                                    onChange={(e) => {
                                        const cat = e.target.value as 'search' | 'translate';
                                        setSearchCategory(cat);
                                        // Set default when category changes
                                        if (cat === 'search') setReaderSettings({...readerSettings, webSearchEngine: 'google'});
                                        else setReaderSettings({...readerSettings, webSearchEngine: 'bing_trans'});
                                    }}
                                    className={`w-full rounded-xl px-3 py-2 text-sm outline-none border mb-2 ${inputBg} ${textMain}`}
                                >
                                    <option value="search">{t(readerSettings.language, 'catSearch')}</option>
                                    <option value="translate">{t(readerSettings.language, 'catTranslate')}</option>
                                </select>

                                <select 
                                    value={readerSettings.webSearchEngine} 
                                    onChange={(e) => setReaderSettings({...readerSettings, webSearchEngine: e.target.value as WebSearchEngine})}
                                    className={`w-full rounded-xl px-3 py-2 text-sm outline-none border ${inputBg} ${textMain}`}
                                >
                                    {searchCategory === 'search' ? (
                                        <>
                                            <option value="google">Google</option>
                                            <option value="bing">Bing</option>
                                            <option value="duckduckgo">DuckDuckGo</option>
                                            <option value="baidu">Baidu</option>
                                        </>
                                    ) : (
                                        <>
                                            <option value="baidu_trans">Baidu Translate</option>
                                            <option value="youdao_trans">Youdao Translate</option>
                                            <option value="bing_trans">Bing Translator</option>
                                            <option value="deepl">DeepL</option>
                                        </>
                                    )}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className={`text-[10px] uppercase font-bold mb-1.5 block px-1 ${textSub}`}>{t(readerSettings.language, 'dictionaryMode')}</label>
                            <div className={`flex p-1 rounded-xl ${itemBg}`}>
                                <button onClick={() => setReaderSettings({...readerSettings, dictionaryMode: 'panel'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${readerSettings.dictionaryMode === 'panel' ? (isLight ? 'bg-white text-black shadow-md' : 'bg-zinc-700 text-white shadow-md') : `${textSub} ${itemHover}`}`}>{t(readerSettings.language, 'dictPanel')}</button>
                                <button onClick={() => setReaderSettings({...readerSettings, dictionaryMode: 'popup'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${readerSettings.dictionaryMode === 'popup' ? (isLight ? 'bg-white text-black shadow-md' : 'bg-zinc-700 text-white shadow-md') : `${textSub} ${itemHover}`}`}>{t(readerSettings.language, 'dictPopup')}</button>
                            </div>
                        </div>
                        
                        <Toggle label={t(readerSettings.language, 'ttsEnabled')} checked={readerSettings.ttsEnabled} onChange={() => setReaderSettings({...readerSettings, ttsEnabled: !readerSettings.ttsEnabled})} icon={<Mic size={16}/>} theme={theme} />

                         {readerSettings.ttsEnabled && (
                            <div className="animate-in slide-in-from-top-1">
                                <label className={`text-[10px] uppercase font-bold mb-1.5 block px-1 ${textSub}`}>{t(readerSettings.language, 'ttsVoice')}</label>
                                <select 
                                    value={readerSettings.ttsVoiceURI} 
                                    onChange={(e) => setReaderSettings({...readerSettings, ttsVoiceURI: e.target.value})}
                                    className={`w-full rounded-xl px-3 py-2 text-sm outline-none border ${inputBg} ${textMain}`}
                                >
                                    <option value="">Default</option>
                                    {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
                                </select>
                            </div>
                        )}

                        <button onClick={() => exportData(readerSettings)} className={`w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border ${itemBg} ${textSub} ${itemHover}`}>
                            <Download size={14}/> {t(readerSettings.language, 'exportData')}
                        </button>
                     </div>
                </Section>
                
                <Section title={t(readerSettings.language, 'shortcuts')} icon={<Keyboard size={14}/>} theme={theme}>
                    <div className="space-y-3">
                        {Object.keys(readerSettings.keybindings).map((k) => (
                            <div key={k} className="flex items-center justify-between">
                                <span className={`text-xs capitalize ${textSub}`}>{t(readerSettings.language, k as any) || k}</span>
                                <button 
                                    onClick={() => setRecordingKey(k as any)} 
                                    className={`px-3 py-1.5 rounded-lg text-xs font-mono border ${recordingKey === k ? 'bg-red-500 text-white border-red-600 animate-pulse' : `${itemBg} ${textMain} ${itemHover}`}`}
                                >
                                    {recordingKey === k ? t(readerSettings.language, 'listening') : readerSettings.keybindings[k as keyof Keybindings].map(formatKey).join(', ') || t(readerSettings.language, 'clickToBind')}
                                </button>
                            </div>
                        ))}
                        <button onClick={() => setReaderSettings({...readerSettings, keybindings: { nextPage: ['ArrowRight', ' '], prevPage: ['ArrowLeft'], toggleMenu: ['m'], fullscreen: ['f'] }})} className={`w-full mt-2 py-1.5 text-[10px] flex items-center justify-center gap-1 ${textSub} ${itemHover}`}>
                            <RotateCcw size={10}/> {t(readerSettings.language, 'resetKeys')}
                        </button>
                    </div>
                </Section>

                <Section title={t(readerSettings.language, 'anki')} icon={<Database size={14}/>} theme={theme}>
                     <div className="space-y-3">
                         <div className="grid grid-cols-3 gap-2">
                             <div className="col-span-2">
                                <label className={`text-[10px] uppercase font-bold mb-1 block ${textSub}`}>{t(readerSettings.language, 'ip')}</label>
                                <input type="text" value={ankiSettings.ip} onChange={e => setAnkiSettings({...ankiSettings, ip: e.target.value})} className={`w-full rounded-lg px-2 py-1.5 text-xs border ${inputBg} ${textMain}`} />
                             </div>
                             <div>
                                <label className={`text-[10px] uppercase font-bold mb-1 block ${textSub}`}>{t(readerSettings.language, 'port')}</label>
                                <input type="text" value={ankiSettings.port} onChange={e => setAnkiSettings({...ankiSettings, port: e.target.value})} className={`w-full rounded-lg px-2 py-1.5 text-xs border ${inputBg} ${textMain}`} />
                             </div>
                         </div>
                         <button onClick={handleTestAnki} disabled={loadingAnki} className="w-full py-2 bg-primary/20 hover:bg-primary/30 text-primary rounded-xl text-xs font-bold flex items-center justify-center gap-2">
                             {loadingAnki ? <Loader2 className="animate-spin" size={14}/> : <Wifi size={14}/>} {t(readerSettings.language, 'testConnection')}
                         </button>

                         {decks.length > 0 && (
                             <div className="space-y-3 pt-2 border-t border-white/5 animate-in slide-in-from-top-2">
                                 <div>
                                    <label className={`text-[10px] uppercase font-bold mb-1 block ${textSub}`}>{t(readerSettings.language, 'deck')}</label>
                                    <select value={ankiSettings.deck} onChange={e => setAnkiSettings({...ankiSettings, deck: e.target.value})} className={`w-full rounded-lg px-2 py-1.5 text-xs outline-none border ${inputBg} ${textMain}`}>
                                        {decks.map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                 </div>
                                 <div>
                                    <label className={`text-[10px] uppercase font-bold mb-1 block ${textSub}`}>{t(readerSettings.language, 'noteType')}</label>
                                    <select value={ankiSettings.noteType} onChange={e => setAnkiSettings({...ankiSettings, noteType: e.target.value})} className={`w-full rounded-lg px-2 py-1.5 text-xs outline-none border ${inputBg} ${textMain}`}>
                                        {models.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                 </div>
                                 <div>
                                     <label className={`text-[10px] uppercase font-bold mb-2 block ${textSub}`}>{t(readerSettings.language, 'fieldMapping')}</label>
                                     <div className={`space-y-2 pl-2 border-l ${isLight ? 'border-zinc-200' : 'border-white/10'}`}>
                                        {[
                                            { label: 'Word', key: 'wordField' },
                                            { label: 'Sentence', key: 'sentenceField' },
                                            { label: 'Meaning', key: 'meaningField' },
                                            { label: 'Translation', key: 'translationField' },
                                            { label: 'Audio', key: 'audioField' },
                                            { label: 'Image (Orig)', key: 'imageField' },
                                            { label: 'Image (Trans)', key: 'translatedImageField' },
                                        ].map(field => (
                                            <div key={field.key} className="grid grid-cols-3 items-center gap-2">
                                                <span className={`text-[10px] ${textSub}`}>{field.label}</span>
                                                <select 
                                                    value={(ankiSettings as any)[field.key]} 
                                                    onChange={e => setAnkiSettings({...ankiSettings, [field.key]: e.target.value})} 
                                                    className={`col-span-2 rounded px-2 py-1 text-[10px] border ${inputBg} ${textMain}`}
                                                >
                                                    <option value="">(None)</option>
                                                    {fields.map(f => <option key={f} value={f}>{f}</option>)}
                                                </select>
                                            </div>
                                        ))}
                                     </div>
                                 </div>
                                 <div>
                                    <label className={`text-[10px] uppercase font-bold mb-1 block ${textSub}`}>{t(readerSettings.language, 'tags')}</label>
                                    <div className={`flex items-center gap-2 rounded-lg px-2 py-1 border ${inputBg}`}>
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