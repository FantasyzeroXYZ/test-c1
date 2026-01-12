

import JSZip from 'jszip';
import { saveDictionary, searchLocalDictionary, getDictionaries } from './db';
import { LocalDictionary } from '../types';

// Map settings language code to API code (ISO 639-1 or 3)
const getLanguageCode = (settingsLang: string): string => {
    // API: https://freedictionaryapi.com/api/v1/entries/{language}/{word}
    // "ISO 639-1/639-3 (2 or 3 letter) language code"
    const map: Record<string, string> = {
        'en': 'en',
        'zh': 'zh', // or 'cmn', 'zho'
        'ja': 'ja', // or 'jpn'
        'ko': 'ko',
        'fr': 'fr',
        'de': 'de',
        'es': 'es',
        'ru': 'ru',
        'it': 'it',
        'pt': 'pt',
    };
    return map[settingsLang] || 'en';
};

export interface ApiDictionaryResponse {
    word: string;
    entries: {
        language?: { code: string, name: string };
        partOfSpeech: string;
        phonetic?: string; // Mapped from pronunciations
        pronunciations?: { text: string; audio?: string }[];
        senses?: { 
            definition: string; 
            examples?: string[]; 
            synonyms?: string[]; 
            antonyms?: string[] 
        }[];
    }[];
}

export const fetchFreeDictionaryApi = async (term: string, lang: string): Promise<ApiDictionaryResponse | null> => {
    try {
        const langCode = getLanguageCode(lang);
        const url = `https://freedictionaryapi.com/api/v1/entries/${langCode}/${encodeURIComponent(term)}`;
        
        const res = await fetch(url);
        if (!res.ok) return null;
        
        const data = await res.json();
        // Structure: EntriesByLanguageAndWord (word, entries[], source)
        if (!data || !data.entries) return null;

        // Simplify for our UI
        const mapped: ApiDictionaryResponse = {
            word: data.word,
            entries: data.entries.map((e: any) => ({
                language: e.language,
                partOfSpeech: e.partOfSpeech,
                pronunciations: e.pronunciations?.map((p: any) => ({ text: p.text, audio: p.audio?.url || p.audio })),
                phonetic: e.pronunciations?.[0]?.text,
                senses: e.senses?.map((s: any) => ({
                    definition: s.definition,
                    examples: s.examples,
                    synonyms: s.synonyms,
                    antonyms: s.antonyms
                }))
            }))
        };
        return mapped;
    } catch (e) {
        console.error("Dictionary API Error", e);
        return null;
    }
};

// --- Yomitan/Yomichan Import Logic ---

export const importYomitanDictionary = async (file: File, language: string | 'universal', onProgress: (msg: string) => void): Promise<void> => {
    try {
        onProgress("Reading file...");
        const zip = new JSZip();
        const content = await zip.loadAsync(file);
        
        // Find index.json for title
        let title = file.name.replace('.zip', '');
        if (content.files['index.json']) {
            const idxText = await content.files['index.json'].async('string');
            const idx = JSON.parse(idxText);
            if (idx.title) title = idx.title;
        }

        onProgress(`Importing "${title}"...`);
        const dictId = Date.now().toString();
        let totalTerms = 0;

        // Find term_bank files
        const bankFiles = Object.keys(content.files).filter(k => k.includes('term_bank_'));
        
        for (const filename of bankFiles) {
            onProgress(`Processing ${filename}...`);
            const text = await content.files[filename].async('string');
            const entries = JSON.parse(text);
            
            // Map Yomitan format to our internal DB format
            // Yomitan v3: [term, reading, definition_tags, rule_id, score, [glossary], sequence, term_tags]
            const dbEntries = entries.map((entry: any[]) => ({
                dictId,
                term: entry[0],
                reading: entry[1],
                definitions: entry[5], // Array of strings or structured content
                sequence: entry[6]
            }));

            await saveDictionary({ id: dictId, name: title, count: 0, targetLang: language }, dbEntries); 
            totalTerms += entries.length;
        }

        // Update count and final metadata
        await saveDictionary({ id: dictId, name: title, count: totalTerms, targetLang: language }, []);
        onProgress("Done!");

    } catch (e) {
        console.error("Import Failed", e);
        throw new Error("Failed to import dictionary");
    }
};

/**
 * Recursive function to render Yomitan structured content into HTML string
 */
const renderStructuredContent = (node: any): string => {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(renderStructuredContent).join('');
    
    if (node.type === 'structured-content') {
        return renderStructuredContent(node.content);
    }

    if (node.tag) {
        // Handle content which can be array, string or object
        const content = node.content ? renderStructuredContent(node.content) : '';
        const tagName = node.tag;
        
        // Build attributes
        let attrs = '';
        if (node.data) {
            // Optional: convert data attributes to styles or classes if needed, 
            // but for simplicity we stick to semantic tags
        }
        if (node.href) {
            attrs += ` href="${node.href}" target="_blank"`;
        }
        if (node.style) {
             // Basic style mapping if exists
             const styleStr = Object.entries(node.style).map(([k,v]) => `${k}:${v}`).join(';');
             attrs += ` style="${styleStr}"`;
        }

        // Specific handling for details/summary to ensure they open
        if (tagName === 'details') {
            // We can force open or leave closed. 
            return `<details${attrs}>${content}</details>`;
        }

        return `<${tagName}${attrs}>${content}</${tagName}>`;
    }

    return '';
};

const formatYomitanText = (text: string): string => {
    // 1. Replace single newlines with break tags, but handle existing break tags carefully
    // Replace typical list markers to add some structure, but minimize added space
    let formatted = text.replace(/([①-⑩])/g, '<br/>$1');
    formatted = formatted.replace(/([㋐-㋕])/g, '<br/>&nbsp;&nbsp;$1');
    formatted = formatted.replace(/([▲△])/g, '<br/>&nbsp;&nbsp;$1');
    formatted = formatted.replace(/(【)/g, '<br/>$1');
    
    // 2. Normalize line breaks
    // Replace actual newlines with <br>
    formatted = formatted.replace(/\n/g, '<br/>');
    
    // 3. Consolidate multiple breaks into single breaks to remove empty lines
    // Replace 2 or more <br> (with optional spaces) with a single <br>
    formatted = formatted.replace(/(<br\s*\/?>\s*){2,}/gi, '<br/>');
    
    // 4. Remove leading/trailing breaks
    formatted = formatted.replace(/^(<br\s*\/?>\s*)+/i, '');
    formatted = formatted.replace(/(<br\s*\/?>\s*)+$/i, '');
    
    return formatted;
};

export const searchLocalDictionaries = async (term: string, currentLang: string): Promise<ApiDictionaryResponse | null> => {
    const rawResults = await searchLocalDictionary(term);
    if (!rawResults || rawResults.length === 0) return null;

    // Get all dictionaries to check metadata and priority
    const dicts = await getDictionaries();
    const validDictIds = new Set(
        dicts
            .filter(d => d.targetLang === 'universal' || d.targetLang === currentLang)
            .map(d => d.id)
    );

    // Filter entries by valid dictionaries
    const filteredResults = rawResults.filter(r => validDictIds.has(r.dictId));

    if (filteredResults.length === 0) return null;

    // Sort results based on dictionary priority
    filteredResults.sort((a, b) => {
        const dictA = dicts.find(d => d.id === a.dictId);
        const dictB = dicts.find(d => d.id === b.dictId);
        const pA = dictA?.priority ?? 999;
        const pB = dictB?.priority ?? 999;
        if (pA !== pB) return pA - pB;
        // Secondary sort by dictionary name if priority same
        return (dictA?.name || '').localeCompare(dictB?.name || '');
    });

    // Convert local results to shared format
    const entries = filteredResults.map(r => ({
        partOfSpeech: dicts.find(d => d.id === r.dictId)?.name || 'Local',
        phonetic: r.reading,
        senses: r.definitions.map((d: any) => {
            // Yomitan definitions can be strings or objects (structured-content)
            let defText = "";
            if (typeof d === 'string') {
                // Apply heuristics to formatting plain text strings
                defText = formatYomitanText(d);
            } else if (typeof d === 'object' && d !== null) {
                // If it's the structured content object
                if (d.type === 'structured-content' || d.tag) {
                    defText = renderStructuredContent(d);
                } else if (d.content && typeof d.content === 'string') {
                    defText = formatYomitanText(d.content); // Fallback for simple objects
                } else {
                    defText = JSON.stringify(d); // Fallback
                }
            }
            return { definition: defText, examples: [] };
        })
    }));

    return {
        word: term,
        entries
    };
};