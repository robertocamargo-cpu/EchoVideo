import { Project, TranscriptionItem, AppSettings, StyleExample, MasterAsset, ImageHistoryItem, ImageStyleOption, SubtitleStyleOption, MotionEffect } from "../types";
import { DailyUsage } from "./usageService";
import { db, storage } from "./firebaseClient";
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where, orderBy, limit, writeBatch } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from "firebase/storage";

const generateId = () => crypto.randomUUID();

// ==================== PROJECTS ====================

export const getProjects = async (): Promise<Project[]> => {
    try {
        const q = query(collection(db, 'projects'), orderBy('date', 'desc'));
        const querySnapshot = await getDocs(q);
        const projects: Project[] = [];

        querySnapshot.forEach((docSnap) => {
            const proj = docSnap.data();
            projects.push({
                id: docSnap.id,
                name: proj.name,
                date: proj.date,
                context: proj.context,
                projectStyle: proj.project_style,
                customStylePrompt: proj.custom_style_prompt,
                audioUrl: proj.audio_url,
                updatedAt: proj.updated_at,
                items: [],
                itemsCount: proj.itemsCount || 0,
                characters: [],
                locations: [],
                props: []
            });
        });

        return projects;
    } catch (error) {
        console.error("Error loading projects", error);
        return [];
    }
};

export const findProjectByName = async (name: string): Promise<Project | null> => {
    try {
        const q = query(collection(db, 'projects'), where('name', '==', name), limit(1));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) return null;

        const docSnap = querySnapshot.docs[0];
        const data = docSnap.data();

        return {
            id: docSnap.id,
            name: data.name,
            date: data.date,
            context: data.context,
            projectStyle: data.project_style,
            image_style_name: data.image_style_name,
            customStylePrompt: data.custom_style_prompt,
            audioUrl: data.audio_url,
            updatedAt: data.updated_at,
            items: [],
            characters: [],
            locations: [],
            props: []
        };
    } catch (error) {
        console.error("Error finding project by name", error);
        return null;
    }
};

export const getProjectById = async (id: string): Promise<Project | null> => {
    try {
        const docRef = doc(db, 'projects', id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) return null;

        const data = docSnap.data();

        // Items
        const itemsQuery = query(collection(db, 'projects', id, 'transcription_items'));
        const itemsSnap = await getDocs(itemsQuery);
        let items: any[] = [];
        itemsSnap.forEach(snap => items.push(snap.data()));

        // Sort items by start_seconds
        items.sort((a, b) => parseFloat(a.start_seconds) - parseFloat(b.start_seconds));

        // Assets
        const assetsQuery = query(collection(db, 'projects', id, 'master_assets'));
        const assetsSnap = await getDocs(assetsQuery);
        let assets: any[] = [];
        assetsSnap.forEach(snap => assets.push(snap.data()));

        const project: Project = {
            id,
            name: data.name,
            date: data.date,
            context: data.context,
            projectStyle: data.project_style,
            image_style_name: data.image_style_name,
            customStylePrompt: data.custom_style_prompt,
            audioUrl: data.audio_url,
            items: items.map((item: any) => {
                let extraData = {};
                try {
                    if (item.visual_summary && item.visual_summary.startsWith('{')) {
                        extraData = JSON.parse(item.visual_summary);
                    }
                } catch (e) { console.warn("Error unpacking visual_summary", e); }

                return {
                    filename: item.filename,
                    startTimestamp: item.start_timestamp,
                    endTimestamp: item.end_timestamp,
                    startSeconds: parseFloat(item.start_seconds),
                    endSeconds: parseFloat(item.end_seconds),
                    duration: parseFloat(item.duration),
                    text: item.text,
                    imagePrompt: item.image_prompt,
                    selectedProvider: item.selected_provider,
                    imageUrl: item.image_url,
                    googleImageUrl: item.google_image_url,
                    pollinationsImageUrl: item.pollinations_image_url,
                    importedImageUrl: item.imported_image_url,
                    importedVideoUrl: item.imported_video_url,
                    imageCost: item.image_cost ? parseFloat(item.image_cost) : undefined,
                    characterIds: item.character_ids || [],
                    locationIds: item.location_ids || [],
                    propIds: item.prop_ids || [],
                    ...extraData
                };
            }),
            characters: assets
                .filter((asset: any) => asset.asset_type === 'character')
                .map((asset: any) => ({
                    id: asset.id, name: asset.name, realName: asset.real_name,
                    description: asset.description, imageUrl: asset.image_url, provider: asset.provider,
                })),
            locations: assets
                .filter((asset: any) => asset.asset_type === 'location')
                .map((asset: any) => ({
                    id: asset.id, name: asset.name, realName: asset.real_name,
                    description: asset.description, imageUrl: asset.image_url, provider: asset.provider,
                })),
            props: assets
                .filter((asset: any) => asset.asset_type === 'prop')
                .map((asset: any) => ({
                    id: asset.id, name: asset.name, realName: asset.real_name,
                    description: asset.description, imageUrl: asset.image_url, provider: asset.provider,
                })),
            updatedAt: data.updated_at,
        };

        return project;
    } catch (error) {
        console.error("Error loading project details", error);
        return null;
    }
};

export const getProjectAudio = async (projectId: string): Promise<Blob | null> => {
    try {
        const fileRef = ref(storage, `project-audio/${projectId}.mp3`);
        const response = await fetch(await getDownloadURL(fileRef));
        if (!response.ok) throw new Error("Network response was not ok");
        return await response.blob();
    } catch (e) {
        console.error("[Storage] Falha ao baixar áudio do projeto:", e);
        try {
            const backupRef = ref(storage, `project-audio/${projectId}`);
            const response = await fetch(await getDownloadURL(backupRef));
            if (!response.ok) throw new Error("Network response was not ok");
            return await response.blob();
        } catch(e2) {
            console.error("[Storage] Backup áudio também falhou:", e2);
            return null;
        }
    }
};

export const saveProject = async (
    project: Project,
    audioFile?: File | Blob
): Promise<Project> => {
    try {
        const projectId = project.id;
        console.log(`[Storage] Saving project ${projectId} (${project.name})...`);

        const projectData = {
            name: project.name || `Projeto ${new Date().toLocaleString()}`,
            date: project.date || new Date().toISOString(),
            context: project.context || '',
            project_style: project.projectStyle || '',
            image_style_name: project.image_style_name || '',
            custom_style_prompt: project.customStylePrompt || '',
            audio_url: project.audioUrl || '',
            updated_at: new Date().toISOString(),
            itemsCount: project.items?.length || 0
        };

        const docRef = doc(db, 'projects', projectId);
        
        // Assets e Items Batching
        const batch = writeBatch(db);
        
        // Atomicity: put main project save into the batch!
        batch.set(docRef, projectData, { merge: true });

        // Deletar antigos itens (Limitação do Firestore: precisa buscar primeiro)
        const itemsQuery = query(collection(db, 'projects', projectId, 'transcription_items'));
        const itemsSnap = await getDocs(itemsQuery);
        itemsSnap.forEach(docSnap => batch.delete(docSnap.ref));

        const assetsQuery = query(collection(db, 'projects', projectId, 'master_assets'));
        const assetsSnap = await getDocs(assetsQuery);
        assetsSnap.forEach(docSnap => batch.delete(docSnap.ref));

        // Assets mapping
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const isValidUUID = (id: string | undefined) => !!id && UUID_REGEX.test(id);

        const assetsToProcess = [
            ...(project.characters || []).map(char => ({ ...char, asset_type: 'character' as const })),
            ...(project.locations || []).map(loc => ({ ...loc, asset_type: 'location' as const })),
            ...(project.props || []).map(prop => ({ ...prop, asset_type: 'prop' as const }))
        ];

        const idMapping: Record<string, string> = {};

        const assetsToSave = assetsToProcess.map(asset => {
            if (!isValidUUID(asset.id)) {
                const newId = generateId();
                idMapping[asset.id] = newId;  
                return { ...asset, id: newId };
            }
            return asset;
        });

        // Add internal items to batch
        if (project.items && project.items.length > 0) {
            project.items.forEach((item, index) => {
                const extraData = {
                    medium: item.medium, subject: item.subject, action: item.action,
                    cenario: item.cenario, style: item.style, camera: item.camera,
                    negative: item.negative, animation: item.animation,
                    selectedMotionEffect: item.selectedMotionEffect,
                };

                const translateIds = (ids: string[]) => ids.map(id => idMapping[id] || id);
                const cleanBase64 = (url: string | undefined): string | null => {
                    if (!url || url.startsWith('data:')) return null;
                    return url;
                };

                let itemData: any = {
                    filename: item.filename,
                    start_timestamp: item.startTimestamp,
                    end_timestamp: item.endTimestamp,
                    start_seconds: item.startSeconds,
                    end_seconds: item.endSeconds,
                    duration: item.duration,
                    text: item.text,
                    image_prompt: item.imagePrompt,
                    visual_summary: JSON.stringify(extraData),
                    selected_provider: item.selectedProvider || 'google',
                    image_url: cleanBase64(item.imageUrl),
                    google_image_url: cleanBase64(item.googleImageUrl),
                    pollinations_image_url: cleanBase64(item.pollinationsImageUrl),
                    imported_image_url: cleanBase64(item.importedImageUrl),
                    imported_video_url: item.importedVideoUrl,
                    image_cost: item.imageCost,
                    character_ids: translateIds(item.characterIds || []),
                    location_ids: translateIds(item.locationIds || []),
                    prop_ids: translateIds(item.propIds || []),
                };
                
                // Firestore recusa valores 'undefined', substituindo por 'null'
                Object.keys(itemData).forEach(key => {
                    if (itemData[key] === undefined) {
                        itemData[key] = null;
                    }
                });

                // USE DETERMINISTIC IDS to prevent duplication during concurrent auto-saves
                const itemRef = doc(db, 'projects', projectId, 'transcription_items', `scene_${index}`);
                batch.set(itemRef, itemData);
            });
        }

        if (assetsToSave.length > 0) {
            assetsToSave.forEach(asset => {
                let assetData: any = {
                    asset_type: asset.asset_type, 
                    name: asset.name,
                    real_name: asset.realName,
                    description: asset.description,
                    image_url: asset.imageUrl, 
                    provider: asset.provider || 'google',
                };
                
                Object.keys(assetData).forEach(key => {
                    if (assetData[key] === undefined) {
                        assetData[key] = null;
                    }
                });

                const assetRef = doc(db, 'projects', projectId, 'master_assets', asset.id);
                batch.set(assetRef, assetData);
            });
        }

        await batch.commit();

        if (audioFile && audioFile instanceof Blob) {
            console.log(`[Storage] Uploading audio file (${audioFile.size} bytes)...`);
            const audioRef = ref(storage, `project-audio/${projectId}.mp3`);
            
            try {
                await uploadBytes(audioRef, audioFile, {
                    contentType: audioFile.type || 'audio/mpeg',
                });
                const url = await getDownloadURL(audioRef);
                console.log(`[Storage] Audio public URL generated: ${url}`);
                project.audioUrl = url;
                await setDoc(docRef, { audio_url: url }, { merge: true });
            } catch (uploadError: any) {
                console.error("[Storage] Failed to upload audio:", uploadError);
                if (uploadError.message?.includes("quota") || uploadError.message?.includes("limit")) {
                    alert(`Falha ao salvar o áudio na nuvem (${(audioFile.size / 1024 / 1024).toFixed(1)}MB). O projeto foi salvo, mas o áudio original será perdido se fechar a página. Reduza o áudio gravando em .mp3.`);
                }
            }
        }

        console.log(`[Storage] Project saved successfully.`);
        return project;
    } catch (error: any) {
        console.error("[Storage] Critical failure in saveProject:", error);
        throw error;
    }
};

export const deleteProject = async (id: string): Promise<boolean> => {
    try {
        console.log(`[Storage] Iniciando exclusão em cascata do projeto: ${id}`);

        const batch = writeBatch(db);

        // Delete children
        const itemsQuery = query(collection(db, 'projects', id, 'transcription_items'));
        const itemsSnap = await getDocs(itemsQuery);
        itemsSnap.forEach(docSnap => batch.delete(docSnap.ref));

        const assetsQuery = query(collection(db, 'projects', id, 'master_assets'));
        const assetsSnap = await getDocs(assetsQuery);
        assetsSnap.forEach(docSnap => batch.delete(docSnap.ref));

        // Delete main document
        batch.delete(doc(db, 'projects', id));
        await batch.commit();

        // Delete audio
        try {
            await deleteObject(ref(storage, `project-audio/${id}.mp3`));
        } catch(e) {}
        try {
            await deleteObject(ref(storage, `project-audio/${id}.wav`));
        } catch(e) {}
        try {
            await deleteObject(ref(storage, `project-audio/${id}`));
        } catch(e) {}

        console.log(`[Storage] Áudio removido.`);

        // Delete images
        try {
            const imagesRef = ref(storage, `project-images/${id}`);
            const imagesList = await listAll(imagesRef);
            await Promise.all(imagesList.items.map(item => deleteObject(item)));
            console.log(`[Storage] Imagens removidas.`);
        } catch(storageErr) {
            console.warn("[Storage] Falha ao esvaziar a pasta de imagens do projeto:", storageErr);
        }
        
        // Remove project folder root if possible
        try {
            await deleteObject(ref(storage, `project-images/${id}`));
        } catch(e) {}

        console.log(`[Storage] Projeto ${id} erradicado com sucesso.`);
        return true;
    } catch (error) {
        console.error("Error deleting project in cascade:", error);
        return false;
    }
};

// ==================== USAGE ====================
export const getUsageFromDB = async (): Promise<DailyUsage> => {
    const todayKey = new Date().toISOString().split('T')[0];
    try {
        const docRef = doc(db, 'daily_usage', todayKey);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            return {
                date: todayKey, text: data?.text || 0, image: data?.image || 0, external: data?.external || 0,
                costUSD: data?.cost_usd ? parseFloat(data.cost_usd) : 0,
                costBRL: data?.cost_brl ? parseFloat(data.cost_brl) : 0,
            };
        }
    } catch (e) { }
    return { date: todayKey, text: 0, image: 0, external: 0, costUSD: 0, costBRL: 0 };
};

export const incrementUsageInDB = async (type: 'text' | 'image' | 'external', costUSD: number = 0, costBRL: number = 0): Promise<DailyUsage> => {
    const current = await getUsageFromDB();
    const updatedDB = {
        date: current.date,
        text: type === 'text' ? current.text + 1 : current.text,
        image: type === 'image' ? current.image + 1 : current.image,
        external: type === 'external' ? current.external + 1 : current.external,
        cost_usd: current.costUSD + costUSD,
        cost_brl: current.costBRL + costBRL,
    };
    await setDoc(doc(db, 'daily_usage', current.date), updatedDB, { merge: true });
    return { ...current, ...updatedDB, costUSD: updatedDB.cost_usd, costBRL: updatedDB.cost_brl };
};

// ==================== SETTINGS ====================
export const saveSettingsToDB = async (settings: AppSettings): Promise<void> => {
    await setDoc(doc(db, 'app_settings', 'singleton'), { settings_data: settings }, { merge: true });
};

export const getSettingsFromDB = async (): Promise<AppSettings | null> => {
    try {
        const docRef = doc(db, 'app_settings', 'singleton');
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? docSnap.data().settings_data : null;
    } catch (e) { return null; }
};

// ==================== STYLE EXAMPLES ====================
export const saveStyleExample = async (example: StyleExample): Promise<void> => {
    // Benchmark master mantém persistência separada, estilos normais sobrescrevem uns aos outros
    const docId = example.styleId === 'benchmark_master' 
        ? `benchmark_${example.providerId}` 
        : example.styleId;

    let imageUrl = example.imageUrl;

    // Se a imagem é base64 e ultrapassa 800KB, salvar no Firebase Storage
    if (imageUrl && imageUrl.startsWith('data:') && imageUrl.length > 800_000) {
        try {
            const base64Data = imageUrl.split(',')[1];
            const binaryStr = atob(base64Data);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
            
            const storagePath = `style-examples/${docId}_${Date.now()}.png`;
            const storageRef = ref(storage, storagePath);
            await uploadBytes(storageRef, bytes, { contentType: 'image/png' });
            imageUrl = await getDownloadURL(storageRef);
            console.log(`[Storage] Imagem grande salva no Storage: ${storagePath}`);
        } catch (e) {
            console.warn('[Storage] Falha ao salvar no Storage, tentando Firestore:', e);
        }
    }

    await setDoc(doc(db, 'style_examples', docId), {
        style_id: example.styleId,
        provider_id: example.providerId || 'google-imagen',
        image_url: imageUrl,
        prompt: example.prompt,
        timestamp: example.timestamp,
    }, { merge: true });
};

export const getStyleExamples = async (): Promise<StyleExample[]> => {
    const q = collection(db, 'style_examples');
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
        const item = doc.data();
        return {
            styleId: item.style_id,
            providerId: item.provider_id,
            imageUrl: item.image_url,
            prompt: item.prompt,
            timestamp: item.timestamp,
        };
    });
};

export const clearStyleExamples = async (): Promise<void> => {
    const q = query(collection(db, 'style_examples'), where('style_id', '!=', 'none'));
    const querySnapshot = await getDocs(q);
    const batch = writeBatch(db);
    querySnapshot.forEach(docSnap => batch.delete(docSnap.ref));
    await batch.commit();
};

// ==================== IMAGE STYLE PROMPTS ====================
export const getImageStylePrompts = async (): Promise<ImageStyleOption[]> => {
    const q = query(collection(db, 'image_style_prompts'), where('is_active', '==', true));
    const querySnapshot = await getDocs(q);
    let items = querySnapshot.docs.map(doc => {
        const item = doc.data();
        return { display_order: item.display_order || 0, id: item.id || doc.id, label: item.label, prompt: item.prompt };
    });
    items.sort((a, b) => a.display_order - b.display_order);
    const uniqueItems = items.filter((v, i, a) => a.findIndex(t => (t.label === v.label)) === i);
    return uniqueItems;
};

export const saveImageStylePrompt = async (style: ImageStyleOption, displayOrder?: number): Promise<void> => {
    await setDoc(doc(db, 'image_style_prompts', style.id), { id: style.id, label: style.label, prompt: style.prompt, display_order: displayOrder || 0, is_active: true }, { merge: true });
};

export const deleteImageStylePrompt = async (id: string): Promise<void> => {
    await deleteDoc(doc(db, 'image_style_prompts', id));
};

export const saveImageStylePromptsBatch = async (styles: ImageStyleOption[]): Promise<void> => {
    const batch = writeBatch(db);
    styles.forEach((s, index) => {
        const docRef = doc(db, 'image_style_prompts', s.id);
        batch.set(docRef, {
            id: s.id,
            label: s.label,
            prompt: s.prompt,
            display_order: index,
            is_active: true
        });
    });
    await batch.commit();
};

export const getSubtitlePresets = async (): Promise<SubtitleStyleOption[]> => {
    const q = query(collection(db, 'subtitle_presets'), where('is_active', '==', true));
    const querySnapshot = await getDocs(q);
    let items = querySnapshot.docs.map(doc => {
        const item = doc.data();
        return {
            id: item.id || doc.id, label: item.label, maxWordsPerLine: item.max_words_per_line, fontSize: item.font_size,
            fontFamily: item.font_family, fontWeight: item.font_weight, textColor: item.text_color,
            strokeColor: item.stroke_color, strokeWidth: item.stroke_width, shadowColor: item.shadow_color,
            shadowBlur: item.shadow_blur, shadowOpacity: parseFloat(item.shadow_opacity),
            shadowDistance: item.shadow_distance, shadowAngle: item.shadow_angle, padding: item.padding,
            yPosition: item.y_position, isBold: item.is_bold, isItalic: item.is_italic, textCasing: item.text_casing,
            display_order: item.display_order || 0
        };
    });
    items.sort((a, b) => a.display_order - b.display_order);
    return items;
};

export const saveSubtitlePreset = async (preset: SubtitleStyleOption, displayOrder?: number): Promise<void> => {
    await setDoc(doc(db, 'subtitle_presets', preset.id), {
        id: preset.id, label: preset.label, max_words_per_line: preset.maxWordsPerLine, font_size: preset.fontSize,
        font_family: preset.fontFamily, font_weight: preset.fontWeight, text_color: preset.textColor,
        stroke_color: preset.strokeColor, stroke_width: preset.strokeWidth, shadow_color: preset.shadowColor,
        shadow_blur: preset.shadowBlur, shadow_opacity: preset.shadowOpacity, shadow_distance: preset.shadowDistance,
        shadow_angle: preset.shadowAngle, padding: preset.padding, y_position: preset.yPosition,
        is_bold: preset.isBold, is_italic: preset.isItalic, text_casing: preset.textCasing,
        display_order: displayOrder || 0, is_active: true
    }, { merge: true });
};

export const saveSubtitlePresetsBatch = async (presets: SubtitleStyleOption[]): Promise<void> => {
    const batch = writeBatch(db);
    presets.forEach((p, index) => {
        const docRef = doc(db, 'subtitle_presets', p.id);
        batch.set(docRef, {
            id: p.id, label: p.label, max_words_per_line: p.maxWordsPerLine, font_size: p.fontSize,
            font_family: p.fontFamily, font_weight: p.fontWeight, text_color: p.textColor,
            stroke_color: p.strokeColor, stroke_width: p.strokeWidth, shadow_color: p.shadowColor,
            shadow_blur: p.shadowBlur, shadow_opacity: p.shadowOpacity, shadow_distance: p.shadowDistance,
            shadow_angle: p.shadowAngle, padding: p.padding, y_position: p.yPosition,
            is_bold: p.isBold, is_italic: p.isItalic, text_casing: p.textCasing,
            display_order: index, is_active: true
        });
    });
    await batch.commit();
};

export const deleteSubtitlePreset = async (id: string): Promise<void> => {
    await deleteDoc(doc(db, 'subtitle_presets', id));
};

// ==================== MOTION EFFECTS ====================
export const getMotionEffects = async (): Promise<MotionEffect[]> => {
    const q = query(collection(db, 'motion_effects'), where('is_active', '==', true));
    const querySnapshot = await getDocs(q);
    let items = querySnapshot.docs.map(doc => {
        const item = doc.data();
        return { display_order: item.display_order || 0, id: item.id || doc.id, name: item.name, description: item.description, instruction: item.instruction };
    });
    items.sort((a, b) => a.display_order - b.display_order);
    return items;
};

export const saveMotionEffectsBatch = async (effects: MotionEffect[]): Promise<void> => {
    const batch = writeBatch(db);
    effects.forEach((e, index) => {
        const docRef = doc(db, 'motion_effects', e.id);
        batch.set(docRef, {
            id: e.id,
            name: e.name,
            description: e.description,
            instruction: e.instruction,
            display_order: index,
            is_active: true
        });
    });
    await batch.commit();
};

export const deleteMotionEffect = async (id: string): Promise<void> => {
    await deleteDoc(doc(db, 'motion_effects', id));
};

export const saveMotionEffect = async (effect: MotionEffect, order: number): Promise<void> => {
    await setDoc(doc(db, 'motion_effects', effect.id), {
        id: effect.id,
        name: effect.name,
        description: effect.description,
        instruction: effect.instruction,
        display_order: order,
        is_active: true
    }, { merge: true });
};

export const uploadProjectFile = async (projectId: string, file: File | Blob, type: string, filename?: string): Promise<string> => {
    try {
        const folder = type === 'audio' ? 'project-audio' : 'project-images';
        const rawExt = filename?.split('.').pop() || 'png';
        const ext = rawExt.toLowerCase();

        const baseName = filename ? filename.replace(`.${rawExt}`, '') : `file_${Date.now()}`;
        const sanitizedName = baseName
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]/gi, '_')
            .toLowerCase();

        const finalFilename = `${sanitizedName}.${ext}`;
        const path = type === 'audio' ? `project-audio/${projectId}.${ext}` : `${folder}/${projectId}/${finalFilename}`;

        const fileRef = ref(storage, path);
        await uploadBytes(fileRef, file, {
            contentType: file instanceof File ? file.type : (type === 'audio' ? 'audio/mpeg' : 'image/png')
        });

        return await getDownloadURL(fileRef);
    } catch (e) {
        console.error('[Storage] uploadProjectFile failed:', e);
        return '';
    }
};

export const downloadProjectFile = async (projectId: string, type: string): Promise<Blob | null> => {
    const folder = type === 'audio' ? 'project-audio' : 'project-images';
    const ext = type === 'audio' ? 'mp3' : 'png';
    const path = `${folder}/${projectId}.${ext}`;
    try {
        const fileRef = ref(storage, path);
        const response = await fetch(await getDownloadURL(fileRef));
        if (!response.ok) throw new Error("Not ok");
        return await response.blob();
    } catch (e) {
        console.error('[Storage] downloadProjectFile failed:', e);
        return null;
    }
};

export const getProjectFileUrl = async (projectId: string, type: string, filename?: string): Promise<string | null> => {
    try {
        const folder = type === 'audio' ? 'project-audio' : 'project-images';
        const path = type === 'audio' ? `project-audio/${projectId}.mp3` : `${folder}/${projectId}/${filename}`;
        const fileRef = ref(storage, path);
        return await getDownloadURL(fileRef);
    } catch (e) {
        return null;
    }
};
