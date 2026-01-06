
import React, { useState, useEffect, useRef } from 'react';
import { AnkiSettingsType, ReaderSettings } from '../../types';
import { Search, Plus, Loader2, BookOpen, X, ArrowRight, Volume2, ExternalLink, PenTool, Globe, Puzzle, Pin } from 'lucide-react';
import { translations } from '../../services/i18n';
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
  // Reader passes these:
  query: string;
  fullSentence: string;
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
  isOpen, onClose, query: word, fullSentence: sentence, 
  ankiSettings, settings
}) => {
  const lang = settings.language;
  const t = translations[lang] || translations['en'];
  const learningLanguage = settings.dictionaryLanguage || 'en'; // Use setting or default to EN

  const [searchTerm, setSearchTerm] = useState(word);
  const [data, setData] = useState<DictionaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'dict' | 'web' | 'script'>('dict');
  const [customDef, setCustomDef] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [scriptHtml, setScriptHtml] = useState<string | null>(null);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [isAddingToAnki, setIsAddingToAnki] = useState(false);

  const scriptTimeoutRef = useRef<number | null>(null);
  const currentRequestId = useRef<string>('');
  const isMountedRef = useRef(false);
  const segmenterRef = useRef<any>(null);
  const prevIsOpen = useRef(isOpen);
  const prevWord = useRef(word);
  const prevLang = useRef(learningLanguage);
  const scriptContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      isMountedRef.current = true;
      try {
        segmenterRef.current = new (Intl as any).Segmenter(undefined, { granularity: 'word' });
      } catch (e) {}
      return () => { isMountedRef.current = false; };
  }, [learningLanguage]);

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
    if ((wordChanged && word) || (langChanged && word)) {
        setSearchTerm(word);
        if (activeTab === 'script') fetchFromScript(word);
        else { setActiveTab('dict'); fetchDefinition(word); }
        return;
    }
    if ((justOpened || (wordChanged && !word)) && !word) {
        setSearchTerm(''); setData(null); setScriptHtml(null);
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
      // Use the language code from settings
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/${learningLanguage}/${term}`);
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

  const handleTabChange = (tab: 'dict' | 'web' | 'script') => {
      setActiveTab(tab);
      if (tab === 'script' && searchTerm && !scriptHtml) fetchFromScript(searchTerm);
      else if (tab === 'dict' && searchTerm && !data) fetchDefinition(searchTerm);
  };

  const playAudio = (url: string) => { new Audio(url).play().catch(e => console.error(e)); };

  const getSearchUrl = (term: string) => {
      const encoded = encodeURIComponent(term);
      return `https://www.google.com/search?igu=1&q=${encoded}`;
  };

  const handleAddToAnki = async (term: string, def: string, sent?: string) => {
      setIsAddingToAnki(true);
      try {
          await addNote(ankiSettings, {
              word: term,
              sentence: sent || '',
              meaning: def
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
      
      if (activeTab === 'dict' && !customDef && data) {
          definitionToUse = formatDictionaryHTML(data);
      } else if (activeTab === 'script' && !customDef) {
          // If in script tab, try to capture the innerHTML of the container
          if (scriptContainerRef.current) {
              definitionToUse = scriptContainerRef.current.innerHTML;
          } else if (scriptHtml) {
              definitionToUse = scriptHtml;
          }
      }
      
      handleAddToAnki(searchTerm, definitionToUse, sentence);
  };

  const searchUrl = getSearchUrl(searchTerm);

  // Responsive Layout Classes
  // landscape: (screen width > height usually indicates desktop/tablet landscape) or just use md breakpoint
  // Standard (Mobile/Portrait): Bottom sheet
  // Landscape/Wide: Right Sidebar
  const containerClasses = `fixed z-[200] transition-transform duration-300 shadow-2xl bg-surface border-white/10 flex flex-col 
    md:inset-y-0 md:right-0 md:w-[400px] md:border-l md:rounded-l-2xl
    max-md:inset-x-0 max-md:bottom-0 max-md:h-[80dvh] max-md:rounded-t-2xl max-md:border-t
    ${isOpen 
        ? 'md:translate-x-0 max-md:translate-y-0 opacity-100 pointer-events-auto' 
        : 'md:translate-x-full max-md:translate-y-full opacity-0 pointer-events-none'
    }`;
    
  const overlayClasses = `fixed inset-0 z-[190] bg-black/50 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`;

  const renderInteractiveSentence = () => {
      if (!sentence) return null;
      let segments: { segment: string; isWordLike: boolean }[] = [];
      if (segmenterRef.current) {
          const iter = segmenterRef.current.segment(sentence);
          segments = Array.from(iter).map((s: any) => ({ segment: s.segment, isWordLike: s.isWordLike }));
      } else segments = sentence.split(/(\s+)/).map((s) => ({ segment: s, isWordLike: /\S/.test(s) }));
      return (
          <div className="bg-black/20 border-y border-white/5 p-4 text-sm leading-relaxed text-slate-200 shrink-0 overflow-y-auto max-h-[15dvh]">
              <div className="flex flex-wrap gap-0">
                  {segments.map((item, i) => {
                      if (!item.isWordLike) return <span key={i} className="whitespace-pre opacity-70">{item.segment}</span>;
                      return ( <span key={i} className="cursor-pointer hover:text-primary hover:bg-white/10 rounded px-0.5 transition-colors whitespace-pre" onClick={() => handleSearch(item.segment.trim())}>{item.segment}</span> );
                  })}
              </div>
          </div>
      );
  };

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
                      className="w-full bg-black/40 border border-white/10 group-hover:border-white/20 rounded-xl pl-4 pr-24 py-2.5 text-sm text-white focus:border-primary outline-none placeholder:text-slate-500 transition-all"
                      placeholder={t.searchDict}
                   />
                   <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <button 
                          onClick={handleAnkiClick}
                          disabled={isAddingToAnki || !searchTerm}
                          className="text-primary-300 hover:text-primary hover:bg-white/10 p-1.5 rounded-lg transition-colors disabled:opacity-50"
                          title={t.addToAnki}
                      >
                          {isAddingToAnki ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                      </button>
                      <button onClick={() => handleSearch()} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"><Search size={18} /></button>
                   </div>
                </div>
            </div>
        </div>
        {renderInteractiveSentence()}
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
              <div className="w-full h-full flex flex-col bg-white">
                <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="p-2 bg-slate-100 border-b text-center text-xs text-slate-500 hover:text-primary flex items-center justify-center gap-2">{t.openInBrowser} <ExternalLink size={12} /></a>
                <iframe src={searchUrl} className="w-full flex-1 border-0" sandbox="allow-forms allow-scripts allow-same-origin" />
                <div className="space-y-3 mt-4 pt-4 border-t border-slate-200 bg-slate-50 p-4 shrink-0">
                  <h4 className="text-xs font-bold text-slate-600 uppercase flex items-center gap-2"><PenTool size={12}/> {t.customTab}</h4>
                  <textarea className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm text-slate-800 focus:border-primary outline-none transition-all placeholder:text-slate-400 min-h-[80px]" placeholder={t.customDefPlaceholder} value={customDef} onChange={(e) => setCustomDef(e.target.value)}></textarea>
                </div>
              </div> 
            )}
        </div>
      </div>
    </>
  );
};

export default DictionaryPanel;
