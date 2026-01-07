
import React, { useState, useEffect, useRef } from 'react';
import { AnkiSettingsType, ReaderSettings } from '../../types';
import { Search, Plus, Loader2, BookOpen, X, ArrowRight, Volume2, ExternalLink, PenTool, Globe, Puzzle, Pin, PlayCircle, Save, Image as ImageIcon, Maximize, AppWindow, ArrowLeft, RotateCw } from 'lucide-react';
import { translations, t as trans } from '../../services/i18n';
import { addNote } from '../../services/anki';

interface DictionaryResponse {
    word: string;
    entries: {
        language?: string;
        partOfSpeech: string;
        phonetic?: string;
        pronunciations?: { text: string; audio?: string }[];
        senses?: { definition: string; examples: string[]; synonyms?: string[]; antonyms?: string[] }[];
    }[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  fullSentence: string;
  images?: { original?: string; translated?: string }; 
  ankiSettings: AnkiSettingsType;
  settings: ReaderSettings;
}

const formatDictionaryHTML = (data: DictionaryResponse): string => {
  if (!data) return '';
  let html = '';
  html += `<div><b style="font-size: 1.2em;">${data.word}</b>`;
  const phonetic = data.entries.find(e => e.phonetic)?.phonetic;
  if (phonetic) html += ` <span style="color: #666; font-family: sans-serif;">[${phonetic}]</span>`;
  html += `</div>`;
  data.entries.forEach(entry => {
    html += `<div style="margin-top: 0.5em;"><span style="background-color: #eef2ff; color: #4f46e5; border: 1px solid #c7d2fe; border-radius: 4px; padding: 1px 4px; font-size: 0.8em; font-weight: bold; margin-right: 6px;">${entry.partOfSpeech}</span>`;
    if (entry.senses && entry.senses.length > 0) {
      html += `<ol style="margin: 0.2em 0 0 1.2em; padding-left: 0;">`;
      entry.senses.forEach(sense => {
        html += `<li style="margin-bottom: 0.3em;">${sense.definition}`;
        if (sense.examples && sense.examples.length > 0) {
           html += `<ul style="margin: 0.1em 0 0 0; padding-left: 1em; list-style-type: disc; color: #64748b; font-size: 0.9em; font-style: italic;">`;
           sense.examples.slice(0, 3).forEach(ex => html += `<li>${ex}</li>`);
           html += `</ul>`;
        }
        html += `</li>`;
      });
      html += `</ol>`;
    }
    html += `</div>`;
  });
  return html;
};

const DictionaryPanel: React.FC<Props> = ({ 
  isOpen, onClose, query: word, fullSentence: sentence, images,
  ankiSettings, settings
}) => {
  const lang = settings.language;
  const t = translations[lang] || translations['en'];
  const learningLanguage = settings.learningLanguage || 'en';

  const [searchTerm, setSearchTerm] = useState(word);
  const [data, setData] = useState<DictionaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'dict' | 'web' | 'script'>('dict');
  const [customDef, setCustomDef] = useState('');
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [scriptHtml, setScriptHtml] = useState<string | null>(null);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [isAddingToAnki, setIsAddingToAnki] = useState(false);
  
  // Web search mode: 'iframe' or 'external'
  const [webMode, setWebMode] = useState<'iframe' | 'external'>(settings.webSearchMode || 'iframe');

  const [segments, setSegments] = useState<{ segment: string, isWordLike: boolean }[]>([]);

  const scriptTimeoutRef = useRef<number | null>(null);
  const currentRequestId = useRef<string>('');
  const isMountedRef = useRef(false);
  const segmenterRef = useRef<any>(null);
  const prevIsOpen = useRef(isOpen);
  const prevWord = useRef(word);
  const prevLang = useRef(learningLanguage);
  const scriptContainerRef = useRef<HTMLDivElement>(null);
  
  // Ref for iframe to implement refresh/back
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
      isMountedRef.current = true;
      try {
        if (settings.segmentationMethod === 'browser') {
            segmenterRef.current = new (Intl as any).Segmenter(undefined, { granularity: 'word' });
        } else {
            segmenterRef.current = null;
        }
      } catch (e) { segmenterRef.current = null; }
      return () => { isMountedRef.current = false; };
  }, [settings.segmentationMethod]);

  useEffect(() => {
      if (!sentence) { setSegments([]); return; }
      
      if (settings.segmentationMethod === 'browser' && segmenterRef.current) {
          const iter = segmenterRef.current.segment(sentence);
          setSegments(Array.from(iter).map((s: any) => ({ segment: s.segment, isWordLike: s.isWordLike })));
      } else {
          setSegments(sentence.split(/(\s+)/).map((s) => ({ segment: s, isWordLike: /\S/.test(s) })));
      }
  }, [sentence, settings.segmentationMethod]);


  useEffect(() => {
      const handleScriptMessage = (event: MessageEvent) => {
          if (!isMountedRef.current) return;
          if (event.data && event.data.type === 'VAM_SEARCH_RESPONSE') {
              const { html, error, id } = event.data.payload;
              if (id && id !== currentRequestId.current) return;
              if (!id && !scriptTimeoutRef.current) return;
              if (scriptTimeoutRef.current) {
                  clearTimeout(scriptTimeoutRef.current);
                  scriptTimeoutRef.current = null;
              }
              setScriptLoading(false);
              if (error) {
                  setScriptHtml(`<div class="text-red-400 p-4 text-center text-sm bg-red-500/10 rounded-lg border border-red-500/20">${error}</div>`);
              } else {
                  setScriptHtml(html);
              }
          }
      };
      window.addEventListener('message', handleScriptMessage);
      return () => {
          window.removeEventListener('message', handleScriptMessage);
          if (scriptTimeoutRef.current) clearTimeout(scriptTimeoutRef.current);
      };
  }, []);

  useEffect(() => {
    const wordChanged = word !== prevWord.current;
    const justOpened = isOpen && !prevIsOpen.current;
    const langChanged = learningLanguage !== prevLang.current;
    prevIsOpen.current = isOpen;
    prevWord.current = word;
    prevLang.current = learningLanguage;
    if (!isOpen) return;

    if (justOpened) {
        setSearchTerm(word); 
        setData(null); 
        setScriptHtml(null);
        setError('');
        setCustomImage(null); 
        if (word) {
            if (activeTab === 'script') fetchFromScript(word);
            else { setActiveTab('dict'); fetchDefinition(word); }
        } else {
            setLoading(false);
        }
    } else if (wordChanged && word) {
        setSearchTerm(word);
        if (activeTab === 'script') fetchFromScript(word);
        else { setActiveTab('dict'); fetchDefinition(word); }
    } else if (langChanged && searchTerm) {
        if (activeTab === 'script') fetchFromScript(searchTerm);
        else { setActiveTab('dict'); fetchDefinition(searchTerm); }
    }
  }, [isOpen, word, learningLanguage]);

  const fetchFromScript = (term: string) => {
      if (!term) return;
      if (scriptTimeoutRef.current) {
          clearTimeout(scriptTimeoutRef.current);
          scriptTimeoutRef.current = null;
      }
      setScriptLoading(true);
      const requestId = Date.now().toString();
      currentRequestId.current = requestId;
      window.postMessage({ type: 'VAM_SEARCH_REQUEST', payload: { word: term, lang: learningLanguage, id: requestId } }, '*');
      const timeoutId = window.setTimeout(() => {
          if (isMountedRef.current && currentRequestId.current === requestId) {
              setScriptLoading(false);
              setScriptHtml(`<div class="text-slate-500 text-center p-4 text-xs"><p>No script response.</p><p class="mt-2 opacity-75 text-[10px]">Ensure userscript is installed.</p></div>`);
              scriptTimeoutRef.current = null;
          }
      }, 5000);
      scriptTimeoutRef.current = timeoutId;
  };

  const fetchDefinition = async (term: string) => {
    if (!term) return;
    setLoading(true);
    setError('');
    setData(null);
    try {
      // Fix: Free Dictionary API uses standard ISO codes (mostly 2-letter, some 3)
      // en, hi, es, fr, ja, ru, de, it, ko, pt-br, ar, tr
      let apiLang: string = learningLanguage;
      if (apiLang === 'pt') apiLang = 'pt-BR'; // Fix Portuguese
      
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/${apiLang}/${term}`);
      if (!res.ok) throw new Error('Not found');
      const json = await res.json();
      if (json && json.length > 0) {
        const entry = json[0];
        const mappedData: DictionaryResponse = {
          word: entry.word,
          entries: [{
              language: learningLanguage,
              partOfSpeech: entry.meanings?.[0]?.partOfSpeech || 'unknown',
              phonetic: entry.phonetic,
              pronunciations: entry.phonetics?.map((p:any) => ({ text: p.text, audio: p.audio })),
              senses: entry.meanings?.flatMap((m:any) => m.definitions.map((d:any) => ({
                  definition: d.definition,
                  examples: d.example ? [d.example] : []
              })))
          }]
        };
        setData(mappedData);
      } else setError(t.noTextFound);
    } catch (e) { setError(t.noTextFound); } finally { setLoading(false); }
  };

  const handleSearch = (term?: string) => {
      const actualTerm = term || searchTerm;
      if (actualTerm && actualTerm.trim()) {
          setSearchTerm(actualTerm);
          if (activeTab === 'dict') fetchDefinition(actualTerm.trim());
          else if (activeTab === 'script') fetchFromScript(actualTerm.trim());
      }
  };

  const handleAppendWord = () => {
      const current = searchTerm.trim();
      let combined = "";
      for(let i=0; i<segments.length; i++) {
          combined += segments[i].segment;
          if (combined.endsWith(current) && combined.length >= current.length) {
              let nextPart = "";
              for(let j=i+1; j<segments.length; j++) {
                   nextPart += segments[j].segment;
                   if (segments[j].isWordLike) {
                       setSearchTerm(current + nextPart);
                       return;
                   }
              }
          }
      }
  };

  const handleTabChange = (tab: 'dict' | 'web' | 'script') => {
      setActiveTab(tab);
      if (tab === 'script' && searchTerm && !scriptHtml) fetchFromScript(searchTerm);
      else if (tab === 'dict' && searchTerm && !data) fetchDefinition(searchTerm);
  };

  const playAudio = (url: string) => { new Audio(url).play().catch(e => console.error(e)); };

  const playTTS = () => {
      if (!settings.ttsEnabled) return;
      if (!sentence) return;
      if (settings.ttsVoiceURI) {
          const utt = new SpeechSynthesisUtterance(sentence);
          const voice = window.speechSynthesis.getVoices().find(v => v.voiceURI === settings.ttsVoiceURI);
          if (voice) utt.voice = voice;
          window.speechSynthesis.speak(utt);
      } else {
          const utt = new SpeechSynthesisUtterance(sentence);
          window.speechSynthesis.speak(utt);
      }
  };

  const getSearchUrl = (term: string) => {
      const encoded = encodeURIComponent(term);
      const engine = settings.webSearchEngine || 'google';
      // Use interface language for target translation language
      const targetLang = settings.language === 'zh' ? 'zh' : 'en'; 
      
      switch (engine) {
          case 'bing': return `https://www.bing.com/search?q=${encoded}`;
          case 'duckduckgo': return `https://duckduckgo.com/?q=${encoded}`;
          case 'baidu': return `https://www.baidu.com/s?wd=${encoded}`;
          
          // Translators
          case 'bing_trans': return `https://www.bing.com/translator?text=${encoded}&to=${targetLang === 'zh' ? 'zh-Hans' : 'en'}`;
          case 'deepl': return `https://www.deepl.com/translator#auto/${targetLang === 'zh' ? 'zh' : 'en-US'}/${encoded}`;
          case 'baidu_trans': return `https://fanyi.baidu.com/#auto/${targetLang}/${encoded}`;
          case 'youdao_trans': return `https://www.youdao.com/w/${encoded}`;
          
          case 'google': default: return `https://www.google.com/search?igu=1&q=${encoded}`;
      }
  };

  const handleCustomImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const reader = new FileReader();
          reader.onload = () => {
              if (reader.result) setCustomImage(reader.result as string);
          };
          reader.readAsDataURL(e.target.files[0]);
      }
  };

  const handleAddToAnki = async (term: string, def: string, sent: string) => {
      setIsAddingToAnki(true);
      const boldedSentence = sent.replace(term, `<b>${term}</b>`);
      try {
          await addNote(ankiSettings, {
              word: term,
              sentence: boldedSentence,
              meaning: def,
              imageBase64: customImage || images?.original,
              translatedImageBase64: images?.translated,
          });
          alert(t.addedToAnki);
      } catch (e) {
          alert(t.failedAnki);
      } finally {
          setIsAddingToAnki(false);
      }
  };

  const handleAnkiClick = () => {
      let definitionToUse = customDef;
      if (activeTab === 'dict' && !customDef && data) definitionToUse = formatDictionaryHTML(data);
      else if (activeTab === 'script' && !customDef) {
          if (scriptContainerRef.current) definitionToUse = scriptContainerRef.current.innerHTML;
          else if (scriptHtml) definitionToUse = scriptHtml;
      }
      handleAddToAnki(searchTerm, definitionToUse, sentence);
  };

  const toggleWebMode = () => {
      setWebMode(prev => prev === 'iframe' ? 'external' : 'iframe');
  };

  const handleWebBack = () => {
      try { iframeRef.current?.contentWindow?.history.back(); } catch (e) { console.log('Back nav restricted'); }
  };

  const handleWebForward = () => {
      try { iframeRef.current?.contentWindow?.history.forward(); } catch (e) { console.log('Forward nav restricted'); }
  };

  const handleWebReload = () => {
      if (iframeRef.current) {
          // Force reload by re-assigning src
          iframeRef.current.src = iframeRef.current.src;
      }
  };

  const searchUrl = getSearchUrl(searchTerm);

  const containerClasses = `fixed z-[200] transition-transform duration-300 shadow-2xl bg-surface border-white/10 flex flex-col 
    md:inset-y-0 md:right-0 md:w-[400px] md:border-l md:rounded-l-2xl
    max-md:inset-x-0 max-md:bottom-0 max-md:h-[80dvh] max-md:rounded-t-2xl max-md:border-t
    ${isOpen 
        ? 'md:translate-x-0 max-md:translate-y-0 opacity-100 pointer-events-auto' 
        : 'md:translate-x-full max-md:translate-y-full opacity-0 pointer-events-none'
    }`;
    
  const overlayClasses = `fixed inset-0 z-[190] bg-black/50 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`;

  const gapClass = 'gap-x-0 gap-y-1'; 

  return (
    <>
      {(!isPinned) && <div className={overlayClasses} onClick={onClose} />}
      <div key={isOpen ? "open" : "closed"} className={containerClasses}>
        <div className="p-4 border-b border-white/10 flex flex-col gap-3 shrink-0 bg-gradient-to-b from-white/5 to-transparent">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-200 flex items-center gap-2"><BookOpen size={18} className="text-primary" /> {t.dictionaryMode}</h3>
                <div className="flex items-center gap-1">
                    <button onClick={() => setIsPinned(!isPinned)} className={`p-2 rounded-full transition-colors ${isPinned ? 'text-primary bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/10'}`} title={isPinned ? "Unpin" : "Pin"}>{isPinned ? <Pin size={18} className="fill-current" /> : <Pin size={18} />}</button>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"><X size={20} /></button>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <div className="relative group flex-1">
                   <input 
                      value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className="w-full bg-black/40 border border-white/10 group-hover:border-white/20 rounded-xl pl-4 pr-28 py-2.5 text-sm text-white focus:border-primary outline-none placeholder:text-slate-500 transition-all"
                      placeholder={t.searchDict}
                   />
                   <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <button 
                          onClick={handleAppendWord}
                          className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                          title={t.appendWord}
                      >
                          <Plus size={18} />
                      </button>
                      <button onClick={() => handleSearch()} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"><Search size={18} /></button>
                      <button 
                          onClick={handleAnkiClick}
                          disabled={isAddingToAnki || !searchTerm}
                          className="text-primary-300 hover:text-primary hover:bg-white/10 p-1.5 rounded-lg transition-colors disabled:opacity-50"
                          title={t.addToAnki}
                      >
                          {isAddingToAnki ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                      </button>
                   </div>
                </div>
            </div>
        </div>
        
        {sentence && (
        <div className="bg-black/20 border-y border-white/5 p-3 shrink-0 flex gap-2 items-start">
             <div className="flex-1 text-sm leading-relaxed text-slate-200 overflow-y-auto max-h-[15dvh]">
                  <div className={`flex flex-wrap ${gapClass}`}>
                      {segments.map((item, i) => {
                          if (!item.isWordLike) return <span key={i} className="whitespace-pre opacity-70">{item.segment}</span>;
                          return ( <span key={i} className="cursor-pointer hover:text-primary hover:bg-white/10 rounded px-0 transition-colors" onClick={() => handleSearch(item.segment.trim())}>{item.segment}</span> );
                      })}
                  </div>
             </div>
             <div className="flex flex-col gap-1">
                {settings.ttsEnabled && (
                    <button onClick={playTTS} className="p-1 text-slate-400 hover:text-primary hover:bg-white/5 rounded-full transition-colors" title={t.tts}>
                        <PlayCircle size={18} />
                    </button>
                )}
                <button onClick={() => handleSearch(sentence)} className="p-1 text-slate-400 hover:text-primary hover:bg-white/5 rounded-full transition-colors" title={t.searchWholeSentence}>
                    <Search size={18} />
                </button>
             </div>
        </div>
        )}

        <div className="flex border-b border-white/10 shrink-0 bg-black/20">
             <button onClick={() => handleTabChange('dict')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 flex items-center justify-center gap-2 ${activeTab === 'dict' ? 'border-primary text-white bg-white/5' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}><BookOpen size={14}/> {t.dictionaryTab}</button>
             <button onClick={() => handleTabChange('script')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 flex items-center justify-center gap-2 ${activeTab === 'script' ? 'border-primary text-white bg-white/5' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}><Puzzle size={14}/> {t.tampermonkeyTab}</button>
             <button onClick={() => handleTabChange('web')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 flex items-center justify-center gap-2 ${activeTab === 'web' ? 'border-primary text-white bg-white/5' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}><Globe size={14}/> {t.webTab}</button>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent bg-surface">
            {activeTab === 'dict' && (
                <div className="space-y-6 p-5 pb-8">
                    {loading ? ( <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500"><Loader2 className="animate-spin text-primary" size={32} /><span className="text-xs font-medium uppercase tracking-widest">{t.loading}</span></div> ) 
                    : error ? ( <div className="text-center py-20 px-6"><div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-500"><Search size={32} /></div><p className="text-slate-300 mb-2 font-medium">{error}</p></div> ) 
                    : data ? (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex items-baseline justify-between mb-4 pb-4 border-b border-white/5">
                                <div><h2 className="text-3xl font-bold text-white mb-1 tracking-tight">{data.word}</h2>{data.entries[0]?.phonetic && <span className="text-primary/80 font-mono text-sm">[{data.entries[0].phonetic}]</span>}</div>
                                {data.entries[0]?.pronunciations?.[0]?.audio && ( <button onClick={() => playAudio(data.entries[0].pronunciations![0].audio!)} className="p-3 bg-white/5 rounded-full hover:bg-primary hover:text-white transition-all text-slate-300 shadow-lg border border-white/5"><Volume2 size={20} /></button> )}
                            </div>
                            {data.entries.map((entry, i) => (
                                <div key={i} className="mb-8 last:mb-0"><span className="inline-block px-2.5 py-0.5 bg-primary/20 text-primary-200 border border-primary/20 text-[10px] font-bold uppercase rounded-md mb-3 tracking-wide">{entry.partOfSpeech}</span><div className="space-y-4">{entry.senses?.map((sense, j) => ( <div key={j} className="text-sm text-slate-300 pl-4 border-l-2 border-white/10 relative"><p className="leading-relaxed">{sense.definition}</p>{sense.examples?.[0] && ( <p className="text-xs text-slate-500 mt-1.5 italic font-medium">"{sense.examples[0]}"</p> )}</div> ))}</div></div>
                            ))}
                        </div>
                    ) : ( <div className="flex flex-col items-center justify-center h-full text-slate-500 opacity-50 pb-20"><BookOpen size={48} strokeWidth={1} /><p className="text-sm mt-4">{t.searchDict}</p></div> )}
                </div>
            )}
            {activeTab === 'script' && ( <div className="w-full h-full flex flex-col p-4 bg-[#0f172a] text-slate-200">{scriptLoading ? ( <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500"><Loader2 className="animate-spin text-primary" size={32} /><span className="text-xs font-medium uppercase tracking-widest">{t.tampermonkeyInfo}</span></div> ) : scriptHtml ? ( <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 h-full flex flex-col"><div ref={scriptContainerRef} className="prose prose-invert prose-sm max-w-none text-slate-200 overflow-x-hidden" dangerouslySetInnerHTML={{ __html: scriptHtml }} /></div> ) : ( <div className="flex flex-col items-center justify-center h-full text-slate-500 opacity-50 pb-20 text-center px-4"><Puzzle size={48} strokeWidth={1} /><p className="text-sm mt-4 font-bold">{t.tampermonkeyTab}</p></div> )}</div> )}
            {activeTab === 'web' && ( 
              <div className="w-full h-full flex flex-col bg-white relative">
                <div className="p-2 border-b bg-slate-50 flex items-center justify-between px-4">
                    <span className="text-xs font-bold text-slate-500 uppercase">{t.webTab}</span>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                            <button onClick={handleWebBack} className="p-1.5 rounded hover:bg-slate-200 text-slate-600" title="Back"><ArrowLeft size={14}/></button>
                            <button onClick={handleWebForward} className="p-1.5 rounded hover:bg-slate-200 text-slate-600" title="Forward"><ArrowRight size={14}/></button>
                            <button onClick={handleWebReload} className="p-1.5 rounded hover:bg-slate-200 text-slate-600" title="Refresh"><RotateCw size={14}/></button>
                        </div>
                        <div className="h-4 w-px bg-slate-300"></div>
                        <button onClick={toggleWebMode} className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-[10px] font-bold text-slate-600 transition-colors uppercase">
                            {webMode === 'iframe' ? <AppWindow size={12}/> : <ExternalLink size={12}/>}
                            {webMode === 'iframe' ? trans(lang, 'openInIframe') : trans(lang, 'openExternal')}
                        </button>
                    </div>
                </div>
                
                {/* 
                  Internal Mode: Block popups to force links to try to stay in frame (though XFO might block).
                  External Mode: Allow popups so clicks open new windows.
                */}
                <iframe 
                    ref={iframeRef}
                    src={searchUrl} 
                    className="w-full flex-1 border-0" 
                    sandbox={webMode === 'external' 
                        ? "allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" 
                        : "allow-forms allow-scripts allow-same-origin"}
                />
                
                {webMode === 'external' && (
                    <div className="absolute top-12 right-4 z-10 pointer-events-none">
                        <div className="bg-black/70 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm shadow-lg pointer-events-auto flex items-center gap-2">
                             Popups Enabled <ExternalLink size={10}/>
                             <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="underline font-bold text-primary-300">Open</a>
                        </div>
                    </div>
                )}
                
                <div className="space-y-2 mt-auto border-t border-slate-200 bg-slate-50 p-4 shrink-0">
                  <div className="flex justify-between items-center">
                      <h4 className="text-xs font-bold text-slate-600 uppercase flex items-center gap-2"><PenTool size={12}/> {t.customTab}</h4>
                      <div className="flex gap-2">
                          <label className="p-1.5 bg-slate-200 hover:bg-slate-300 rounded cursor-pointer transition-colors text-slate-600" title={t.uploadImage}>
                              <ImageIcon size={14}/>
                              <input type="file" accept="image/*" className="hidden" onChange={handleCustomImageUpload} />
                          </label>
                          {customImage && (
                              <div className="relative w-6 h-6 border border-slate-300 rounded overflow-hidden group">
                                  <img src={customImage} className="w-full h-full object-cover" />
                                  <button onClick={() => setCustomImage(null)} className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100"><X size={10}/></button>
                              </div>
                          )}
                      </div>
                  </div>
                  <textarea className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm text-slate-800 focus:border-primary outline-none transition-all placeholder:text-slate-400 h-16 resize-none" placeholder={t.customDefPlaceholder} value={customDef} onChange={(e) => setCustomDef(e.target.value)}></textarea>
                </div>
              </div> 
            )}
        </div>
      </div>
    </>
  );
};

export default DictionaryPanel;
