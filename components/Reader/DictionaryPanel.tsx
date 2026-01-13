

import React, { useState, useEffect, useRef } from 'react';
import { AnkiSettingsType, ReaderSettings, WebSearchEngine } from '../../types';
import { Search, Plus, Loader2, BookOpen, X, ArrowRight, Volume2, ExternalLink, PenTool, Globe, Puzzle, Pin, PlayCircle, Save, Image as ImageIcon, Maximize, AppWindow, ArrowLeft, RotateCw, Monitor, Smartphone, LayoutGrid, ChevronDown, ChevronUp, Copy, BookOpenText, FileText, Clipboard, ClipboardCheck, Eraser } from 'lucide-react';
import { translations, t as trans } from '../../services/i18n';
import { addNote } from '../../services/anki';
import { fetchFreeDictionaryApi, searchLocalDictionaries, ApiDictionaryResponse } from '../../services/dictionary';
// @ts-ignore
import kuromoji from 'kuromoji';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  fullSentence: string;
  images?: { original?: string; translated?: string }; 
  ankiSettings: AnkiSettingsType;
  settings: ReaderSettings;
  bookAnkiTags?: string;
  onUpdateSettings?: (s: ReaderSettings) => void;
}

const DictionaryPanel: React.FC<Props> = ({ 
  isOpen, onClose, query: word, fullSentence: sentence, images,
  ankiSettings, settings, bookAnkiTags, onUpdateSettings
}) => {
  const lang = settings.language;
  const t = (key: keyof typeof translations['en']) => trans(lang, key);
  const learningLanguage = settings.learningLanguage || 'en';

  const [searchTerm, setSearchTerm] = useState(word);
  const [data, setData] = useState<ApiDictionaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'dict' | 'web' | 'script' | 'custom'>('dict');
  const [customDef, setCustomDef] = useState('');
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [scriptHtml, setScriptHtml] = useState<string | null>(null);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [isAddingToAnki, setIsAddingToAnki] = useState(false);
  
  const [currentAudioData, setCurrentAudioData] = useState<string | null>(null);

  // Web Tab Local State
  const [showWebCustomDef, setShowWebCustomDef] = useState(false); 
  
  // Local state for source toggle
  const [dictSource, setDictSource] = useState<'api' | 'local'>(settings.dictionarySource || 'api');

  // Web search settings
  const [webMode, setWebMode] = useState<'iframe' | 'external'>(settings.webSearchMode || 'iframe');
  
  // Web Tab Local State
  const [localCategory, setLocalCategory] = useState<'search' | 'translate' | 'encyclopedia'>('search');
  const [localEngine, setLocalEngine] = useState<WebSearchEngine>(settings.webSearchEngine || 'google');
  const [isMobile, setIsMobile] = useState(true);
  
  // Navigation History
  const [history, setHistory] = useState<string[]>([]);
  
  const [segments, setSegments] = useState<{ segment: string, isWordLike: boolean }[]>([]);

  const scriptTimeoutRef = useRef<number | null>(null);
  const currentRequestId = useRef<string>('');
  const isMountedRef = useRef(false);
  const segmenterRef = useRef<any>(null);
  const kuromojiTokenizer = useRef<any>(null);
  const prevIsOpen = useRef(isOpen);
  const prevWord = useRef(word);
  const prevLang = useRef(learningLanguage);
  const scriptContainerRef = useRef<HTMLDivElement>(null);
  
  // Ref for iframe to implement refresh/back
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Theming Helpers
  const isLight = settings.theme === 'light';
  const colors = {
      bg: isLight ? 'bg-white' : 'bg-surface',
      bgSub: isLight ? 'bg-zinc-50' : 'bg-black/20',
      border: isLight ? 'border-zinc-200' : 'border-white/10',
      textMain: isLight ? 'text-zinc-800' : 'text-zinc-100',
      textSub: isLight ? 'text-zinc-500' : 'text-slate-400',
      inputBg: isLight ? 'bg-zinc-100' : 'bg-black/40',
      placeholder: isLight ? 'placeholder:text-zinc-400' : 'placeholder:text-slate-500',
      activeTab: isLight ? 'border-primary text-zinc-800 bg-zinc-100' : 'border-primary text-white bg-white/5',
      inactiveTab: isLight ? 'border-transparent text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5'
  };

  const toggleClipboardMode = () => {
      if (onUpdateSettings) {
          onUpdateSettings({ ...settings, copyToClipboard: !settings.copyToClipboard });
      }
  };

  useEffect(() => {
      const engine = settings.webSearchEngine;
      setLocalEngine(engine);
      if (['baidu_baike', 'wikipedia', 'moegirl'].includes(engine)) setLocalCategory('encyclopedia');
      else if (['bing_trans', 'deepl', 'baidu_trans', 'youdao_trans'].includes(engine)) setLocalCategory('translate');
      else setLocalCategory('search');
  }, [settings.webSearchEngine]);

  useEffect(() => {
      isMountedRef.current = true;
      try {
        if (settings.segmentationMethod === 'browser') {
            segmenterRef.current = new (Intl as any).Segmenter(undefined, { granularity: 'word' });
        } else {
            segmenterRef.current = null;
        }
      } catch (e) { segmenterRef.current = null; }

      // Initialize Kuromoji if needed with reliable CDN
      if (settings.segmentationMethod === 'kuromoji' && !kuromojiTokenizer.current) {
          try {
              // Use jsDelivr CDN which correctly serves the dictionary files
              const dicPath = "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/";
              kuromoji.builder({ dicPath }).build((err: any, tokenizer: any) => {
                  if(err) {
                      console.error("Kuromoji build error:", err);
                  } else {
                      kuromojiTokenizer.current = tokenizer;
                      // Trigger re-segmentation if sentence is already waiting
                      if (sentence) {
                          setSegments(prev => [...prev]); 
                      }
                  }
              });
          } catch(e) { console.error("Kuromoji init failed", e); }
      }

      return () => { isMountedRef.current = false; };
  }, [settings.segmentationMethod]);

  const requestExternalSegmentation = (text: string) => {
      return new Promise<{ segment: string, isWordLike: boolean }[]>((resolve) => {
          const id = Date.now().toString();
          const handler = (event: MessageEvent) => {
              if (event.data && event.data.type === 'MOKURO_SEG_RESPONSE' && event.data.id === id) {
                  window.removeEventListener('message', handler);
                  const segs = event.data.segments || [];
                  resolve(segs.map((s: string) => ({ segment: s, isWordLike: s.trim().length > 0 })));
              }
          };
          window.addEventListener('message', handler);
          window.postMessage({ type: 'MOKURO_SEG_REQUEST', text, id }, '*');
          
          setTimeout(() => {
              window.removeEventListener('message', handler);
              resolve([{ segment: text, isWordLike: true }]); // Fallback
          }, 3000);
      });
  };

  useEffect(() => {
      if (!sentence) { setSegments([]); return; }
      
      const processSegmentation = async () => {
          if (settings.segmentationMethod === 'external') {
              const res = await requestExternalSegmentation(sentence);
              setSegments(res);
          } else if (settings.segmentationMethod === 'kuromoji') {
              if (kuromojiTokenizer.current) {
                  const tokens = kuromojiTokenizer.current.tokenize(sentence);
                  setSegments(tokens.map((t: any) => ({ segment: t.surface_form, isWordLike: true })));
              } else {
                  // Fallback while loading
                  setSegments(sentence.split(/(\s+)/).map((s) => ({ segment: s, isWordLike: /\S/.test(s) })));
              }
          } else if (settings.segmentationMethod === 'browser' && segmenterRef.current) {
              const iter = segmenterRef.current.segment(sentence);
              setSegments(Array.from(iter).map((s: any) => ({ segment: s.segment, isWordLike: s.isWordLike })));
          } else {
              setSegments(sentence.split(/(\s+)/).map((s) => ({ segment: s, isWordLike: /\S/.test(s) })));
          }
      };
      
      processSegmentation();
  }, [sentence, settings.segmentationMethod, kuromojiTokenizer.current]);


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
        // Reset history on new open
        setHistory([]);
        setCurrentAudioData(null);

        if (word) {
            if (activeTab === 'script') fetchFromScript(word);
            else if (activeTab === 'web') pushToHistory(word);
            else if (activeTab === 'custom') { /* Do nothing */ }
            else { setActiveTab('dict'); fetchDefinition(word); }
        } else {
            setLoading(false);
        }
    } else if (wordChanged && word) {
        setSearchTerm(word);
        if (activeTab === 'script') fetchFromScript(word);
        else if (activeTab === 'web') pushToHistory(word);
        else if (activeTab === 'custom') { /* Do nothing */ }
        else { setActiveTab('dict'); fetchDefinition(word); }
    } else if (langChanged && searchTerm) {
        if (activeTab === 'script') fetchFromScript(searchTerm);
        else if (activeTab === 'web') pushToHistory(searchTerm);
        else if (activeTab === 'custom') { /* Do nothing */ }
        else { setActiveTab('dict'); fetchDefinition(searchTerm); }
    }
  }, [isOpen, word, learningLanguage]);

  const pushToHistory = (term: string) => {
      const url = getSearchUrl(term);
      if (history.length > 0 && history[history.length-1] === url) return;
      setHistory([...history, url]);
  };

  useEffect(() => {
      if (activeTab === 'web' && searchTerm) {
          pushToHistory(searchTerm);
      }
  }, [localEngine, isMobile]);

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
              setScriptHtml(`<div class="${colors.textSub} text-center p-4 text-xs"><p>No script response.</p><p class="mt-2 opacity-75 text-[10px]">Ensure userscript is installed.</p></div>`);
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
        let result: ApiDictionaryResponse | null = null;
        
        if (dictSource === 'local') {
            result = await searchLocalDictionaries(term, learningLanguage);
        }
        
        if (!result && dictSource === 'api') {
            result = await fetchFreeDictionaryApi(term, learningLanguage);
        }

        if (result) {
            setData(result);
        } else {
            setError(dictSource === 'local' ? t('noDefinitionFound') : t('noTextFound'));
        }
    } catch (e) { 
        setError(t('noTextFound')); 
    } finally { 
        setLoading(false); 
    }
  };

  useEffect(() => {
      if (activeTab === 'dict' && searchTerm) {
          fetchDefinition(searchTerm);
      }
  }, [dictSource]);

  const handleSearch = (term?: string) => {
      const actualTerm = term || searchTerm;
      if (actualTerm && actualTerm.trim()) {
          setSearchTerm(actualTerm);
          if (settings.copyToClipboard) {
              navigator.clipboard.writeText(actualTerm.trim()).catch(() => {});
          }
          if (activeTab === 'dict') fetchDefinition(actualTerm.trim());
          else if (activeTab === 'script') fetchFromScript(actualTerm.trim());
          else if (activeTab === 'web') pushToHistory(actualTerm.trim());
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
                       const newTerm = current + nextPart;
                       setSearchTerm(newTerm);
                       if(settings.copyToClipboard) navigator.clipboard.writeText(newTerm).catch(()=>{});
                       return;
                   }
              }
          }
      }
  };

  const handleTabChange = (tab: 'dict' | 'web' | 'script' | 'custom') => {
      setActiveTab(tab);
      // Clear custom definition input on tab switch
      setCustomDef(''); 
      setCustomImage(null);

      if (tab === 'script' && searchTerm && !scriptHtml) fetchFromScript(searchTerm);
      else if (tab === 'dict' && searchTerm && !data) fetchDefinition(searchTerm);
      else if (tab === 'web' && searchTerm && history.length === 0) pushToHistory(searchTerm);
  };

  const playTTS = async (textToSpeak: string = sentence) => {
      if (!settings.ttsEnabled) return;
      if (!textToSpeak) return;

      if (settings.audioSource === 'external') {
          const id = Date.now().toString();
          const handler = (event: MessageEvent) => {
              if (event.data && event.data.type === 'MOKURO_AUDIO_RESPONSE' && event.data.id === id) {
                  window.removeEventListener('message', handler);
                  const audioData = event.data.audioData;
                  if (audioData) {
                      new Audio(audioData).play().catch(e => console.error(e));
                      setCurrentAudioData(audioData);
                  }
              }
          };
          window.addEventListener('message', handler);
          
          // Send params if enabled
          const msg: any = { 
              type: 'MOKURO_AUDIO_REQUEST', 
              text: textToSpeak, 
              id
          };
          
          if (settings.externalAudioParamsEnabled) {
              msg.params = {
                  rate: settings.ttsRate,
                  pitch: settings.ttsPitch,
                  volume: settings.ttsVolume
              };
          }

          window.postMessage(msg, '*');
          
          setTimeout(() => window.removeEventListener('message', handler), 5000);
          return;
      }

      if (settings.ttsVoiceURI) {
          const utt = new SpeechSynthesisUtterance(textToSpeak);
          const voice = window.speechSynthesis.getVoices().find(v => v.voiceURI === settings.ttsVoiceURI);
          if (voice) utt.voice = voice;
          utt.rate = settings.ttsRate || 1;
          utt.pitch = settings.ttsPitch || 1;
          utt.volume = settings.ttsVolume || 1;
          window.speechSynthesis.speak(utt);
      } else {
          const utt = new SpeechSynthesisUtterance(textToSpeak);
          utt.rate = settings.ttsRate || 1;
          utt.pitch = settings.ttsPitch || 1;
          utt.volume = settings.ttsVolume || 1;
          window.speechSynthesis.speak(utt);
      }
  };

  const getSearchUrl = (term: string) => {
      const encoded = encodeURIComponent(term);
      const engine = localEngine; 
      
      let interfaceLang = settings.language === 'zh' ? 'zh-CN' : settings.language === 'zh-Hant' ? 'zh-TW' : 'en'; 
      if (engine === 'bing' || engine === 'bing_trans') {
          interfaceLang = settings.language === 'zh' ? 'zh-Hans' : settings.language === 'zh-Hant' ? 'zh-Hant' : 'en';
      }

      const sourceLang = (settings.learningLanguage || 'auto') as string; 

      const getSourceCode = (engine: WebSearchEngine) => {
          if (sourceLang === 'auto') return 'auto';
          switch(engine) {
              case 'bing_trans': return sourceLang === 'zh' ? 'zh-Hans' : sourceLang === 'zh-Hant' ? 'zh-Hant' : sourceLang;
              case 'deepl': return sourceLang === 'zh' ? 'ZH' : sourceLang === 'ja' ? 'JA' : sourceLang.toUpperCase();
              case 'google': return sourceLang === 'zh' ? 'zh-CN' : sourceLang === 'zh-Hant' ? 'zh-TW' : sourceLang;
              default: return sourceLang;
          }
      };

      const srcCode = getSourceCode(engine);

      switch (engine) {
          case 'bing': return `https://www.bing.com/search?q=${encoded}&setlang=${interfaceLang}`;
          case 'duckduckgo': return `https://duckduckgo.com/?q=${encoded}&kl=${interfaceLang === 'zh-TW' ? 'wt-wt' : 'us-en'}`;
          case 'baidu': return isMobile ? `https://m.baidu.com/s?wd=${encoded}` : `https://www.baidu.com/s?wd=${encoded}`;
          case 'wikipedia': 
             const wikiLang = sourceLang === 'auto' ? 'en' : sourceLang === 'zh' ? 'zh' : sourceLang;
             return isMobile ? `https://${wikiLang}.m.wikipedia.org/wiki/${encoded}` : `https://${wikiLang}.wikipedia.org/wiki/${encoded}`;
          case 'baidu_baike': return `https://baike.baidu.com/item/${encoded}`;
          case 'moegirl': return isMobile ? `https://zh.m.moegirl.org.cn/${encoded}` : `https://zh.moegirl.org.cn/${encoded}`;
          case 'bing_trans': return `https://www.bing.com/translator?text=${encoded}&from=${srcCode}&to=${interfaceLang}`;
          case 'deepl': return `https://www.deepl.com/translator#${srcCode}/${interfaceLang}/${encoded}`;
          case 'baidu_trans': return `https://fanyi.baidu.com/#${srcCode}/${interfaceLang}/${encoded}`;
          case 'youdao_trans': return `https://www.youdao.com/w/${encoded}`;
          case 'google': default: return `https://www.google.com/search?igu=1&q=${encoded}&hl=${interfaceLang}`;
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

  const handleTextFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onload = (ev) => {
              const text = ev.target?.result;
              if (typeof text === 'string') {
                  setCustomDef(text);
              }
          };
          reader.readAsText(file);
      }
  };

  const handleAddToAnki = async (term: string, def: string, sent: string) => {
      if (activeTab === 'custom') {
          if (!customDef && !customImage) {
              alert(t('validationCustom'));
              return;
          }
      }

      setIsAddingToAnki(true);
      // Use bold and black for target word to ensure visibility in Anki
      const boldedSentence = settings.ankiBoldText 
          ? sent.replace(term, `<b style="color: black;">${term}</b>`) 
          : sent;
          
      try {
          await addNote({
              ...ankiSettings,
              tags: bookAnkiTags || ankiSettings.tags
          }, {
              word: term,
              sentence: boldedSentence,
              meaning: activeTab === 'custom' ? customDef : def,
              imageBase64: customImage || images?.original,
              translatedImageBase64: images?.translated,
              audioBase64: currentAudioData || undefined // Pass cached audio if available
          });
          alert(t('addedToAnki'));
          
          // Clear inputs after successful add
          if (activeTab === 'custom') {
              setCustomDef('');
              setCustomImage(null);
          }
      } catch (e) {
          alert(t('failedAnki'));
      } finally {
          setIsAddingToAnki(false);
      }
  };

  const handleAnkiClick = () => {
      let definitionToUse = customDef;
      if (activeTab === 'dict' && !customDef && data) {
          definitionToUse = data.entries.map(e => {
              const pos = `<span class="pos">[${e.partOfSpeech}]</span>`;
              const senses = e.senses?.map(s => `<li>${s.definition}</li>`).join('') || '';
              return `<div>${pos}<ul>${senses}</ul></div>`;
          }).join('<hr/>');
      }
      else if (activeTab === 'script' && !customDef) {
          if (scriptContainerRef.current) definitionToUse = scriptContainerRef.current.innerHTML;
          else if (scriptHtml) definitionToUse = scriptHtml;
      }
      handleAddToAnki(searchTerm, definitionToUse, sentence);
  };

  // ... (web navigation handlers) ...
  const toggleWebMode = () => {
      setWebMode(prev => prev === 'iframe' ? 'external' : 'iframe');
  };

  const handleWebBack = () => {
      try { 
          if(iframeRef.current && iframeRef.current.contentWindow) {
              iframeRef.current.contentWindow.history.back();
          }
      } catch (e) { console.log('Back nav restricted'); }
  };

  const handleWebForward = () => {
      try { 
          if(iframeRef.current && iframeRef.current.contentWindow) {
              iframeRef.current.contentWindow.history.forward(); 
          }
      } catch (e) { console.log('Forward nav restricted'); }
  };

  const handleWebReload = () => {
      if (iframeRef.current) {
          iframeRef.current.src = iframeRef.current.src;
      }
  };

  const currentWebUrl = history.length > 0 ? history[history.length - 1] : '';

  const containerClasses = `fixed z-[200] transition-transform duration-300 shadow-2xl ${colors.bg} border-l ${colors.border} flex flex-col 
    md:inset-y-0 md:right-0 md:w-[400px] md:rounded-l-2xl
    max-md:inset-x-0 max-md:bottom-0 max-md:h-[80dvh] max-md:rounded-t-2xl max-md:border-t
    ${isOpen 
        ? 'md:translate-x-0 max-md:translate-y-0 opacity-100 pointer-events-auto' 
        : 'md:translate-x-full max-md:translate-y-full opacity-0 pointer-events-none'
    }`;
    
  // Iframe Sandbox configuration based on Mode A/B requirement
  const sandboxConfig = webMode === 'external' 
      ? "allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      : "allow-forms allow-scripts allow-same-origin";

  const gapClass = 'gap-x-0 gap-y-1'; 

  return (
    <>
      <div key={isOpen ? "open" : "closed"} className={containerClasses}>
        <div className={`p-4 border-b ${colors.border} flex flex-col gap-3 shrink-0 ${colors.bgSub}`}>
            <div className="flex items-center justify-between">
                <h3 className={`font-semibold flex items-center gap-2 ${colors.textMain}`}><BookOpen size={18} className="text-primary" /> {t('dictionaryMode')}</h3>
                <div className="flex items-center gap-1">
                    <button onClick={() => setIsPinned(!isPinned)} className={`p-2 rounded-full transition-colors ${isPinned ? 'text-primary bg-primary/10' : `${colors.textSub} hover:${colors.textMain} hover:bg-black/5`}`} title={isPinned ? "Unpin" : "Pin"}>{isPinned ? <Pin size={18} className="fill-current" /> : <Pin size={18} />}</button>
                    <button onClick={onClose} className={`p-2 hover:bg-black/5 rounded-full transition-colors ${colors.textSub} hover:${colors.textMain}`}><X size={20} /></button>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <div className="relative group flex-1">
                   <input 
                      value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className={`w-full border rounded-xl pl-4 pr-28 py-2.5 text-sm focus:border-primary outline-none transition-all ${colors.inputBg} ${colors.border} ${colors.textMain} ${colors.placeholder}`}
                      placeholder={t('searchDict')}
                   />
                   <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <button 
                          onClick={handleAppendWord}
                          className={`${colors.textSub} hover:${colors.textMain} p-1.5 rounded-lg hover:bg-black/5 transition-colors`}
                          title={t('appendWord')}
                      >
                          <Plus size={18} />
                      </button>
                      <button 
                          onClick={() => handleSearch(sentence)} 
                          className={`${colors.textSub} hover:${colors.textMain} p-1.5 rounded-lg hover:bg-black/5 transition-colors`}
                          title={t('searchWholeSentence')}
                      >
                          <ArrowRight size={18} />
                      </button>
                      <button onClick={() => handleSearch()} className={`${colors.textSub} hover:${colors.textMain} p-1.5 rounded-lg hover:bg-black/5 transition-colors`}><Search size={18} /></button>
                      <button 
                          onClick={handleAnkiClick}
                          disabled={isAddingToAnki || !searchTerm}
                          className="text-primary hover:text-blue-600 hover:bg-blue-50 p-1.5 rounded-lg transition-colors disabled:opacity-50"
                          title={t('addToAnki')}
                      >
                          {isAddingToAnki ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                      </button>
                   </div>
                </div>
            </div>
        </div>
        
        {sentence && (
        <div className={`${colors.bgSub} border-y ${colors.border} p-3 shrink-0 flex gap-2 items-start`}>
             <div className={`flex-1 text-sm leading-relaxed ${colors.textMain} overflow-y-auto max-h-[15dvh]`}>
                  <div className={`flex flex-wrap ${gapClass}`}>
                      {segments.map((item, i) => {
                          if (!item.isWordLike) return <span key={i} className="whitespace-pre opacity-70">{item.segment}</span>;
                          return ( <span key={i} className="cursor-pointer hover:text-primary hover:bg-primary/5 rounded px-0 transition-colors" onClick={() => handleSearch(item.segment.trim())}>{item.segment}</span> );
                      })}
                  </div>
             </div>
             <div className="flex flex-col gap-1">
                {settings.ttsEnabled && (
                    <button onClick={() => playTTS(sentence)} className={`p-1 ${colors.textSub} hover:text-primary hover:bg-black/5 rounded-full transition-colors`} title={t('tts')}>
                        <PlayCircle size={18} />
                    </button>
                )}
             </div>
        </div>
        )}

        <div className={`flex border-b ${colors.border} shrink-0 ${colors.bgSub}`}>
             <button onClick={() => handleTabChange('dict')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 flex items-center justify-center gap-2 ${activeTab === 'dict' ? colors.activeTab : colors.inactiveTab}`}><BookOpen size={14}/> {t('dictionaryTab')}</button>
             <button onClick={() => handleTabChange('script')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 flex items-center justify-center gap-2 ${activeTab === 'script' ? colors.activeTab : colors.inactiveTab}`}><Puzzle size={14}/> {t('tampermonkeyTab')}</button>
             <button onClick={() => handleTabChange('web')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 flex items-center justify-center gap-2 ${activeTab === 'web' ? colors.activeTab : colors.inactiveTab}`}><Globe size={14}/> {t('webTab')}</button>
             <button onClick={() => handleTabChange('custom')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 flex items-center justify-center gap-2 ${activeTab === 'custom' ? colors.activeTab : colors.inactiveTab}`}><PenTool size={14}/> {t('customTab')}</button>
        </div>
        <div className={`flex-1 overflow-y-auto overflow-x-hidden flex flex-col scrollbar-thin ${colors.bg}`}>
            {activeTab === 'dict' && (
                <div className="space-y-6 p-5 pb-8 relative h-full flex flex-col">
                    {/* Header Row */}
                    <div className="flex items-center justify-between mb-4 border-b border-gray-200 dark:border-white/10 pb-2">
                        <div className="flex items-center gap-2">
                            <h2 className={`text-xl font-bold ${colors.textMain} tracking-tight`}>{data?.word || searchTerm}</h2>
                            {data?.entries[0]?.phonetic && <span className="text-primary font-mono text-xs">[{data.entries[0].phonetic}]</span>}
                            {settings.ttsEnabled && (
                                <button onClick={() => playTTS(data?.word || searchTerm)} className={`p-1 rounded-full hover:bg-primary/10 text-primary transition-colors`} title="Pronounce">
                                    <Volume2 size={16} />
                                </button>
                            )}
                        </div>
                        
                        <div className="flex bg-black/5 dark:bg-white/5 rounded-lg p-0.5">
                            <button onClick={() => setDictSource('api')} className={`px-2 py-1 text-[10px] rounded-md font-bold transition-all ${dictSource === 'api' ? 'bg-white shadow text-primary' : 'text-zinc-500'}`}>{t('sourceApi')}</button>
                            <button onClick={() => setDictSource('local')} className={`px-2 py-1 text-[10px] rounded-md font-bold transition-all ${dictSource === 'local' ? 'bg-white shadow text-primary' : 'text-zinc-500'}`}>{t('sourceLocal')}</button>
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto">
                        {loading ? ( <div className={`flex flex-col items-center justify-center py-20 gap-3 ${colors.textSub}`}><Loader2 className="animate-spin text-primary" size={32} /><span className="text-xs font-medium uppercase tracking-widest">{t('loading')}</span></div> ) 
                        : error ? ( <div className="text-center py-20 px-6"><div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${colors.bgSub} ${colors.textSub}`}><Search size={32} /></div><p className={`${colors.textMain} mb-2 font-medium`}>{error}</p></div> ) 
                        : data ? (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                {data.entries.map((entry, i) => (
                                    <div key={i} className="mb-8 last:mb-0">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="inline-block px-2.5 py-0.5 bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold uppercase rounded-md tracking-wide">
                                                {entry.partOfSpeech}
                                            </span>
                                        </div>
                                        <div className="space-y-4">
                                            {entry.senses?.map((sense, j) => {
                                                const hasContent = !!sense.definition;
                                                return (
                                                    <div key={j} className={`group relative text-sm ${colors.textMain} pl-4 border-l-2 ${colors.border}`}>
                                                        <button 
                                                            onClick={() => handleAddToAnki(data.word, sense.definition, sentence)}
                                                            className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 p-1 bg-primary/10 text-primary rounded hover:bg-primary/20 transition-all"
                                                            title={t('addEntryToAnki')}
                                                        >
                                                            <Plus size={12}/>
                                                        </button>
                                                        {hasContent ? (
                                                            <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: sense.definition }} />
                                                        ) : (
                                                            <p className="italic opacity-50">{t('noDefinitionFound')}</p>
                                                        )}
                                                        {sense.examples && sense.examples.length > 0 && ( 
                                                            <ul className={`list-disc pl-4 mt-1.5 ${colors.textSub} italic font-medium`}>
                                                                {sense.examples.map((ex, k) => <li key={k}>{ex}</li>)}
                                                            </ul>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : ( 
                            <div className={`flex flex-col items-center justify-center h-full ${colors.textSub} opacity-50`}>
                                <BookOpenText size={48} strokeWidth={1} />
                                <p className="text-sm mt-4">{t('searchDict')}</p>
                            </div> 
                        )}
                    </div>
                </div>
            )}
            
            {activeTab === 'custom' && (
                <div className={`space-y-4 p-5 h-full flex flex-col ${colors.textMain}`}>
                    <div className="flex justify-between items-center pb-2 border-b border-white/5">
                        <div className="flex items-center gap-2">
                            <PenTool size={16} className="text-primary"/>
                            <span className="font-bold text-sm">{t('customTab')}</span>
                        </div>
                        <div className="flex gap-2 items-center">
                            <label className={`p-1.5 rounded cursor-pointer transition-colors border ${colors.border} ${colors.inputBg} hover:opacity-80`} title={t('uploadImage')}>
                                <ImageIcon size={14}/>
                                <input type="file" accept="image/*" className="hidden" onChange={handleCustomImageUpload} />
                            </label>
                            <label className={`p-1.5 rounded cursor-pointer transition-colors border ${colors.border} ${colors.inputBg} hover:opacity-80`} title={t('importTextFile')}>
                                <FileText size={14}/>
                                <input type="file" accept=".txt,.md" className="hidden" onChange={handleTextFileUpload} />
                            </label>
                            <button 
                                onClick={() => { setCustomDef(''); setCustomImage(null); }}
                                className={`p-1.5 rounded transition-colors border ${colors.border} ${colors.inputBg} hover:opacity-80`}
                                title={t('clearCustomDef')} 
                            >
                                <Eraser size={14}/>
                            </button>
                            <button 
                                onClick={toggleClipboardMode} 
                                className={`p-1.5 rounded-lg transition-all ${settings.copyToClipboard ? 'bg-primary text-white shadow' : `bg-black/5 dark:bg-white/5 ${colors.textSub}`}`}
                                title={t('clipboardMode')}
                            >
                                {settings.copyToClipboard ? <ClipboardCheck size={14}/> : <Clipboard size={14}/>}
                            </button>
                        </div>
                    </div>

                    <textarea 
                        className={`w-full flex-1 ${colors.bg} border ${colors.border} rounded-xl p-4 text-sm ${colors.textMain} focus:border-primary outline-none transition-all ${colors.placeholder} resize-none`} 
                        placeholder={t('customDefPlaceholder')} 
                        value={customDef} 
                        onChange={(e) => setCustomDef(e.target.value)}
                    ></textarea>

                    {customImage && (
                        <div className={`relative h-32 border ${colors.border} rounded-lg overflow-hidden group shrink-0`}>
                            <img src={customImage} className="w-full h-full object-contain bg-black/50" />
                            <button onClick={() => setCustomImage(null)} className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={14}/></button>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'script' && ( <div className={`w-full h-full flex flex-col p-4 ${colors.textMain}`}>{scriptLoading ? ( <div className={`flex flex-col items-center justify-center py-20 gap-3 ${colors.textSub}`}><Loader2 className="animate-spin text-primary" size={32} /><span className="text-xs font-medium uppercase tracking-widest">{t('tampermonkeyInfo')}</span></div> ) : scriptHtml ? ( <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 h-full flex flex-col"><div ref={scriptContainerRef} className={`prose prose-sm max-w-none ${colors.textMain} overflow-x-hidden`} dangerouslySetInnerHTML={{ __html: scriptHtml }} /></div> ) : ( <div className={`flex flex-col items-center justify-center h-full ${colors.textSub} opacity-50 pb-20 text-center px-4`}><Puzzle size={48} strokeWidth={1} /><p className="text-sm mt-4 font-bold">{t('tampermonkeyTab')}</p></div> )}</div> )}
            {activeTab === 'web' && ( 
              <div className={`w-full h-full flex flex-col ${colors.bg} relative`}>
                <div className={`p-2 border-b ${colors.bgSub} flex items-center justify-between gap-2 px-3`}>
                    {/* Top Toolbar: Single Line */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={handleWebBack} className={`p-1.5 rounded hover:bg-black/10 ${colors.textSub}`} title="Back"><ArrowLeft size={14}/></button>
                        <button onClick={handleWebForward} className={`p-1.5 rounded hover:bg-black/10 ${colors.textSub}`} title="Forward"><ArrowRight size={14}/></button>
                        <button onClick={handleWebReload} className={`p-1.5 rounded hover:bg-black/10 ${colors.textSub}`} title="Refresh"><RotateCw size={14}/></button>
                    </div>

                    <div className="flex items-center gap-1 flex-1 min-w-0">
                        <select 
                            value={localCategory}
                            onChange={(e) => {
                                const cat = e.target.value as any;
                                setLocalCategory(cat);
                                if (cat === 'search') setLocalEngine('google');
                                else if (cat === 'encyclopedia') setLocalEngine('wikipedia');
                                else setLocalEngine('bing_trans');
                            }}
                            className={`w-20 rounded-lg px-1 py-1 text-[10px] outline-none border ${colors.inputBg} ${colors.textMain}`}
                        >
                            <option value="search">{trans(lang, 'catSearch')}</option>
                            <option value="translate">{trans(lang, 'catTranslate')}</option>
                            <option value="encyclopedia">{trans(lang, 'catEncyclopedia')}</option>
                        </select>

                        <select 
                            value={localEngine} 
                            onChange={(e) => setLocalEngine(e.target.value as WebSearchEngine)}
                            className={`flex-1 rounded-lg px-1 py-1 text-[10px] outline-none border ${colors.inputBg} ${colors.textMain} min-w-0`}
                        >
                            {localCategory === 'search' ? (
                                <>
                                    <option value="google">Google</option>
                                    <option value="bing">Bing</option>
                                    <option value="duckduckgo">DuckDuckGo</option>
                                    <option value="baidu">Baidu</option>
                                </>
                            ) : localCategory === 'encyclopedia' ? (
                                <>
                                    <option value="wikipedia">Wikipedia</option>
                                    <option value="baidu_baike">Baidu Baike</option>
                                    <option value="moegirl">Moegirl</option>
                                </>
                            ) : (
                                <>
                                    <option value="bing_trans">Bing Translator</option>
                                    <option value="deepl">DeepL</option>
                                    <option value="baidu_trans">Baidu Trans</option>
                                    <option value="youdao_trans">Youdao</option>
                                </>
                            )}
                        </select>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => setIsMobile(!isMobile)} className={`p-1.5 rounded hover:bg-black/10 transition-colors ${isMobile ? 'text-primary' : colors.textSub}`} title={isMobile ? "Mobile View" : "PC View"}>
                            {isMobile ? <Smartphone size={14}/> : <Monitor size={14}/>}
                        </button>
                        <button onClick={toggleWebMode} className={`flex items-center gap-1 px-1.5 py-1 rounded bg-black/5 hover:bg-black/10 text-[10px] font-bold ${colors.textSub} transition-colors uppercase`}>
                            {webMode === 'iframe' ? <AppWindow size={14}/> : <ExternalLink size={14}/>}
                        </button>
                        <button onClick={() => setShowWebCustomDef(!showWebCustomDef)} className={`p-1.5 rounded hover:bg-black/10 transition-colors ${showWebCustomDef ? 'text-primary' : colors.textSub}`} title={trans(lang, 'customDefToggle')}>
                            <PenTool size={14}/>
                        </button>
                    </div>
                </div>
                
                {currentWebUrl ? (
                    <iframe 
                        ref={iframeRef}
                        src={currentWebUrl} 
                        className="w-full flex-1 border-0" 
                        sandbox={sandboxConfig}
                    />
                ) : (
                    <div className={`flex flex-col items-center justify-center flex-1 ${colors.textSub} opacity-50`}>
                        <Globe size={48} strokeWidth={1} />
                        <p className="text-sm mt-4">{t('searchDict')}</p>
                    </div>
                )}

                {showWebCustomDef && (
                    <div className={`space-y-2 mt-auto border-t ${colors.border} ${colors.bgSub} p-4 shrink-0 animate-in slide-in-from-bottom-2`}>
                        <div className="flex justify-between items-center">
                            <h4 className={`text-xs font-bold ${colors.textSub} uppercase flex items-center gap-2`}><PenTool size={12}/> {t('customTab')}</h4>
                            <div className="flex gap-2">
                                <label className={`p-1.5 rounded cursor-pointer transition-colors ${colors.textSub} hover:bg-black/10`} title={t('uploadImage')}>
                                    <ImageIcon size={14}/>
                                    <input type="file" accept="image/*" className="hidden" onChange={handleCustomImageUpload} />
                                </label>
                                {customImage && (
                                    <div className={`relative w-6 h-6 border ${colors.border} rounded overflow-hidden group`}>
                                        <img src={customImage} className="w-full h-full object-cover" />
                                        <button onClick={() => setCustomImage(null)} className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100"><X size={10}/></button>
                                    </div>
                                )}
                            </div>
                        </div>
                        <textarea className={`w-full ${colors.bg} border ${colors.border} rounded-lg p-2 text-sm ${colors.textMain} focus:border-primary outline-none transition-all ${colors.placeholder} h-16 resize-none`} placeholder={t('customDefPlaceholder')} value={customDef} onChange={(e) => setCustomDef(e.target.value)}></textarea>
                    </div>
                )}
              </div> 
            )}
        </div>
      </div>
    </>
  );
};

export default DictionaryPanel;