import React, { useState, useEffect } from 'react';
import Bookshelf from './components/Bookshelf';
import Reader from './components/Reader/Reader';
import { Book, ViewMode, ReaderSettings, AnkiSettingsType } from './types';
import { defaultAnkiSettings } from './services/anki';

const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>('bookshelf');
  const [currentBook, setCurrentBook] = useState<Book | null>(null);

  const [settings, setSettings] = useState<ReaderSettings>(() => {
    const saved = localStorage.getItem('readerSettings');
    const defaults: ReaderSettings = {
      pageViewMode: 'single',
      readingDirection: 'ltr',
      theme: 'light', // Default to light mode
      language: 'zh', 
      compareMode: false,
      comparisonLayout: 'standard',
      libraryViewMode: 'grid',
      dictionaryMode: 'panel',
      dictionarySource: 'api',
      learningLanguage: 'en', 
      overlayStyle: 'hidden', 
      tesseractLanguage: 'eng', 
      ttsEnabled: true,
      audioSource: 'browser',
      ttsVoiceURI: '',
      ttsRate: 1,
      ttsPitch: 1,
      ttsVolume: 1,
      segmentationMethod: 'browser',
      webSearchEngine: 'google',
      webSearchMode: 'iframe',
      keybindings: {
          nextPage: ['ArrowRight', ' '],
          prevPage: ['ArrowLeft'],
          toggleMenu: ['m'],
          fullscreen: ['f']
      },
      ankiBoldText: true,
      popupFontSize: 16,
      copyToClipboard: false
    };

    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            // Migrations
            if ('dictionaryLanguage' in parsed) {
                parsed.learningLanguage = parsed.dictionaryLanguage;
                delete parsed.dictionaryLanguage;
            }
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

  // Lift Anki settings to App level for global persistence
  const [ankiSettings, setAnkiSettings] = useState<AnkiSettingsType>(() => {
      const saved = localStorage.getItem('ankiSettings');
      return saved ? JSON.parse(saved) : defaultAnkiSettings;
  });

  useEffect(() => {
      localStorage.setItem('ankiSettings', JSON.stringify(ankiSettings));
  }, [ankiSettings]);

  useEffect(() => {
    localStorage.setItem('readerSettings', JSON.stringify(settings));
    // Apply Theme
    if (settings.theme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.style.colorScheme = 'dark';
    } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.style.colorScheme = 'light';
    }
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
    <div className={`min-h-screen transition-colors duration-300 ${settings.theme === 'dark' ? 'bg-[#09090b] text-zinc-100' : 'bg-zinc-50 text-zinc-900'}`}>
      {view === 'bookshelf' && (
        <Bookshelf 
          onOpenBook={handleOpenBook} 
          settings={settings} 
          setSettings={setSettings} 
          ankiSettings={ankiSettings}
          setAnkiSettings={setAnkiSettings}
        />
      )}
      
      {view === 'reader' && currentBook && (
        <Reader 
          book={currentBook} 
          onExit={handleExitReader} 
          settings={settings}
          setSettings={setSettings}
          ankiSettings={ankiSettings}
          setAnkiSettings={setAnkiSettings}
        />
      )}
    </div>
  );
};

export default App;