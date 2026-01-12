

import React, { useState, useMemo } from 'react';
import { Bookmark, ReaderSettings, Book, MokuroData } from '../../types';
import { X, Book as BookIcon, Edit3, Trash2, ArrowRight, Search, FileText, Bookmark as BookmarkFilled } from 'lucide-react';
import { t } from '../../services/i18n';

interface BookmarksSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    book: Book;
    bookmarks: Bookmark[];
    mokuroData: MokuroData | null;
    currentPage: number;
    totalPages: number;
    onJumpToPage: (page: number) => void;
    onEditBookmark: (bm: Bookmark) => void;
    onDeleteBookmark: (id: string) => void;
    settings: ReaderSettings;
}

const BookmarksSidebar: React.FC<BookmarksSidebarProps> = ({
    isOpen, onClose, book, bookmarks, mokuroData, currentPage, totalPages, onJumpToPage, onEditBookmark, onDeleteBookmark, settings
}) => {
    const [pageInput, setPageInput] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'bookmarks' | 'lines'>('bookmarks');
    const [filterColor, setFilterColor] = useState<Bookmark['color'] | 'all'>('all');
    
    const theme = settings.theme;
    const isLight = theme === 'light';
    
    // Style constants
    const bgClass = isLight ? 'bg-white/95 border-zinc-200' : 'bg-surface/95 border-white/10';
    const textMain = isLight ? 'text-zinc-800' : 'text-zinc-100';
    const textSub = isLight ? 'text-zinc-500' : 'text-zinc-400';
    const inputBg = isLight ? 'bg-zinc-100 border-zinc-200' : 'bg-black/40 border-white/10';
    const itemBg = isLight ? 'bg-zinc-100' : 'bg-surfaceLight';
    const itemHover = isLight ? 'hover:bg-zinc-200' : 'hover:bg-white/5';
    const activeTabClass = isLight ? 'text-primary border-b-2 border-primary' : 'text-primary border-b-2 border-primary';
    const inactiveTabClass = isLight ? 'text-zinc-500 hover:text-zinc-800' : 'text-zinc-400 hover:text-zinc-200';

    const handleJump = (e: React.FormEvent) => {
        e.preventDefault();
        const p = parseInt(pageInput);
        if (!isNaN(p) && p >= 1 && p <= totalPages) {
            onJumpToPage(p - 1);
            setPageInput('');
        }
    };

    const sortedBookmarks = useMemo(() => {
        return [...bookmarks].sort((a, b) => a.pageIndex - b.pageIndex);
    }, [bookmarks]);

    const filteredBookmarks = useMemo(() => {
        return sortedBookmarks.filter(bm => {
            const matchesColor = filterColor === 'all' || bm.color === filterColor;
            const term = searchTerm.toLowerCase();
            const matchesSearch = !searchTerm || (bm.title && bm.title.toLowerCase().includes(term)) || (bm.note && bm.note.toLowerCase().includes(term));
            return matchesColor && matchesSearch;
        });
    }, [sortedBookmarks, filterColor, searchTerm]);

    const searchResults = useMemo(() => {
        if (!searchTerm.trim() || !mokuroData) return [];
        const results: Array<{ pageIndex: number; text: string; }> = [];
        const term = searchTerm.toLowerCase();

        mokuroData.pages.forEach((page, idx) => {
            page.blocks.forEach(block => {
                const text = block.lines.join('');
                if (text.toLowerCase().includes(term)) {
                    results.push({ pageIndex: idx, text });
                }
            });
        });
        return results;
    }, [searchTerm, mokuroData]);

    const colors: Bookmark['color'][] = ['blue', 'green', 'yellow', 'purple', 'red'];

    return (
        <div className={`fixed inset-y-0 right-0 w-80 backdrop-blur-xl border-l shadow-2xl z-[100] transition-transform duration-300 flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'} ${bgClass}`}>
            <div className={`p-4 border-b flex items-center justify-between ${isLight ? 'bg-zinc-50/50 border-zinc-200' : 'bg-black/20 border-white/10'}`}>
                <h2 className={`font-bold flex items-center gap-2 ${textMain}`}><BookIcon size={18}/> {t(settings.language, 'bookmarks')}</h2>
                <button onClick={onClose} className={`p-2 rounded-full ${textSub} ${itemHover}`}><X size={20}/></button>
            </div>

            {/* Jump Bar */}
            <div className={`p-4 border-b ${isLight ? 'border-zinc-200' : 'border-white/5'}`}>
                <div className={`flex items-center justify-between mb-2 text-xs font-bold uppercase ${textSub}`}>
                    <span>Current Page</span>
                    <span>{currentPage + 1} / {totalPages}</span>
                </div>
                <form onSubmit={handleJump} className="flex gap-2">
                    <input 
                        type="number" 
                        placeholder="Go to page..." 
                        value={pageInput}
                        onChange={e => setPageInput(e.target.value)}
                        className={`flex-1 rounded-lg px-3 py-2 text-sm outline-none border ${inputBg} ${textMain}`}
                    />
                    <button type="submit" className="p-2 bg-primary text-white rounded-lg hover:bg-blue-600 transition-colors">
                        <ArrowRight size={16}/>
                    </button>
                </form>
            </div>

            {/* Search Bar */}
            <div className={`p-4 pb-0 ${isLight ? 'border-zinc-200' : 'border-white/5'}`}>
                <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${inputBg}`}>
                    <Search size={16} className={textSub}/>
                    <input 
                        type="text" 
                        placeholder={activeTab === 'bookmarks' ? t(settings.language, 'searchLines').replace('Lines', 'Bookmarks') : t(settings.language, 'searchLines')} 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className={`flex-1 bg-transparent text-sm outline-none ${textMain}`}
                    />
                    {searchTerm && <button onClick={() => setSearchTerm('')} className={textSub}><X size={14}/></button>}
                </div>
            </div>

            {/* Tabs */}
            <div className={`flex mt-2 border-b ${isLight ? 'border-zinc-200' : 'border-white/10'}`}>
                <button 
                    onClick={() => setActiveTab('bookmarks')} 
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'bookmarks' ? activeTabClass : inactiveTabClass}`}
                >
                    <BookmarkFilled size={14}/> {t(settings.language, 'tabBookmarks')}
                </button>
                <button 
                    onClick={() => setActiveTab('lines')} 
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'lines' ? activeTabClass : inactiveTabClass}`}
                >
                    <FileText size={14}/> {t(settings.language, 'tabLines')}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin scrollbar-thumb-current scrollbar-track-transparent">
                {activeTab === 'bookmarks' && (
                    <>
                        {/* Color Filter */}
                        <div className="flex justify-between items-center mb-4 px-1">
                            <button 
                                onClick={() => setFilterColor('all')}
                                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${filterColor === 'all' ? 'border-primary' : 'border-transparent opacity-50 hover:opacity-100'}`}
                                title={t(settings.language, 'allColors')}
                            >
                                <div className={`w-3 h-3 rounded-full ${isLight ? 'bg-zinc-800' : 'bg-white'}`} />
                            </button>
                            {colors.map(c => (
                                <button 
                                    key={c}
                                    onClick={() => setFilterColor(c)}
                                    className={`w-6 h-6 rounded-full border-2 transition-all ${filterColor === c ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'} ${
                                        c === 'blue' ? 'bg-blue-500' : 
                                        c === 'green' ? 'bg-green-500' : 
                                        c === 'yellow' ? 'bg-yellow-500' : 
                                        c === 'purple' ? 'bg-purple-500' : 'bg-red-500'
                                    }`}
                                />
                            ))}
                        </div>

                        {filteredBookmarks.length === 0 ? (
                            <div className={`text-center py-10 ${textSub} text-sm`}>{t(settings.language, 'noResults')}</div>
                        ) : (
                            filteredBookmarks.map(bm => (
                                <div key={bm.id} className={`flex items-center justify-between p-3 rounded-lg border group transition-all ${isLight ? 'bg-zinc-50 border-zinc-200 hover:border-zinc-300' : 'bg-black/20 border-white/5 hover:border-white/10'}`}>
                                    <div className="flex items-center gap-3 cursor-pointer flex-1 min-w-0" onClick={() => onJumpToPage(bm.pageIndex)}>
                                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                            bm.color === 'blue' ? 'bg-blue-500' : 
                                            bm.color === 'green' ? 'bg-green-500' : 
                                            bm.color === 'yellow' ? 'bg-yellow-500' : 
                                            bm.color === 'purple' ? 'bg-purple-500' : 'bg-red-500'
                                        }`} />
                                        <div className="flex flex-col min-w-0">
                                            <span className={`text-sm font-medium truncate ${textMain}`}>
                                                {bm.title || `Page ${bm.pageIndex + 1}`}
                                            </span>
                                            <span className={`text-[10px] ${textSub}`}>
                                                Page {bm.pageIndex + 1}{bm.endPageIndex ? ` - ${bm.endPageIndex + 1}` : ''}
                                            </span>
                                            {bm.note && <span className={`text-[10px] truncate ${textSub} opacity-70`}>{bm.note}</span>}
                                        </div>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => onEditBookmark(bm)} className={`p-1.5 rounded-md ${textSub} hover:text-primary hover:bg-black/5 transition-colors`}><Edit3 size={14}/></button>
                                        <button onClick={() => onDeleteBookmark(bm.id)} className={`p-1.5 rounded-md ${textSub} hover:text-red-400 hover:bg-black/5 transition-colors`}><Trash2 size={14}/></button>
                                    </div>
                                </div>
                            ))
                        )}
                    </>
                )}

                {activeTab === 'lines' && (
                    <>
                        {searchTerm ? (
                            searchResults.length === 0 ? (
                                <div className={`text-center py-10 ${textSub} text-sm`}>{t(settings.language, 'noResults')}</div>
                            ) : (
                                searchResults.map((res, i) => (
                                    <div key={i} className={`flex flex-col gap-1 p-3 rounded-lg border cursor-pointer transition-all ${isLight ? 'bg-zinc-50 border-zinc-200 hover:border-zinc-300' : 'bg-black/20 border-white/5 hover:border-white/10'}`} onClick={() => onJumpToPage(res.pageIndex)}>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isLight ? 'bg-zinc-200 text-zinc-600' : 'bg-zinc-800 text-zinc-400'}`}>
                                                {t(settings.language, 'page')} {res.pageIndex + 1}
                                            </span>
                                        </div>
                                        <p className={`text-xs ${textMain} line-clamp-2`}>{res.text}</p>
                                    </div>
                                ))
                            )
                        ) : (
                            <div className={`text-center py-10 ${textSub} text-sm`}>{t(settings.language, 'searchLines')}</div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default BookmarksSidebar;