import * as TesseractSource from 'tesseract.js';
import { MokuroPage, MokuroBlock } from '../types';

let worker: any = null;
let currentLang: string | null = null;

const getWorker = async (lang: string) => {
    // If we have a worker and the language matches, reuse it
    if (worker && currentLang === lang) {
        return worker;
    }
    
    // If language changed or worker exists, terminate the old one
    if (worker) {
        console.log(`Terminating worker for ${currentLang}, switching to ${lang}`);
        await worker.terminate();
        worker = null;
    }

    // Handle ESM/CommonJS mismatch for Tesseract in browser
    const createWorker = (TesseractSource as any).createWorker || (TesseractSource as any).default?.createWorker;

    if (!createWorker) {
        console.error("Tesseract exports:", TesseractSource);
        throw new Error("Tesseract createWorker not found. Check console for exports.");
    }

    console.log(`Creating Tesseract worker for ${lang}...`);
    // Initialize new worker
    // Note: older examples use createWorker(), load(), loadLanguage().
    // Tesseract.js v3/v4/v5 creates and loads automatically if arguments are provided.
    // We pass logger to monitor progress.
    worker = await createWorker(lang, 1, {
        logger: (m: any) => {
            if (m.status === 'recognizing text') {
                // console.debug('OCR Progress:', m.progress);
            }
        }
    });

    currentLang = lang;
    return worker;
};

export const runTesseract = async (imageUrl: string, lang: string, filename: string): Promise<MokuroPage> => {
    try {
        const w = await getWorker(lang);
        const { data } = await w.recognize(imageUrl);
        
        const blocks: MokuroBlock[] = [];

        if (data.blocks) {
            data.blocks.forEach((block: any) => {
                if (!block.text || !block.text.trim()) return;

                const box: [number, number, number, number] = [
                    block.bbox.x0,
                    block.bbox.y0,
                    block.bbox.x1,
                    block.bbox.y1
                ];

                const lines: string[] = [];
                if (block.paragraphs) {
                    block.paragraphs.forEach((p: any) => {
                        if (p.lines) {
                            p.lines.forEach((l: any) => {
                                lines.push(l.text.trim());
                            });
                        }
                    });
                } else {
                    lines.push(block.text.trim());
                }

                const cleanLines = lines.filter((l: string) => l.length > 0);
                
                if (cleanLines.length > 0) {
                    blocks.push({
                        box,
                        lines: cleanLines
                    });
                }
            });
        }

        return {
            img_path: filename,
            blocks
        };

    } catch (e) {
        console.error("Tesseract Error:", e);
        // If error occurs, reset worker so next attempt tries to recreate it
        worker = null;
        currentLang = null;
        throw e;
    }
};

export const OCR_LANGUAGES = [
    { code: 'eng', name: 'English' },
    { code: 'chi_sim', name: 'Chinese (Simplified)' },
    { code: 'chi_tra', name: 'Chinese (Traditional)' },
    { code: 'jpn', name: 'Japanese' },
    { code: 'kor', name: 'Korean' },
    { code: 'fra', name: 'French' },
    { code: 'spa', name: 'Spanish' },
    { code: 'deu', name: 'German' },
    { code: 'rus', name: 'Russian' }
];
