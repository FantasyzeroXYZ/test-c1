import JSZip from 'jszip';
import { MokuroData } from '../types';

const getSortedImages = (files: JSZip.JSZipObject[]) => {
    return files
        .filter(file => 
            !file.dir && 
            /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name) && 
            !file.name.includes('__MACOSX') && 
            !file.name.split('/').pop()?.startsWith('.')
        )
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
};

export const extractCoverImage = async (file: Blob): Promise<Blob | null> => {
    try {
        const zip = new JSZip();
        const content = await zip.loadAsync(file);
        
        const allFiles = Object.keys(content.files).map(key => content.files[key]);
        const imageFiles = getSortedImages(allFiles);

        if (imageFiles.length === 0) return null; 

        const firstImage = imageFiles[0];
        return await firstImage.async('blob');
    } catch (e) {
        console.error("Error extracting cover", e);
        return null;
    }
};

export const initZip = async (file: Blob) => {
    const zip = new JSZip();
    const content = await zip.loadAsync(file);
    const allFiles = Object.keys(content.files).map(key => content.files[key]);
    const imageFiles = getSortedImages(allFiles).map(f => f.name);
    return { zipInstance: content, imageFiles };
};

export const loadImage = async (zip: JSZip, filename: string): Promise<string> => {
    const file = zip.files[filename];
    if (!file) return '';
    const blob = await file.async('blob');
    return URL.createObjectURL(blob);
};

export const parseMokuro = async (file: Blob): Promise<MokuroData | null> => {
    try {
        const text = await file.text();
        return JSON.parse(text) as MokuroData;
    } catch (e) {
        console.error("Failed to parse Mokuro file", e);
        return null;
    }
};