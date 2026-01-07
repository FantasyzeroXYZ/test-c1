
export interface Bookmark {
  id: string;
  pageIndex: number;
  title?: string;
  note?: string;
  color: 'blue' | 'green' | 'red' | 'yellow' | 'purple';
  createdAt: number;
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
  language?: string; // Added: Book specific language
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
  imageField: string;           // Screenshot of original
  translatedImageField: string; // Screenshot of translated (if available)
  translationField: string;     // Text translation
  audioField: string;
  tags: string;
}

export type ViewMode = 'bookshelf' | 'reader';
export type PageViewMode = 'single' | 'double' | 'webtoon';
export type ReadingDirection = 'ltr' | 'rtl';
export type DictionaryMode = 'panel' | 'popup';
export type ThemeMode = 'light' | 'dark';
// Updated WebSearchEngine types
export type WebSearchEngine = 'google' | 'bing' | 'duckduckgo' | 'baidu' | 'bing_trans' | 'deepl' | 'baidu_trans' | 'youdao_trans';

export interface Keybindings {
  nextPage: string[];
  prevPage: string[];
  toggleMenu: string[];
  fullscreen: string[];
}

export interface ReaderSettings {
  pageViewMode: PageViewMode;
  readingDirection: ReadingDirection;
  theme: ThemeMode; 
  language: 'zh' | 'en';
  compareMode: boolean;
  comparisonLayout: 'standard' | 'swapped';
  libraryViewMode: 'grid' | 'list';
  dictionaryMode: DictionaryMode;
  learningLanguage: 'en' | 'zh' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'it' | 'ru' | 'pt'; 
  segmentationMethod: 'browser' | 'space'; 
  overlayStyle: 'hidden' | 'outline' | 'fill'; 
  tesseractLanguage: string;
  ttsEnabled: boolean; 
  ttsVoiceURI: string; 
  webSearchEngine: WebSearchEngine; 
  webSearchMode: 'iframe' | 'external';
  keybindings: Keybindings;
}