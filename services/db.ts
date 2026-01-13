

import { Book, ReaderSettings, Bookmark, LocalDictionary, ReadingStats } from '../types';

const DB_NAME = 'ComicReaderDB';
const STORE_NAME = 'books';
const DICT_META_STORE = 'dict_meta';
const DICT_DATA_STORE = 'dict_data';
const VERSION = 2; 

export const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(DICT_META_STORE)) {
          db.createObjectStore(DICT_META_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(DICT_DATA_STORE)) {
          const dictStore = db.createObjectStore(DICT_DATA_STORE, { autoIncrement: true });
          dictStore.createIndex('term', 'term', { unique: false });
          dictStore.createIndex('dictId', 'dictId', { unique: false });
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

export const updateBookAnkiTags = async (id: string, tags: string): Promise<void> => {
    return updateBookField(id, 'ankiTags', tags);
}

export const updateBookStats = async (id: string, timeToAdd: number, pagesToAdd: number = 0): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const getReq = store.get(id);

        getReq.onsuccess = () => {
            const book = getReq.result as Book;
            if (book) {
                const now = Date.now();
                const today = new Date().toISOString().slice(0, 10);
                
                const stats: ReadingStats = book.stats || {
                    totalTime: 0,
                    sessions: 0,
                    lastRead: 0,
                    pagesRead: 0,
                    dailyTime: {}
                };

                // Check if new session (e.g. > 30 min since last read)
                if (now - stats.lastRead > 30 * 60 * 1000 && timeToAdd > 0) {
                    stats.sessions += 1;
                }

                stats.totalTime += timeToAdd;
                stats.lastRead = now;
                stats.pagesRead = (stats.pagesRead || 0) + pagesToAdd;
                stats.dailyTime[today] = (stats.dailyTime[today] || 0) + timeToAdd;

                book.stats = stats;
                store.put(book);
            }
            resolve();
        };
        getReq.onerror = () => reject(getReq.error);
    });
};

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

// --- Dictionary Functions ---

export const saveDictionary = async (meta: LocalDictionary, entries: any[]): Promise<void> => {
    const db = await openDB();
    
    // First, check if priority exists, if not get max and append
    if (meta.priority === undefined) {
        const currentDicts = await getDictionaries();
        const maxP = currentDicts.reduce((max, d) => Math.max(max, d.priority || 0), 0);
        meta.priority = maxP + 1;
    }

    return new Promise((resolve, reject) => {
        const tx = db.transaction([DICT_META_STORE, DICT_DATA_STORE], 'readwrite');
        
        tx.objectStore(DICT_META_STORE).put(meta);
        const dataStore = tx.objectStore(DICT_DATA_STORE);
        
        let i = 0;
        const addNext = () => {
            if (i < entries.length) {
                dataStore.put(entries[i]);
                i++;
                if (i % 1000 === 0) setTimeout(addNext, 0); 
                else addNext();
            }
        };
        
        for (const entry of entries) {
            dataStore.put(entry);
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const getDictionaries = async (): Promise<LocalDictionary[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([DICT_META_STORE], 'readonly');
        const req = tx.objectStore(DICT_META_STORE).getAll();
        req.onsuccess = () => {
            let res = req.result as LocalDictionary[];
            // Sort by priority, then name
            res.sort((a, b) => {
                const pA = a.priority ?? 999;
                const pB = b.priority ?? 999;
                if (pA !== pB) return pA - pB;
                return a.name.localeCompare(b.name);
            });
            resolve(res);
        };
        req.onerror = () => reject(req.error);
    });
};

export const deleteDictionary = async (id: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([DICT_META_STORE, DICT_DATA_STORE], 'readwrite');
        tx.objectStore(DICT_META_STORE).delete(id);
        
        // Delete all entries with this dictId
        const index = tx.objectStore(DICT_DATA_STORE).index('dictId');
        const req = index.openCursor(IDBKeyRange.only(id));
        
        req.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest).result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        
        tx.oncomplete = () => resolve();
    });
};

export const searchLocalDictionary = async (term: string): Promise<any[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([DICT_DATA_STORE], 'readonly');
        const index = tx.objectStore(DICT_DATA_STORE).index('term');
        const req = index.getAll(term);
        
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

export const updateDictionaryPriority = async (id: string, newPriority: number): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([DICT_META_STORE], 'readwrite');
        const store = tx.objectStore(DICT_META_STORE);
        const req = store.get(id);
        
        req.onsuccess = () => {
            const meta = req.result as LocalDictionary;
            if (meta) {
                meta.priority = newPriority;
                store.put(meta);
            }
            resolve();
        };
        req.onerror = () => reject(req.error);
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
            addedAt: b.addedAt,
            ankiTags: b.ankiTags
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