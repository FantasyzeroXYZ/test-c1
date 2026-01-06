
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
  bookmarks?: Bookmark[]; // Added bookmarks field
  addedAt: number;
  progress?: number;
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
  audioField: string;
  tags: string;
}

export type ViewMode = 'bookshelf' | 'reader';
export type PageViewMode = 'single' | 'double' | 'webtoon';
export type ReadingDirection = 'ltr' | 'rtl';
export type DictionaryMode = 'panel' | 'popup';

export interface Keybindings {
  nextPage: string[];
  prevPage: string[];
  toggleMenu: string[];
  fullscreen: string[];
}

export interface ReaderSettings {
  pageViewMode: PageViewMode;
  readingDirection: ReadingDirection;
  language: 'zh' | 'en';
  compareMode: boolean;
  comparisonLayout: 'standard' | 'swapped';
  dictionaryMode: DictionaryMode;
  dictionaryLanguage: 'en' | 'zh' | 'ja' | 'es' | 'fr' | 'ru'; // Added dictionary language
  overlayStyle: 'hidden' | 'outline' | 'fill'; 
  useLiveOcr: boolean;
  tesseractLanguage: string;
  ttsVoiceURI: string; 
  keybindings: Keybindings;
}
