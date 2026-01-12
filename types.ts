

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English (EN)' },
  { code: 'zh', name: 'Chinese (ZH)' },
  { code: 'ja', name: 'Japanese (JP)' },
  { code: 'ko', name: 'Korean (KO)' },
  { code: 'fr', name: 'French (FR)' },
  { code: 'de', name: 'German (DE)' },
  { code: 'es', name: 'Spanish (ES)' },
  { code: 'it', name: 'Italian (IT)' },
  { code: 'ru', name: 'Russian (RU)' },
  { code: 'pt', name: 'Portuguese (PT)' },
] as const;

export interface Bookmark {
  id: string;
  pageIndex: number;
  endPageIndex?: number; // Added for range bookmarks
  title?: string;
  note?: string;
  color: 'blue' | 'green' | 'red' | 'yellow' | 'purple';
  createdAt: number;
  crops?: Array<{ id: string; name?: string; x: number; y: number; w: number; h: number }>; // Updated for named/id regions
}

export interface ReadingStats {
    totalTime: number; // in milliseconds
    lastRead: number;
    sessions: number;
    dailyTime: Record<string, number>; // YYYY-MM-DD -> ms
}

export interface Book {
  id: string;
  title: string;
  type: 'manga' | 'webtoon';
  coverUrl: string; 
  coverBlob?: Blob; 
  file: Blob;
  translatedFile?: Blob;
  pageOffset?: number;
  mokuroFile?: Blob;
  bookmarks?: Bookmark[];
  addedAt: number;
  progress?: number;
  language?: string; 
  ankiTags?: string;
  stats?: ReadingStats; // Added
}

export interface MokuroPage {
  img_path: string;
  blocks: MokuroBlock[];
}

export interface MokuroBlock {
  box: [number, number, number, number];
  lines: string[];
}

export interface MokuroData {
  version: string;
  title: string;
  pages: MokuroPage[];
}

export interface AnkiSettingsType {
  ip: string;
  port: string;
  deck: string;
  noteType: string;
  sentenceField: string;
  wordField: string;
  meaningField: string;
  imageField: string;           
  translatedImageField: string; 
  translationField: string;     
  audioField: string;
  tags: string;
}

export type ViewMode = 'bookshelf' | 'reader';
export type PageViewMode = 'single' | 'double' | 'webtoon';
export type ReadingDirection = 'ltr' | 'rtl';
export type DictionaryMode = 'panel' | 'popup';
export type ThemeMode = 'light' | 'dark';

export type WebSearchEngine = 
  | 'google' | 'bing' | 'duckduckgo' | 'baidu' 
  | 'bing_trans' | 'deepl' | 'baidu_trans' | 'youdao_trans'
  | 'baidu_baike' | 'wikipedia' | 'moegirl';

export interface Keybindings {
  nextPage: string[];
  prevPage: string[];
  toggleMenu: string[];
  fullscreen: string[];
}

export interface LocalDictionary {
    id: string;
    name: string;
    count: number;
    targetLang: string | 'universal'; 
    priority?: number; // Added
}

export interface ReaderSettings {
  pageViewMode: PageViewMode;
  readingDirection: ReadingDirection;
  theme: ThemeMode; 
  language: 'zh' | 'en' | 'zh-Hant';
  compareMode: boolean;
  comparisonLayout: 'standard' | 'swapped';
  libraryViewMode: 'grid' | 'list';
  dictionaryMode: DictionaryMode;
  dictionarySource: 'api' | 'local';
  learningLanguage: 'en' | 'zh' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'it' | 'ru' | 'pt'; 
  segmentationMethod: 'browser' | 'space' | 'kuromoji' | 'external'; 
  overlayStyle: 'hidden' | 'outline' | 'fill'; 
  tesseractLanguage: string;
  ttsEnabled: boolean; 
  audioSource: 'browser' | 'external'; // Added
  ttsVoiceURI: string;
  ttsRate: number; // Added
  ttsPitch: number; // Added
  ttsVolume: number; // Added
  webSearchEngine: WebSearchEngine; 
  webSearchMode: 'iframe' | 'external';
  keybindings: Keybindings;
  ankiBoldText: boolean; 
  popupFontSize: number; 
  copyToClipboard: boolean;
}