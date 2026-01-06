
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Book, MokuroData, AnkiSettingsType, ReaderSettings, MokuroPage, Bookmark } from '../../types';
import { initZip, loadImage, parseMokuro } from '../../services/parser';
import { updateBookProgress, updateBookBookmarks, openDB } from '../../services/db'; 
import { runTesseract } from '../../services/ocr';
import ImageViewer, { PageContent } from './ImageViewer';
import DictionaryPanel from './DictionaryPanel';
import Sidebar from './Sidebar';
import BookmarkModal from './BookmarkModal';
import { ChevronLeft, ChevronRight, Settings, ArrowLeft, Maximize2, Minimize2, Search, Loader2, Crop, Bookmark as BookmarkIcon, Plus, ZoomIn } from 'lucide-react';
import { defaultAnkiSettings } from '../../services/anki';
import JSZip from 'jszip';
import { t } from '../../services/i18n';

interface ReaderProps {
  book: Book;
  onExit: () => void;
  settings: ReaderSettings;
  setSettings: (s: ReaderSettings) => void;
}

const Reader: React.FC<ReaderProps> = ({ book, onExit, settings, setSettings }) => {
  const [zip, setZip] = useState<JSZip | null>(null);
  const [imageFiles, setImageFiles] = useState<string[]>([]);
  const [translatedZip, setTranslatedZip] = useState<JSZip | null>(null);
  const [translatedImageFiles, setTranslatedImageFiles] = useState<string[]>([]);
  const [currentPagesData, setCurrentPagesData] = useState<PageContent[]>([]);
  const imageCache = useRef<Map<string, string>>(new Map());
  const [mokuroData, setMokuroData] = useState<MokuroData | null>(null);
  const [currentPage, setCurrentPage] = useState(book.progress || 0);
  const [scale, setScale] = useState(1);
  const [showOcr, setShowOcr] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [isLeftActive, setIsLeftActive] = useState(false);
  const [isRightActive, setIsRightActive] = useState(false);
  const [dictQuery, setDictQuery] = useState<{text: string, context?: string} | null>(null);
  const [ankiSettings, setAnkiSettings] = useState<AnkiSettingsType>(() => {
      const saved = localStorage.getItem('ankiSettings');
      return saved ? JSON.parse(saved) : defaultAnkiSettings;
  });
  
  const [isEditingPage, setIsEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState('');

  // OCR Selection Mode
  const [isOcrSelecting, setIsOcrSelecting] = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  
  // Magnifier Mode
  const [isMagnifying, setIsMagnifying] = useState(false);

  // Bookmark state
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(book.bookmarks || []);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);

  // Apply book type constraints strictly
  useEffect(() => {
      if (book.type === 'webtoon' && settings.pageViewMode !== 'webtoon') {
          setSettings({ ...settings, pageViewMode: 'webtoon' });
      } else if (book.type === 'manga' && settings.pageViewMode === 'webtoon') {
          // Force manga back to single page if it was somehow set to webtoon
          setSettings({ ...settings, pageViewMode: 'single' });
      }
  }, [book.type, settings.pageViewMode]);

  const loadBookData = async () => {
    try {
        const { zipInstance, imageFiles: files } = await initZip(book.file);
        setZip(zipInstance);
        setImageFiles(files);
        if (book.translatedFile) {
            try {
                const { zipInstance: tZip, imageFiles: tFiles } = await initZip(book.translatedFile);
                setTranslatedZip(tZip);
                setTranslatedImageFiles(tFiles);
            } catch (e) { console.error("Failed to load translation", e); }
        }
        if (book.mokuroFile) {
            const mData = await parseMokuro(book.mokuroFile);
            setMokuroData(mData);
        }
    } catch (e) { alert("Failed to load book content."); }
  };
  
  useEffect(() => { loadBookData(); }, []);

  const refreshBookData = async () => {
      const db = await openDB();
      const tx = db.transaction('books', 'readonly');
      const store = tx.objectStore('books');
      const req = store.get(book.id);
      req.onsuccess = async () => {
          const updatedBook = req.result as Book;
          if (updatedBook.translatedFile && updatedBook.translatedFile !== book.translatedFile) {
              const { zipInstance, imageFiles } = await initZip(updatedBook.translatedFile);
              setTranslatedZip(zipInstance);
              setTranslatedImageFiles(imageFiles);
          }
          book.pageOffset = updatedBook.pageOffset;
          book.translatedFile = updatedBook.translatedFile;
          setBookmarks(updatedBook.bookmarks || []);
      };
  };

  const preloadImage = async (filename: string, source: 'orig' | 'trans'): Promise<string> => {
      const cacheKey = `${source}:${filename}`;
      if (imageCache.current.has(cacheKey)) return imageCache.current.get(cacheKey)!;
      let url = '';
      if (source === 'orig' && zip) url = await loadImage(zip, filename);
      else if (source === 'trans' && translatedZip) url = await loadImage(translatedZip, filename);
      if (url) imageCache.current.set(cacheKey, url);
      return url;
  };

  const handleWebtoonPageChange = useCallback((page: number) => {
      if (page !== currentPage) {
          setCurrentPage(page);
          updateBookProgress(book.id, page); 
      }
  }, [book.id, currentPage]);

  useEffect(() => {
    if (settings.pageViewMode === 'webtoon') return;
    if (!zip || imageFiles.length === 0) return;
    
    let active = true;

    const loadPages = async () => {
        const pages: PageContent[] = [];
        const indicesToLoad: number[] = [currentPage];
        if (settings.pageViewMode === 'double' && !settings.compareMode && currentPage + 1 < imageFiles.length) {
            indicesToLoad.push(currentPage + 1);
        }

        for (const idx of indicesToLoad) {
            const filename = imageFiles[idx];
            const url = await preloadImage(filename, 'orig');
            
            let ocr: MokuroPage | null = null;
            if (mokuroData) {
                 ocr = mokuroData.pages.find(p => p.img_path.includes(filename)) || mokuroData.pages[idx] || null;
            } 
            
            if (!ocr && settings.useLiveOcr && showOcr) {
                 performLiveOcr(url, filename, idx);
            }

            pages.push({ url, ocr, isTranslated: false });

            if (settings.compareMode && translatedZip) {
                const tIdx = idx + (book.pageOffset || 0);
                if (tIdx >= 0 && tIdx < translatedImageFiles.length) {
                    const tFilename = translatedImageFiles[tIdx];
                    const tUrl = await preloadImage(tFilename, 'trans');
                    pages.push({ url: tUrl, ocr: null, isTranslated: true });
                }
            }
        }
        if (active) setCurrentPagesData(pages);
        
        for(let i=1; i<=3; i++) {
            if(currentPage + i < imageFiles.length) preloadImage(imageFiles[currentPage+i], 'orig');
        }
    };
    loadPages();
    return () => { active = false; };
  }, [zip, imageFiles, currentPage, settings.pageViewMode, settings.compareMode, settings.useLiveOcr, mokuroData, translatedZip, book.pageOffset, showOcr]); 

  const performLiveOcr = async (url: string, filename: string, idx: number) => {
      try {
          const result = await runTesseract(url, settings.tesseractLanguage, filename);
          setCurrentPagesData(prev => prev.map(p => {
              if (p.url === url) return { ...p, ocr: result };
              return p;
          }));
      } catch (e) { console.error("Live OCR Failed", e); }
  };

  useEffect(() => { localStorage.setItem('ankiSettings', JSON.stringify(ankiSettings)); }, [ankiSettings]);
  
  useEffect(() => {
      if (settings.pageViewMode !== 'webtoon') {
          const t = setTimeout(() => updateBookProgress(book.id, currentPage), 500);
          return () => clearTimeout(t);
      }
  }, [currentPage]);
  
  const step = (settings.pageViewMode === 'double' && !settings.compareMode) ? 2 : 1;
  const prevPage = useCallback(() => { setCurrentPage(p => Math.max(0, p - step)); setScale(1); }, [step]);
  const nextPage = useCallback(() => { setCurrentPage(p => Math.min(imageFiles.length - 1, p + step)); setScale(1); }, [imageFiles.length, step]);
  const toggleFullscreen = () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); };

  // Improved Gamepad Support with Custom Mappings
  const lastGamepadAction = useRef(0);
  useEffect(() => {
      let rafId: number;
      const pollGamepad = () => {
          const gamepads = navigator.getGamepads();
          // Check all connected gamepads
          for (const gp of gamepads) {
              if (!gp) continue;
              
              const now = Date.now();
              // Debounce to prevent rapid firing (250ms)
              if (now - lastGamepadAction.current > 250) {
                  const pressedInputs: string[] = [];

                  // Check Buttons
                  gp.buttons.forEach((btn, idx) => {
                      if (btn.pressed) pressedInputs.push(`GP_Btn_${idx}`);
                  });

                  // Check Axes
                  gp.axes.forEach((val, idx) => {
                      if (val < -0.5) pressedInputs.push(`GP_Axis_${idx}_-`);
                      if (val > 0.5) pressedInputs.push(`GP_Axis_${idx}_+`);
                  });

                  if (pressedInputs.length > 0) {
                      // Check against keybindings
                      const keys = settings.keybindings;
                      
                      // Helper to check intersection
                      const matches = (actionKeys: string[]) => actionKeys.some(k => pressedInputs.includes(k));

                      if (matches(keys.prevPage)) {
                          settings.readingDirection === 'ltr' ? prevPage() : nextPage();
                          lastGamepadAction.current = now;
                      } else if (matches(keys.nextPage)) {
                          settings.readingDirection === 'ltr' ? nextPage() : prevPage();
                          lastGamepadAction.current = now;
                      } else if (matches(keys.toggleMenu)) {
                          setShowSidebar(prev => !prev);
                          lastGamepadAction.current = now;
                      } else if (matches(keys.fullscreen)) {
                          toggleFullscreen();
                          lastGamepadAction.current = now;
                      }
                  }
              }
          }
          rafId = requestAnimationFrame(pollGamepad);
      };
      rafId = requestAnimationFrame(pollGamepad);
      return () => cancelAnimationFrame(rafId);
  }, [nextPage, prevPage, settings.readingDirection, settings.keybindings]);

  useEffect(() => {
      const handleKey = (e: KeyboardEvent) => {
          if (isEditingPage) return;
          if (isOcrSelecting || isMagnifying) {
              if (e.key === 'Escape') {
                  setIsOcrSelecting(false);
                  setIsMagnifying(false);
              }
              return;
          }

          const keys = settings.keybindings;
          if (keys.nextPage.includes(e.key)) {
              if (settings.pageViewMode === 'webtoon') {
                  const el = containerRef.current?.querySelector('.overflow-y-auto');
                  el?.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
              } else {
                  settings.readingDirection === 'ltr' ? nextPage() : prevPage();
              }
          }
          else if (keys.prevPage.includes(e.key)) {
               if (settings.pageViewMode === 'webtoon') {
                  const el = containerRef.current?.querySelector('.overflow-y-auto');
                  el?.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' });
              } else {
                  settings.readingDirection === 'ltr' ? prevPage() : nextPage();
              }
          }
          else if (keys.toggleMenu.includes(e.key)) setShowSidebar(prev => !prev);
          else if (keys.fullscreen.includes(e.key)) toggleFullscreen();
      };
      const handleFs = () => setIsFullscreen(!!document.fullscreenElement);
      window.addEventListener('keydown', handleKey);
      document.addEventListener('fullscreenchange', handleFs);
      return () => { window.removeEventListener('keydown', handleKey); document.removeEventListener('fullscreenchange', handleFs); };
  }, [nextPage, prevPage, settings, isEditingPage, isOcrSelecting, isMagnifying]);

  const handleLeftClick = settings.readingDirection === 'ltr' ? prevPage : nextPage;
  const handleRightClick = settings.readingDirection === 'ltr' ? nextPage : prevPage;

  const handlePageSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const p = parseInt(pageInput);
      if (!isNaN(p) && p >= 1 && p <= imageFiles.length) {
          setCurrentPage(p - 1);
      }
      setIsEditingPage(false);
  };

  const handleCropOcr = async (dataUrl: string) => {
      setIsOcrSelecting(false);
      setIsOcrLoading(true);
      try {
          const result = await runTesseract(dataUrl, settings.tesseractLanguage, 'crop.png');
          const text = result.blocks.map(b => b.lines.join(' ')).join('\n\n');
          if (text.trim()) {
              setDictQuery({ text: text.trim(), context: text.trim() });
          } else {
              alert(t(settings.language, 'noTextFound'));
          }
      } catch (e) {
          console.error(e);
          alert("OCR Failed");
      } finally {
          setIsOcrLoading(false);
      }
  };

  const handleAddBookmark = () => {
      const existing = bookmarks.find(b => b.pageIndex === currentPage);
      if (existing) {
          setEditingBookmark(existing);
      } else {
          setEditingBookmark({
              id: crypto.randomUUID(),
              pageIndex: currentPage,
              color: 'blue',
              createdAt: Date.now()
          });
      }
  };

  const handleSaveBookmark = async (bm: Bookmark) => {
      let newBookmarks: Bookmark[];
      if (bookmarks.find(b => b.id === bm.id)) {
          newBookmarks = bookmarks.map(b => b.id === bm.id ? bm : b);
      } else {
          newBookmarks = [...bookmarks, bm];
      }
      setBookmarks(newBookmarks);
      await updateBookBookmarks(book.id, newBookmarks);
      setEditingBookmark(null);
  };

  const handleDeleteBookmark = async (id: string) => {
      const newBookmarks = bookmarks.filter(b => b.id !== id);
      setBookmarks(newBookmarks);
      await updateBookBookmarks(book.id, newBookmarks);
      setEditingBookmark(null);
  };

  const jumpToPage = (idx: number) => {
      setCurrentPage(idx);
      setShowSidebar(false);
  };

  // Ref to help with vertical scroll navigation
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="fixed inset-0 bg-black flex flex-col h-screen w-screen overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-14 bg-gradient-to-b from-black/80 to-transparent z-40 flex items-center justify-between px-4 pointer-events-none hover:opacity-100 transition-opacity group">
            <div className="flex items-center gap-2 pointer-events-auto">
                <button onClick={onExit} className="p-2 text-white/80 hover:text-white bg-black/40 rounded-full backdrop-blur-sm"><ArrowLeft size={20} /></button>
            </div>
            
            <div className="pointer-events-auto text-white/80 text-sm font-medium drop-shadow-md bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm flex items-center gap-2">
                {isOcrLoading && <Loader2 size={14} className="animate-spin text-accent"/>}
                {settings.pageViewMode === 'webtoon' ? (
                    <span>{imageFiles.length > 0 ? `${currentPage + 1} / ${imageFiles.length}` : 'Loading...'}</span>
                ) : isEditingPage ? (
                    <form onSubmit={handlePageSubmit} className="inline-block w-20">
                        <input 
                            autoFocus
                            type="number" 
                            value={pageInput}
                            onChange={e => setPageInput(e.target.value)}
                            onBlur={() => setIsEditingPage(false)}
                            className="w-full bg-transparent border-b border-white text-center outline-none text-white"
                        />
                    </form>
                ) : (
                    <span onClick={() => { setIsEditingPage(true); setPageInput((currentPage + 1).toString()); }} className="cursor-pointer hover:text-white">
                        {imageFiles.length > 0 ? `${currentPage + 1} / ${imageFiles.length}` : 'Loading...'}
                    </span>
                )}
            </div>

            <div className="flex items-center gap-2 pointer-events-auto">
                 <button 
                    onClick={handleAddBookmark}
                    className={`p-2 rounded-full backdrop-blur-sm transition-colors ${bookmarks.some(b => b.pageIndex === currentPage) ? 'text-accent bg-accent/20' : 'text-white/80 hover:text-white bg-black/40'}`}
                    title={t(settings.language, 'addBookmark')}
                 >
                    <BookmarkIcon size={20} fill={bookmarks.some(b => b.pageIndex === currentPage) ? 'currentColor' : 'none'} />
                 </button>
                 <button 
                    onClick={() => { setIsMagnifying(!isMagnifying); setIsOcrSelecting(false); }} 
                    className={`p-2 rounded-full backdrop-blur-sm transition-colors ${isMagnifying ? 'bg-primary text-white' : 'text-white/80 hover:text-white bg-black/40'}`}
                    title={t(settings.language, isMagnifying ? 'exitMagnifier' : 'magnifier')}
                 >
                    <ZoomIn size={20} />
                 </button>
                 <button 
                    onClick={() => { setIsOcrSelecting(!isOcrSelecting); setIsMagnifying(false); }} 
                    className={`p-2 rounded-full backdrop-blur-sm transition-colors ${isOcrSelecting ? 'bg-primary text-white' : 'text-white/80 hover:text-white bg-black/40'}`}
                    title={t(settings.language, isOcrSelecting ? 'exitCropMode' : 'cropMode')}
                 >
                    <Crop size={20} />
                 </button>
                 <button onPointerUp={() => setDictQuery({text: '', context: ''})} className="p-2 text-white/80 hover:text-white bg-black/40 rounded-full backdrop-blur-sm pointer-events-auto"><Search size={20} /></button>
                 <button onClick={toggleFullscreen} className="p-2 text-white/80 hover:text-white bg-black/40 rounded-full backdrop-blur-sm pointer-events-auto">{isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}</button>
                <button onClick={() => setShowSidebar(true)} className="p-2 text-white/80 hover:text-white bg-black/40 rounded-full backdrop-blur-sm pointer-events-auto"><Settings size={20} /></button>
            </div>
        </div>

        <div className="flex-1 relative w-full h-full">
            <ImageViewer 
                showOcr={showOcr} 
                onOcrClick={(text) => setDictQuery({ text, context: text })}
                scale={scale} setScale={setScale}
                readingDirection={settings.readingDirection}
                settings={settings}
                pages={currentPagesData}
                zip={zip} imageFiles={imageFiles}
                translatedZip={translatedZip} translatedImageFiles={translatedImageFiles}
                pageOffset={book.pageOffset}
                mokuroData={mokuroData}
                currentPage={currentPage}
                onPageChange={handleWebtoonPageChange}
                isSelecting={isOcrSelecting}
                onCrop={handleCropOcr}
                highlightOcr={false} 
                isMagnifying={isMagnifying}
            />
            {settings.pageViewMode !== 'webtoon' && !isOcrSelecting && !isMagnifying && (
                <>
                    <div className={`absolute inset-y-0 left-0 w-8 z-30 cursor-pointer flex items-center justify-center transition-all duration-100 ${isLeftActive ? 'bg-blue-500/30' : 'hover:bg-white/5'}`}
                        onPointerDown={() => setIsLeftActive(true)} onPointerUp={() => { setIsLeftActive(false); handleLeftClick(); }} onPointerLeave={() => setIsLeftActive(false)}>
                        <ChevronLeft size={48} className="text-white drop-shadow-lg opacity-0 hover:opacity-100 transition-opacity" />
                    </div>
                    <div className={`absolute inset-y-0 right-0 w-8 z-30 cursor-pointer flex items-center justify-center transition-all duration-100 ${isRightActive ? 'bg-blue-500/30' : 'hover:bg-white/5'}`}
                        onPointerDown={() => setIsRightActive(true)} onPointerUp={() => { setIsRightActive(false); handleRightClick(); }} onPointerLeave={() => setIsRightActive(false)}>
                        <ChevronRight size={48} className="text-white drop-shadow-lg opacity-0 hover:opacity-100 transition-opacity" />
                    </div>
                </>
            )}
        </div>

        {/* Progress bar with bookmark ticks */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800 pointer-events-none group z-40">
            <div className="h-full bg-primary/40" style={{ width: `${((currentPage + 1) / imageFiles.length) * 100}%` }}></div>
            {bookmarks.map(bm => (
                <div 
                    key={bm.id} 
                    className={`absolute bottom-0 w-1.5 h-3 cursor-pointer pointer-events-auto transform -translate-y-1 hover:h-4 transition-all ${
                        bm.color === 'red' ? 'bg-red-500' : 
                        bm.color === 'green' ? 'bg-green-500' : 
                        bm.color === 'yellow' ? 'bg-yellow-500' : 
                        bm.color === 'purple' ? 'bg-purple-500' : 'bg-blue-500'
                    }`}
                    style={{ left: `${(bm.pageIndex / imageFiles.length) * 100}%` }}
                    title={bm.title || `Page ${bm.pageIndex + 1}`}
                    onPointerUp={(e) => {
                        e.stopPropagation();
                        setCurrentPage(bm.pageIndex);
                        setEditingBookmark(bm); // Trigger editor when clicking tick
                    }}
                />
            ))}
        </div>

        <Sidebar 
            isOpen={showSidebar} onClose={() => setShowSidebar(false)}
            book={book} onBookUpdate={refreshBookData}
            showOcr={showOcr} setShowOcr={setShowOcr}
            ankiSettings={ankiSettings} setAnkiSettings={setAnkiSettings}
            readerSettings={settings} setReaderSettings={setSettings}
            bookmarks={bookmarks} onJumpToPage={jumpToPage} onEditBookmark={setEditingBookmark}
            onDeleteBookmark={handleDeleteBookmark}
        />
        {settings.dictionaryMode !== 'popup' && (
            <DictionaryPanel isOpen={!!dictQuery} query={dictQuery?.text || ''} onClose={() => setDictQuery(null)} ankiSettings={ankiSettings} fullSentence={dictQuery?.context || ""} settings={settings} />
        )}

        {editingBookmark && (
            <BookmarkModal 
                bookmark={editingBookmark} 
                language={settings.language}
                onSave={handleSaveBookmark}
                onDelete={handleDeleteBookmark}
                onClose={() => setEditingBookmark(null)}
            />
        )}
    </div>
  );
};

export default Reader;
