
import { Book, ReaderSettings, Bookmark } from '../types';

const DB_NAME = 'ComicReaderDB';
const STORE_NAME = 'books';
const VERSION = 1;

export const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

export const addBook = async (book: Book): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(book);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getAllBooks = async (): Promise<Book[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const books = (request.result as Book[]).sort((a, b) => b.addedAt - a.addedAt);
      resolve(books);
    };
    request.onerror = () => reject(request.error);
  });
};

export const deleteBook = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const updateBookMokuro = async (id: string, mokuroFile: Blob): Promise<void> => {
    return updateBookField(id, 'mokuroFile', mokuroFile);
}

export const updateBookProgress = async (id: string, progress: number): Promise<void> => {
    return updateBookField(id, 'progress', progress);
}

export const updateBookTranslatedFile = async (id: string, file: Blob): Promise<void> => {
    return updateBookField(id, 'translatedFile', file);
}

export const updateBookOffset = async (id: string, offset: number): Promise<void> => {
    return updateBookField(id, 'pageOffset', offset);
}

export const updateBookBookmarks = async (id: string, bookmarks: Bookmark[]): Promise<void> => {
    return updateBookField(id, 'bookmarks', bookmarks);
}

export const updateBookTitle = async (id: string, title: string): Promise<void> => {
    return updateBookField(id, 'title', title);
}

export const updateBookCover = async (id: string, coverBlob: Blob | undefined, coverUrl: string): Promise<void> => {
    await updateBookField(id, 'coverBlob', coverBlob);
    return updateBookField(id, 'coverUrl', coverUrl);
}

export const updateBookFile = async (id: string, file: Blob): Promise<void> => {
    return updateBookField(id, 'file', file);
}

export const updateBookLanguage = async (id: string, language: string): Promise<void> => {
    return updateBookField(id, 'language', language);
}

const updateBookField = async (id: string, field: keyof Book, value: any): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const getReq = store.get(id);
        
        getReq.onsuccess = () => {
            const book = getReq.result as Book;
            if (book) {
                (book as any)[field] = value;
                const putReq = store.put(book);
                putReq.onsuccess = () => resolve();
                putReq.onerror = () => reject(putReq.error);
            } else {
                resolve(); 
            }
        };
        getReq.onerror = () => reject(getReq.error);
    });
};

export const exportData = async (settings: ReaderSettings) => {
    const books = await getAllBooks();
    const exportData = {
        settings,
        books: books.map(b => ({
            id: b.id,
            title: b.title,
            progress: b.progress,
            pageOffset: b.pageOffset,
            bookmarks: b.bookmarks,
            addedAt: b.addedAt
        }))
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mokuro_reader_backup_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
