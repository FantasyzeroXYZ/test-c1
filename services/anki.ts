
import { AnkiSettingsType } from '../types';

export const defaultAnkiSettings: AnkiSettingsType = {
    ip: '127.0.0.1',
    port: '8765',
    deck: 'Default',
    noteType: 'Basic',
    sentenceField: 'Front',
    wordField: '',
    meaningField: 'Back',
    imageField: '',
    translatedImageField: '',
    translationField: '',
    audioField: '',
    tags: 'MokuroReader'
};

export const invokeAnki = async (action: string, params: any = {}, settings: AnkiSettingsType) => {
    const ip = settings.ip || '127.0.0.1';
    const port = settings.port || '8765';
    const url = `http://${ip}:${port}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            mode: 'cors', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, version: 6, params })
        });
        const result = await response.json();
        if (result.error) {
            throw new Error(result.error);
        }
        return result.result;
    } catch (e) {
        console.error("Anki Error:", e);
        throw e;
    }
};

export const getDecks = async (settings: AnkiSettingsType) => {
    return invokeAnki('deckNames', {}, settings);
};

export const getModels = async (settings: AnkiSettingsType) => {
    return invokeAnki('modelNames', {}, settings);
};

export const getModelFields = async (modelName: string, settings: AnkiSettingsType) => {
    return invokeAnki('modelFieldNames', { modelName }, settings);
};

const storeMediaFile = async (dataBase64: string, filename: string, settings: AnkiSettingsType) => {
    // Robustly extract base64 part. split(',') handles any mime type prefix or lack thereof.
    // This fixes the issue where images were uploaded with the data URI prefix, causing them to be broken in Anki.
    const base64 = dataBase64.includes(',') ? dataBase64.split(',')[1] : dataBase64;
    
    // Returns the filename (important for Android/AnkiDroid consistency)
    // AnkiConnect returns the actual filename stored (which might be different if a file with the same name exists)
    const storedFilename = await invokeAnki('storeMediaFile', {
        filename,
        data: base64
    }, settings);
    // Explicitly return storedFilename if available, otherwise fallback to sent filename.
    return storedFilename || filename; 
}

export const addNote = async (
    settings: AnkiSettingsType, 
    data: { 
        word: string; 
        sentence: string; 
        meaning: string; 
        imageBase64?: string; 
        translatedImageBase64?: string;
        translation?: string;
        audioBase64?: string;
    }
) => {
    const fields: Record<string, string> = {};
    const timestamp = Date.now();

    if (settings.wordField) fields[settings.wordField] = data.word;
    if (settings.sentenceField) fields[settings.sentenceField] = data.sentence;
    if (settings.meaningField) fields[settings.meaningField] = data.meaning;
    if (settings.translationField) fields[settings.translationField] = data.translation || '';
    
    // Handle Images - Crucial: Must upload first and use the RETURNED filename
    if (settings.imageField && data.imageBase64) {
        const filename = `mokuro_img_${timestamp}.png`;
        const storedName = await storeMediaFile(data.imageBase64, filename, settings);
        fields[settings.imageField] = `<img src="${storedName}">`;
    }

    if (settings.translatedImageField && data.translatedImageBase64) {
        const filename = `mokuro_trans_img_${timestamp}.png`;
        const storedName = await storeMediaFile(data.translatedImageBase64, filename, settings);
        fields[settings.translatedImageField] = `<img src="${storedName}">`;
    }

    const note = {
        deckName: settings.deck,
        modelName: settings.noteType,
        fields,
        options: {
            allowDuplicate: false,
            duplicateScope: "deck"
        },
        tags: settings.tags.split(',').map(t => t.trim()).filter(Boolean)
    };

    return invokeAnki('addNote', { note }, settings);
};
