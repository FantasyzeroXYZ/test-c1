
import React, { useState, useEffect } from 'react';
import { Book, ReaderSettings } from '../types';
import { getAllBooks, addBook, deleteBook, updateBookMokuro, updateBookTranslatedFile } from '../services/db';
import { extractCoverImage } from '../services/parser';
import { Plus, Trash2, BookOpen, Upload, FileText, Settings, Maximize2, Minimize2, Globe, Layout, X } from 'lucide-react';
import { t } from '../services/i18n';
import Sidebar from './Reader/Sidebar'; 
import { defaultAnkiSettings } from '../services/anki';

interface BookshelfProps {
  onOpenBook: (book: Book) => void;
  settings: ReaderSettings;
  setSettings: (settings: ReaderSettings) => void;
}

const Bookshelf: React.FC<BookshelfProps> = ({ onOpenBook, settings, setSettings }) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [showSettings, setShowSettings] = useState(false);
  
  // Add Modal State
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editType, setEditType] = useState<'manga' | 'webtoon'>('manga');
  const [editCover, setEditCover] = useState<string | null>(null);
  const [editCoverBlob, setEditCoverBlob] = useState<Blob | null>(null);

  useEffect(() => {
    loadBooks();
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const loadBooks = async () => {
    const loadedBooks = await getAllBooks();
    const booksWithCovers = loadedBooks.map(b => {
        if (b.coverBlob) {
            return { ...b, coverUrl: URL.createObjectURL(b.coverBlob) };
        }
        return b;
    });
    setBooks(booksWithCovers);
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.name.endsWith('.zip') && !file.name.endsWith('.cbz')) return;

    setLoading(true);
    try {
        const coverBlob = await extractCoverImage(file);
        setPendingFile(file);
        setEditTitle(file.name.replace(/\.(zip|cbz)$/i, ''));
        setEditType('manga');
        setEditCoverBlob(coverBlob);
        setEditCover(coverBlob ? URL.createObjectURL(coverBlob) : null);
    } catch (e) {
        alert("Error loading file: " + e);
    } finally {
        setLoading(false);
    }
  };

  const confirmAddBook = async () => {
    if (!pendingFile) return;
    
    setLoading(true);
    try {
        const newBook: Book = {
            id: crypto.randomUUID(),
            title: editTitle || pendingFile.name.replace(/\.(zip|cbz)$/i, ''),
            type: editType,
            coverUrl: editCover || '',
            coverBlob: editCoverBlob || undefined,
            file: pendingFile,
            addedAt: Date.now(),
            progress: 0
        };
        await addBook(newBook);
        setPendingFile(null);
        await loadBooks();
    } catch (e) {
        alert("Error adding book: " + e);
    } finally {
        setLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (confirm(t(settings.language, 'deleteBook') + "?")) {
          await deleteBook(id);
          await loadBooks();
      }
  };

  const handleMokuroUpload = async (e: React.ChangeEvent<HTMLInputElement>, bookId: string) => {
      if (e.target.files && e.target.files[0]) {
          e.stopPropagation(); 
          const file = e.target.files[0];
          try {
              await updateBookMokuro(bookId, file);
              await loadBooks();
          } catch(err) { alert("Failed to attach Mokuro file"); }
      }
  };

  const handleTransUpload = async (e: React.ChangeEvent<HTMLInputElement>, bookId: string) => {
      if (e.target.files && e.target.files[0]) {
          e.stopPropagation(); 
          const file = e.target.files[0];
          try {
              await updateBookTranslatedFile(bookId, file);
              await loadBooks();
          } catch(err) { alert("Failed to attach translation file"); }
      }
  };

  const handleDrag = (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
      else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files);
  };

  const toggleFullscreen = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
  };

  const dummyAnkiSettings = defaultAnkiSettings;

  return (
    <div className="min-h-screen p-4 md:p-8" onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}>
      <header className="mb-8 flex justify-between items-center">
        <div>
            <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
              {t(settings.language, 'library')}
            </h1>
            <p className="text-zinc-400 mt-2 text-sm md:text-base">{t(settings.language, 'librarySubtitle')}</p>
        </div>
        <div className="flex gap-4">
            <button onClick={toggleFullscreen} className="p-2 text-zinc-400 hover:text-white bg-surfaceLight rounded-lg transition-colors">
                {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
            <button onClick={() => setShowSettings(true)} className="p-2 text-zinc-400 hover:text-white bg-surfaceLight rounded-lg transition-colors">
                <Settings size={20} />
            </button>
            <label className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-2 bg-primary hover:bg-blue-600 text-white rounded-lg cursor-pointer transition-colors shadow-lg shadow-blue-900/20 text-sm md:text-base">
                <Plus size={20} />
                <span className="hidden md:inline">{t(settings.language, 'addBook')}</span>
                <span className="md:hidden">Add</span>
                <input type="file" className="hidden" accept=".zip,.cbz" onChange={(e) => handleFileSelect(e.target.files)} />
            </label>
        </div>
      </header>

      {dragActive && (
          <div className="fixed inset-0 bg-primary/20 backdrop-blur-sm z-50 flex items-center justify-center border-4 border-dashed border-primary m-4 rounded-xl">
              <div className="text-2xl font-bold text-primary animate-pulse">Drop .zip or .cbz file here</div>
          </div>
      )}

      {loading && !pendingFile && (
          <div className="flex justify-center my-12">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
      )}

      {/* Add Book Modal */}
      {pendingFile && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
              <div className="bg-surfaceLight border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                  <div className="p-4 border-b border-white/5 flex justify-between items-center bg-black/20">
                      <h2 className="font-bold text-lg">{t(settings.language, 'editBook')}</h2>
                      <button onClick={() => setPendingFile(null)} className="p-1 hover:bg-white/10 rounded-full"><X size={20}/></button>
                  </div>
                  <div className="p-6 space-y-6">
                      <div className="flex gap-4">
                          <div className="w-24 aspect-[2/3] bg-black/40 rounded-lg overflow-hidden border border-white/10 flex-shrink-0">
                              {editCover ? <img src={editCover} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-zinc-700"><BookOpen/></div>}
                          </div>
                          <div className="flex-1 space-y-4">
                              <div>
                                  <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1 block">{t(settings.language, 'title')}</label>
                                  <input 
                                    type="text" 
                                    value={editTitle} 
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                                  />
                              </div>
                              <div>
                                  <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1 block">{t(settings.language, 'bookType')}</label>
                                  <div className="grid grid-cols-2 gap-2">
                                      <button 
                                        onClick={() => setEditType('manga')}
                                        className={`py-2 rounded-lg text-xs font-medium border transition-all ${editType === 'manga' ? 'bg-primary border-primary text-white shadow-lg' : 'bg-black/20 border-white/5 text-zinc-400 hover:text-white'}`}
                                      >
                                          {t(settings.language, 'manga')}
                                      </button>
                                      <button 
                                        onClick={() => setEditType('webtoon')}
                                        className={`py-2 rounded-lg text-xs font-medium border transition-all ${editType === 'webtoon' ? 'bg-primary border-primary text-white shadow-lg' : 'bg-black/20 border-white/5 text-zinc-400 hover:text-white'}`}
                                      >
                                          {t(settings.language, 'webtoon')}
                                      </button>
                                  </div>
                              </div>
                          </div>
                      </div>
                  </div>
                  <div className="p-4 bg-black/20 border-t border-white/5 flex gap-3">
                      <button onClick={() => setPendingFile(null)} className="flex-1 py-3 text-sm font-medium text-zinc-400 hover:text-white transition-colors">{t(settings.language, 'cancel')}</button>
                      <button onClick={confirmAddBook} className="flex-[2] py-3 bg-primary hover:bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-900/20 transition-all active:scale-95">{t(settings.language, 'confirmAdd')}</button>
                  </div>
              </div>
          </div>
      )}

      {books.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="w-20 h-20 bg-surfaceLight rounded-full flex items-center justify-center mb-6 text-zinc-600 border border-white/5">
                  <BookOpen size={40} />
              </div>
              <h2 className="text-xl font-bold mb-2">{t(settings.language, 'emptyLibrary')}</h2>
              <p className="text-zinc-500 max-w-xs">{t(settings.language, 'emptyLibrarySub')}</p>
          </div>
      )}

      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-6">
        {books.map(book => (
          <div key={book.id} className="group relative bg-surfaceLight rounded-xl overflow-hidden shadow-xl hover:shadow-2xl hover:shadow-primary/10 transition-all duration-300 hover:-translate-y-1 cursor-pointer border border-zinc-800 hover:border-zinc-700" onClick={() => onOpenBook(book)}>
            <div className="aspect-[2/3] w-full relative bg-zinc-900 overflow-hidden">
                {book.coverUrl ? (
                    <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600"><BookOpen size={32} /></div>
                )}
                {book.progress !== undefined && book.progress > 0 && (
                   <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800">
                      <div className="h-full bg-accent" style={{ width: `${(book.progress / 100) * 100}%` }}></div>
                   </div> 
                )}
                <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                     <button onClick={(e) => handleDelete(e, book.id)} className="p-1.5 md:p-2 bg-red-500/80 hover:bg-red-600 text-white rounded-full backdrop-blur-md shadow-lg">
                        <Trash2 size={14} className="md:w-4 md:h-4" />
                    </button>
                </div>
                <div className="absolute bottom-2 left-2 right-2 flex justify-between items-end gap-1">
                     {book.mokuroFile && <span className="px-1.5 py-0.5 bg-accent/90 text-black text-[10px] md:text-xs font-bold rounded shadow-lg backdrop-blur-sm flex items-center gap-1"><FileText size={10} className="md:w-3 md:h-3" /> OCR</span>}
                     {book.translatedFile && <span className="px-1.5 py-0.5 bg-green-500/90 text-black text-[10px] md:text-xs font-bold rounded shadow-lg backdrop-blur-sm flex items-center gap-1"><Globe size={10} className="md:w-3 md:h-3" /> TR</span>}
                </div>
                {book.type === 'webtoon' && (
                    <div className="absolute top-2 left-2">
                        <span className="px-1.5 py-0.5 bg-primary/90 text-white text-[10px] font-bold rounded shadow-lg backdrop-blur-sm flex items-center gap-1">
                            <Layout size={10}/> WEBTOON
                        </span>
                    </div>
                )}
            </div>
            <div className="p-2 md:p-4">
              <h3 className="font-semibold truncate text-zinc-100 text-xs md:text-sm" title={book.title}>{book.title}</h3>
              <div className="flex justify-between items-center mt-2 md:mt-3">
                  <span className="text-[10px] md:text-xs text-zinc-500">{new Date(book.addedAt).toLocaleDateString()}</span>
                  <div className="flex gap-2">
                    <label className="text-[10px] md:text-xs flex items-center gap-1 text-zinc-400 hover:text-green-500 transition-colors cursor-pointer" onClick={(e) => e.stopPropagation()} title="Upload Translation">
                        <Globe size={10} className="md:w-3 md:h-3" />
                        <input type="file" accept=".zip,.cbz" className="hidden" onChange={(e) => handleTransUpload(e, book.id)} />
                    </label>
                    <label className="text-[10px] md:text-xs flex items-center gap-1 text-zinc-400 hover:text-primary transition-colors cursor-pointer" onClick={(e) => e.stopPropagation()} title="Attach Mokuro">
                        <Upload size={10} className="md:w-3 md:h-3" />
                        <input type="file" accept=".mokuro" className="hidden" onChange={(e) => handleMokuroUpload(e, book.id)} />
                    </label>
                  </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Sidebar 
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        showOcr={false} setShowOcr={() => {}}
        ankiSettings={dummyAnkiSettings} setAnkiSettings={() => {}}
        readerSettings={settings} setReaderSettings={setSettings}
      />
    </div>
  );
};

export default Bookshelf;
