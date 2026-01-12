

import React, { useState, useEffect } from 'react';
import { AnkiSettingsType, ReaderSettings, Book, Keybindings, Bookmark, WebSearchEngine, LocalDictionary, SUPPORTED_LANGUAGES } from '../../types';
import { X, Eye, Book as BookIcon, Monitor, Globe, Layout, ArrowRightLeft, ChevronDown, ChevronRight, Upload, Keyboard, RotateCcw, Download, Mic, Database, Wifi, Tag, Sun, Moon, Edit3, Trash2, Settings, Loader2, Save, Bookmark as BookmarkIcon, Play, Copy, BookOpenText, Info, ArrowUp, ArrowDown, Activity } from 'lucide-react';
import { getDecks, getModels, getModelFields } from '../../services/anki';
import { updateBookTranslatedFile, updateBookOffset, exportData, updateBookAnkiTags } from '../../services/db';
import { getDictionaries, deleteDictionary, updateDictionaryPriority } from '../../services/db';
import { importYomitanDictionary } from '../../services/dictionary';
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
    const [isAnkiConnected, setIsAnkiConnected] = useState(false);
    const [testingExternal, setTestingExternal] = useState(false);
    
    const [decks, setDecks] = useState<string[]>([]);
    const [models, setModels] = useState<string[]>([]);
    const [fields, setFields] = useState<string[]>([]);
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    
    // TTS Test
    const [ttsTestText, setTtsTestText] = useState('Hello World');

    // Local Dictionary State
    const [localDicts, setLocalDicts] = useState<LocalDictionary[]>([]);
    const [importingDict, setImportingDict] = useState(false);
    const [importStatus, setImportStatus] = useState('');
    const [importLang, setImportLang] = useState<string>('universal');

    useEffect(() => {
        // Update default test text based on learning language
        const msgs: Record<string, string> = {
            en: 'Hello World',
            zh: '你好世界',
            ja: 'こんにちは世界',
            ko: '안녕하세요 세계',
            fr: 'Bonjour le monde',
            de: 'Hallo Welt',
            es: 'Hola Mundo',
            ru: 'Привет мир'
        };
        setTtsTestText(msgs[readerSettings.learningLanguage] || 'Hello');
    }, [readerSettings.learningLanguage]);

    // Update Search Category Logic
    const isTrans = ['bing_trans', 'deepl', 'baidu_trans', 'youdao_trans'].includes(readerSettings.webSearchEngine);
    const isEncyclopedia = ['baidu_baike', 'wikipedia', 'moegirl'].includes(readerSettings.webSearchEngine);
    const [searchCategory, setSearchCategory] = useState<'search' | 'translate' | 'encyclopedia'>(
        isEncyclopedia ? 'encyclopedia' : isTrans ? 'translate' : 'search'
    );

    useEffect(() => {
        const engine = readerSettings.webSearchEngine;
        if (['baidu_baike', 'wikipedia', 'moegirl'].includes(engine)) setSearchCategory('encyclopedia');
        else if (['bing_trans', 'deepl', 'baidu_trans', 'youdao_trans'].includes(engine)) setSearchCategory('translate');
        else setSearchCategory('search');
    }, [readerSettings.webSearchEngine]);

    useEffect(() => {
        const loadVoices = () => {
            setVoices(window.speechSynthesis.getVoices());
        };
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
        return () => { window.speechSynthesis.onvoiceschanged = null; };
    }, []);

    useEffect(() => {
        loadDictionaries();
    }, []);

    const loadDictionaries = async () => {
        const dicts = await getDictionaries();
        setLocalDicts(dicts);
    };

    const handleImportDict = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImportingDict(true);
            setImportStatus('Initializing...');
            try {
                await importYomitanDictionary(file, importLang, (msg) => setImportStatus(msg));
                await loadDictionaries();
                alert("Dictionary imported successfully!");
            } catch (err) {
                alert("Import failed: " + err);
            } finally {
                setImportingDict(false);
                setImportStatus('');
            }
        }
    };

    const handleDeleteDict = async (id: string) => {
        if (confirm("Delete this dictionary?")) {
            await deleteDictionary(id);
            await loadDictionaries();
        }
    };

    const moveDict = async (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === localDicts.length - 1) return;

        const newDicts = [...localDicts];
        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        
        // Swap array elements
        [newDicts[index], newDicts[swapIndex]] = [newDicts[swapIndex], newDicts[index]];
        setLocalDicts(newDicts);

        // Update DB priorities
        // Assign priority based on new index
        for (let i = 0; i < newDicts.length; i++) {
            await updateDictionaryPriority(newDicts[i].id, i);
        }
    };

    const testExternalConnection = async () => {
        setTestingExternal(true);
        try {
            await new Promise((resolve, reject) => {
                const id = Date.now().toString();
                const handler = (event: MessageEvent) => {
                    if (event.data && event.data.type === 'MOKURO_PONG' && event.data.id === id) {
                        window.removeEventListener('message', handler);
                        resolve(true);
                    }
                };
                window.addEventListener('message', handler);
                window.postMessage({ type: 'MOKURO_PING', id }, '*');
                setTimeout(() => {
                    window.removeEventListener('message', handler);
                    reject('Timeout');
                }, 1000);
            });
            alert(t(readerSettings.language, 'connectionSuccess'));
        } catch (e) {
            alert(t(readerSettings.language, 'connectionFailed'));
        } finally {
            setTestingExternal(false);
        }
    };

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
    
    useEffect(() => {
        if(ankiSettings.noteType && isAnkiConnected) {
            setFields([]); 
            getModelFields(ankiSettings.noteType, ankiSettings).then(setFields).catch(() => {});
        }
    }, [ankiSettings.noteType, isAnkiConnected]);

    const handleOffsetChange = async () => {
        if (book) { await updateBookOffset(book.id, offsetInput); if (onBookUpdate) onBookUpdate(); }
    };

    const handleTransUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (book && e.target.files && e.target.files[0]) { await updateBookTranslatedFile(book.id, e.target.files[0]); if (onBookUpdate) onBookUpdate(); }
    };

    const handleTtsTest = () => {
        // Add basic test logic for browser TTS, external is handled by event simulation maybe?
        const utt = new SpeechSynthesisUtterance(ttsTestText);
        if (readerSettings.ttsVoiceURI) {
            const voice = voices.find(v => v.voiceURI === readerSettings.ttsVoiceURI);
            if (voice) utt.voice = voice;
        }
        utt.rate = readerSettings.ttsRate || 1;
        utt.pitch = readerSettings.ttsPitch || 1;
        utt.volume = readerSettings.ttsVolume || 1;
        window.speechSynthesis.speak(utt);
    };

    const formatKey = (k: string) => {
        if (k === ' ') return 'Space';
        if (k.startsWith('Arrow')) return k.replace('Arrow', '');
        if (k.startsWith('GP_Btn_')) return `GP ${k.split('_')[2]}`;
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
                
                {/* General Settings Moved First */}
                <Section title={t(readerSettings.language, 'general')} icon={<Settings size={14}/>} theme={theme} defaultOpen={true}>
                     <div className="space-y-4">
                        <div>
                            <label className={`text-[10px] uppercase font-bold mb-1.5 block px-1 ${textSub}`}>{t(readerSettings.language, 'language')}</label>
                            <select 
                                value={readerSettings.language} 
                                onChange={(e) => setReaderSettings({...readerSettings, language: e.target.value as any})}
                                className={`w-full rounded-xl px-3 py-2 text-sm outline-none border ${inputBg} ${textMain}`}
                            >
                                <option value="zh">简体中文</option>
                                <option value="zh-Hant">繁體中文</option>
                                <option value="en">English</option>
                            </select>
                        </div>

                        <div>
                            <label className={`text-[10px] uppercase font-bold mb-1.5 block px-1 ${textSub}`}>{t(readerSettings.language, 'dictionaryLanguage')}</label>
                            <select 
                                value={readerSettings.learningLanguage || 'en'} 
                                onChange={(e) => setReaderSettings({...readerSettings, learningLanguage: e.target.value as any})}
                                className={`w-full rounded-xl px-3 py-2 text-sm outline-none border ${inputBg} ${textMain}`}
                            >
                                {SUPPORTED_LANGUAGES.map(lang => (
                                    <option key={lang.code} value={lang.code}>{lang.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Segmentation Settings */}
                        <div>
                            <label className={`text-[10px] uppercase font-bold mb-1.5 block px-1 ${textSub}`}>{t(readerSettings.language, 'segmentationMethod')}</label>
                            <select 
                                value={readerSettings.segmentationMethod || 'browser'} 
                                onChange={(e) => setReaderSettings({...readerSettings, segmentationMethod: e.target.value as any})}
                                className={`w-full rounded-xl px-3 py-2 text-sm outline-none border ${inputBg} ${textMain}`}
                            >
                                <option value="space">{t(readerSettings.language, 'segSpace')}</option>
                                <option value="browser">{t(readerSettings.language, 'segBrowser')}</option>
                                <option value="external">{t(readerSettings.language, 'segExternal')}</option>
                                {readerSettings.learningLanguage === 'ja' && (
                                    <option value="kuromoji">{t(readerSettings.language, 'segKuromoji')}</option>
                                )}
                            </select>
                            {readerSettings.segmentationMethod === 'external' && (
                                <button onClick={testExternalConnection} disabled={testingExternal} className={`mt-2 w-full py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 border ${itemBg} ${textSub} ${itemHover}`}>
                                    {testingExternal ? <Loader2 size={12} className="animate-spin"/> : <Activity size={12}/>}
                                    {t(readerSettings.language, 'testScript')}
                                </button>
                            )}
                        </div>

                        {/* ... Web Search Engine code ... */}
                        <div>
                            <label className={`text-[10px] uppercase font-bold mb-1.5 block px-1 ${textSub}`}>{t(readerSettings.language, 'webSearchEngine')}</label>
                            <div className="space-y-2">
                                <select 
                                    value={searchCategory}
                                    onChange={(e) => {
                                        const cat = e.target.value as 'search' | 'translate' | 'encyclopedia';
                                        setSearchCategory(cat);
                                        if (cat === 'search') setReaderSettings({...readerSettings, webSearchEngine: 'google'});
                                        else if (cat === 'encyclopedia') setReaderSettings({...readerSettings, webSearchEngine: 'wikipedia'});
                                        else setReaderSettings({...readerSettings, webSearchEngine: 'bing_trans'});
                                    }}
                                    className={`w-full rounded-xl px-3 py-2 text-sm outline-none border mb-2 ${inputBg} ${textMain}`}
                                >
                                    <option value="search">{t(readerSettings.language, 'catSearch')}</option>
                                    <option value="translate">{t(readerSettings.language, 'catTranslate')}</option>
                                    <option value="encyclopedia">{t(readerSettings.language, 'catEncyclopedia')}</option>
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
                                    ) : searchCategory === 'encyclopedia' ? (
                                        <>
                                            <option value="wikipedia">Wikipedia</option>
                                            <option value="baidu_baike">Baidu Baike</option>
                                            <option value="moegirl">Moegirl</option>
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

                        {/* ... Dictionary Mode & Overlay ... */}
                        <div>
                            <label className={`text-[10px] uppercase font-bold mb-1.5 block px-1 ${textSub}`}>{t(readerSettings.language, 'dictionaryMode')}</label>
                            <div className={`flex p-1 rounded-xl ${itemBg}`}>
                                <button onClick={() => setReaderSettings({...readerSettings, dictionaryMode: 'panel'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${readerSettings.dictionaryMode === 'panel' ? (isLight ? 'bg-white text-black shadow-md' : 'bg-zinc-700 text-white shadow-md') : `${textSub} ${itemHover}`}`}>{t(readerSettings.language, 'dictPanel')}</button>
                                <button onClick={() => setReaderSettings({...readerSettings, dictionaryMode: 'popup'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${readerSettings.dictionaryMode === 'popup' ? (isLight ? 'bg-white text-black shadow-md' : 'bg-zinc-700 text-white shadow-md') : `${textSub} ${itemHover}`}`}>{t(readerSettings.language, 'dictPopup')}</button>
                            </div>
                        </div>

                        {readerSettings.dictionaryMode === 'panel' && (
                            <div className="mt-2 animate-in slide-in-from-top-1">
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
                        )}

                        {readerSettings.dictionaryMode === 'popup' && (
                             <div className="animate-in slide-in-from-top-1">
                                <label className={`text-[10px] uppercase font-bold mb-1.5 block px-1 ${textSub}`}>{t(readerSettings.language, 'popupFontSize')} ({readerSettings.popupFontSize || 16}px)</label>
                                <input 
                                    type="range" min="12" max="32" step="1"
                                    value={readerSettings.popupFontSize || 16}
                                    onChange={(e) => setReaderSettings({...readerSettings, popupFontSize: parseInt(e.target.value)})}
                                    className="w-full accent-primary h-1 rounded-full appearance-none bg-zinc-300 dark:bg-zinc-700"
                                />
                             </div>
                         )}

                        <Toggle label="Auto Copy to Clipboard" checked={readerSettings.copyToClipboard} onChange={() => setReaderSettings({...readerSettings, copyToClipboard: !readerSettings.copyToClipboard})} icon={<Copy size={16}/>} theme={theme} />
                        
                        <Toggle label={t(readerSettings.language, 'ttsEnabled')} checked={readerSettings.ttsEnabled} onChange={() => setReaderSettings({...readerSettings, ttsEnabled: !readerSettings.ttsEnabled})} icon={<Mic size={16}/>} theme={theme} />

                         {readerSettings.ttsEnabled && (
                            <div className="animate-in slide-in-from-top-1 space-y-2 bg-black/5 p-2 rounded-lg">
                                {/* TTS Settings */}
                                <div>
                                    <label className={`text-[10px] uppercase font-bold block px-1 mb-1 ${textSub}`}>{t(readerSettings.language, 'audioSource')}</label>
                                    <select 
                                        value={readerSettings.audioSource || 'browser'} 
                                        onChange={(e) => setReaderSettings({...readerSettings, audioSource: e.target.value as any})}
                                        className={`w-full rounded-xl px-3 py-2 text-sm outline-none border ${inputBg} ${textMain}`}
                                    >
                                        <option value="browser">{t(readerSettings.language, 'audioBrowser')}</option>
                                        <option value="external">{t(readerSettings.language, 'audioExternal')}</option>
                                    </select>
                                    {readerSettings.audioSource === 'external' && (
                                        <button onClick={testExternalConnection} disabled={testingExternal} className={`mt-2 w-full py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 border ${itemBg} ${textSub} ${itemHover}`}>
                                            {testingExternal ? <Loader2 size={12} className="animate-spin"/> : <Activity size={12}/>}
                                            {t(readerSettings.language, 'testScript')}
                                        </button>
                                    )}
                                </div>

                                {readerSettings.audioSource !== 'external' && (
                                    <>
                                        <div>
                                            <label className={`text-[10px] uppercase font-bold block px-1 mb-1 ${textSub}`}>{t(readerSettings.language, 'ttsVoice')}</label>
                                            <select 
                                                value={readerSettings.ttsVoiceURI} 
                                                onChange={(e) => setReaderSettings({...readerSettings, ttsVoiceURI: e.target.value})}
                                                className={`w-full rounded-xl px-3 py-2 text-sm outline-none border ${inputBg} ${textMain}`}
                                            >
                                                <option value="">Default</option>
                                                {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
                                            </select>
                                        </div>
                                        
                                        <div>
                                            <label className={`text-[10px] uppercase font-bold flex justify-between px-1 ${textSub}`}><span>Rate</span> <span>{readerSettings.ttsRate}x</span></label>
                                            <input 
                                                type="range" min="0.5" max="2" step="0.1"
                                                value={readerSettings.ttsRate}
                                                onChange={(e) => setReaderSettings({...readerSettings, ttsRate: parseFloat(e.target.value)})}
                                                className="w-full accent-primary h-1 rounded-full appearance-none bg-zinc-300 dark:bg-zinc-700"
                                            />
                                        </div>
                                        <div>
                                            <label className={`text-[10px] uppercase font-bold flex justify-between px-1 ${textSub}`}><span>Pitch</span> <span>{readerSettings.ttsPitch}</span></label>
                                            <input 
                                                type="range" min="0" max="2" step="0.1"
                                                value={readerSettings.ttsPitch}
                                                onChange={(e) => setReaderSettings({...readerSettings, ttsPitch: parseFloat(e.target.value)})}
                                                className="w-full accent-primary h-1 rounded-full appearance-none bg-zinc-300 dark:bg-zinc-700"
                                            />
                                        </div>
                                        <div>
                                            <label className={`text-[10px] uppercase font-bold flex justify-between px-1 ${textSub}`}><span>Volume</span> <span>{readerSettings.ttsVolume}</span></label>
                                            <input 
                                                type="range" min="0" max="1" step="0.1"
                                                value={readerSettings.ttsVolume}
                                                onChange={(e) => setReaderSettings({...readerSettings, ttsVolume: parseFloat(e.target.value)})}
                                                className="w-full accent-primary h-1 rounded-full appearance-none bg-zinc-300 dark:bg-zinc-700"
                                            />
                                        </div>
                                    </>
                                )}

                                <div className="flex gap-2 pt-1">
                                    <input value={ttsTestText} onChange={e => setTtsTestText(e.target.value)} className={`flex-1 rounded-lg px-2 py-1 text-xs border ${inputBg} ${textMain}`} />
                                    <button onClick={handleTtsTest} className={`px-3 py-1 bg-primary text-white rounded-lg text-xs`}>
                                        <Play size={12}/>
                                    </button>
                                </div>
                            </div>
                        )}

                        <div>
                            <label className={`text-[10px] uppercase font-bold mb-1.5 block px-1 ${textSub}`}>Local Dictionaries (Yomitan)</label>
                            
                            <div className="flex gap-2 mb-2">
                                <select 
                                    value={importLang} 
                                    onChange={(e) => setImportLang(e.target.value)}
                                    className={`flex-1 rounded-lg px-2 py-1 text-[10px] outline-none border ${inputBg} ${textMain}`}
                                    title="Target Language"
                                >
                                    <option value="universal">Universal (All)</option>
                                    {SUPPORTED_LANGUAGES.map(lang => (
                                        <option key={lang.code} value={lang.code}>{lang.name}</option>
                                    ))}
                                </select>
                                <label className={`flex items-center justify-center p-2 border rounded-lg cursor-pointer transition-colors text-xs gap-2 ${importingDict ? 'opacity-50 cursor-wait' : ''} ${inputBg} ${textMain}`}>
                                    {importingDict ? <Loader2 size={14} className="animate-spin"/> : <Upload size={14}/>}
                                    <input type="file" accept=".zip" className="hidden" onChange={handleImportDict} disabled={importingDict} />
                                </label>
                            </div>
                            {importingDict && <p className="text-[10px] text-primary mb-2 text-center">{importStatus}</p>}

                            <div className="space-y-1 max-h-32 overflow-y-auto">
                                {localDicts.map((d, index) => (
                                    <div key={d.id} className="flex justify-between items-center text-xs px-2 py-1 rounded bg-black/5 hover:bg-black/10 group">
                                        <span className="truncate flex-1" title={d.name}>{d.name} ({d.targetLang === 'universal' ? 'Univ' : d.targetLang})</span>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {index > 0 && (
                                                <button onClick={() => moveDict(index, 'up')} className="p-1 hover:text-primary"><ArrowUp size={12}/></button>
                                            )}
                                            {index < localDicts.length - 1 && (
                                                <button onClick={() => moveDict(index, 'down')} className="p-1 hover:text-primary"><ArrowDown size={12}/></button>
                                            )}
                                            <button onClick={() => handleDeleteDict(d.id)} className="p-1 hover:text-red-500"><Trash2 size={12}/></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <button onClick={() => exportData(readerSettings)} className={`w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border ${itemBg} ${textSub} ${itemHover}`}>
                            <Download size={14}/> {t(readerSettings.language, 'exportData')}
                        </button>
                     </div>
                </Section>

                {/* Anki Integration Moved Second */}
                <Section title={t(readerSettings.language, 'anki')} icon={<Database size={14}/>} theme={theme}>
                     {/* ... Anki settings ... */}
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
                                 <Toggle label={t(readerSettings.language, 'ankiBoldText')} checked={readerSettings.ankiBoldText ?? true} onChange={() => setReaderSettings({...readerSettings, ankiBoldText: !(readerSettings.ankiBoldText ?? true)})} theme={theme} />
                             </div>
                         )}
                     </div>
                </Section>

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
                            </div>
                        </div>
                    </Section>
                )}
                
                {/* ... Display/Reading/Shortcuts/About sections ... */}
                {/* (Kept as is, omitting for brevity if not changed, but must include full file content) */}
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
                
                <Section title={t(readerSettings.language, 'shortcuts')} icon={<Keyboard size={14}/>} theme={theme}>
                    <div className="space-y-3">
                        {Object.keys(readerSettings.keybindings).map((k) => (
                            <div key={k} className="flex items-center justify-between">
                                <span className={`text-xs capitalize ${textSub}`}>{t(readerSettings.language, k as any) || k}</span>
                                {recordingKey === k ? (
                                    <div className="flex items-center gap-1">
                                        <span className={`text-xs text-red-500 animate-pulse`}>{t(readerSettings.language, 'listening')}</span>
                                        <button onClick={(e) => { e.stopPropagation(); setRecordingKey(null); }} className="p-1 rounded bg-zinc-200 dark:bg-zinc-700"><X size={10}/></button>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => setRecordingKey(k as any)} 
                                        className={`px-3 py-1.5 rounded-lg text-xs font-mono border ${itemBg} ${textMain} ${itemHover}`}
                                    >
                                        {readerSettings.keybindings[k as keyof Keybindings].map(formatKey).join(', ') || t(readerSettings.language, 'clickToBind')}
                                    </button>
                                )}
                            </div>
                        ))}
                        <button onClick={() => setReaderSettings({...readerSettings, keybindings: { nextPage: ['ArrowRight', ' '], prevPage: ['ArrowLeft'], toggleMenu: ['m'], fullscreen: ['f'] }})} className={`w-full mt-2 py-1.5 text-[10px] flex items-center justify-center gap-1 ${textSub} ${itemHover}`}>
                            <RotateCcw size={10}/> {t(readerSettings.language, 'resetKeys')}
                        </button>
                    </div>
                </Section>

                <Section title="About" icon={<Info size={14}/>} theme={theme}>
                    <div className={`text-xs space-y-2 p-2 rounded-lg ${inputBg}`}>
                        <p className={`font-bold ${textMain}`}>Mokuro Comic Reader</p>
                        <p className={textSub}>A modern web-based comic reader with OCR and Anki integration.</p>
                        <div className="flex gap-2 pt-2">
                            <a href="https://github.com/kha-white/mokuro" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Mokuro Project</a>
                        </div>
                    </div>
                </Section>
            </div>
        </div>
    );
};

export default Sidebar;