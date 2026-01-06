import React, { useState, useEffect } from 'react';
import Bookshelf from './components/Bookshelf';
import Reader from './components/Reader/Reader';
import { Book, ViewMode, ReaderSettings } from './types';

const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>('bookshelf');
  const [currentBook, setCurrentBook] = useState<Book | null>(null);

  const [settings, setSettings] = useState<ReaderSettings>(() => {
    const saved = localStorage.getItem('readerSettings');
    const defaults: ReaderSettings = {
      pageViewMode: 'single',
      readingDirection: 'ltr',
      language: 'zh', 
      compareMode: false,
      comparisonLayout: 'standard',
      dictionaryMode: 'panel',
      dictionaryLanguage: 'en',
      overlayStyle: 'hidden', 
      useLiveOcr: false, // Default OFF
      tesseractLanguage: 'eng', // Default English
      ttsVoiceURI: '',
      keybindings: {
          nextPage: ['ArrowRight', ' '],
          prevPage: ['ArrowLeft'],
          toggleMenu: ['m'],
          fullscreen: ['f']
      }
    };

    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if ('highlightOcr' in parsed) {
                parsed.overlayStyle = parsed.highlightOcr ? 'fill' : 'hidden';
                delete parsed.highlightOcr;
            }
            return { ...defaults, ...parsed };
        } catch (e) {
            return defaults;
        }
    }
    return defaults;
  });

  useEffect(() => {
    localStorage.setItem('readerSettings', JSON.stringify(settings));
  }, [settings]);

  const handleOpenBook = (book: Book) => {
    setCurrentBook(book);
    setView('reader');
  };

  const handleExitReader = () => {
    setView('bookshelf');
    setCurrentBook(null);
  };

  return (
    <div className="bg-surface text-zinc-100 min-h-screen">
      {view === 'bookshelf' && (
        <Bookshelf 
          onOpenBook={handleOpenBook} 
          settings={settings} 
          setSettings={setSettings} 
        />
      )}
      
      {view === 'reader' && currentBook && (
        <Reader 
          book={currentBook} 
          onExit={handleExitReader} 
          settings={settings}
          setSettings={setSettings}
        />
      )}
    </div>
  );
};

export default App;