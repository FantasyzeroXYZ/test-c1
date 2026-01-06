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

export const addNote = async (
    settings: AnkiSettingsType, 
    data: { word: string; sentence: string; meaning: string; imageBase64?: string; audioBase64?: string }
) => {
    const fields: Record<string, string> = {};
    
    if (settings.wordField) fields[settings.wordField] = data.word;
    if (settings.sentenceField) fields[settings.sentenceField] = data.sentence;
    if (settings.meaningField) fields[settings.meaningField] = data.meaning;
    
    // Logic: In a real app, you'd storeMediaFile first, then put <img src> in field
    // For now, this assumes the caller handles the media logic or we stub it
    // if (settings.imageField && data.imageBase64) ... 

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