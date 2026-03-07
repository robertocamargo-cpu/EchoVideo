import { Project, TranscriptionItem, AppSettings, StyleExample, MasterAsset, ImageHistoryItem, ImageStyleOption, SubtitleStyleOption, MotionEffect } from "../types";
import { DailyUsage } from "./usageService";
import { supabase } from "./supabaseClient";

export { supabase };

// ==================== PROJECTS ====================

export const getProjects = async (): Promise<Project[]> => {
    try {
        const { data, error } = await supabase
            .from('projects')
            .select(`
                *,
                transcription_items(count)
            `)
            .order('date', { ascending: false });

        if (error) throw error;

        return (data || []).map((proj: any) => ({
            id: proj.id,
            name: proj.name,
            date: proj.date,
            context: proj.context,
            projectStyle: proj.project_style,
            customStylePrompt: proj.custom_style_prompt,
            audioUrl: proj.audio_url,
            updatedAt: proj.updated_at,
            items: [],
            itemsCount: proj.transcription_items?.[0]?.count || 0,
            characters: [],
            locations: []
        }));
    } catch (error) {
        console.error("Error loading projects", error);
        return [];
    }
};

export const findProjectByName = async (name: string): Promise<Project | null> => {
    try {
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('name', name)
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        if (!data) return null;

        return {
            id: data.id,
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
            locations: []
        };
    } catch (error) {
        console.error("Error finding project by name", error);
        return null;
    }
};

export const getProjectById = async (id: string): Promise<Project | null> => {
    try {
        const { data, error } = await supabase
            .from('projects')
            .select(`
                *,
                transcription_items (*),
                master_assets (*)
            `)
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!data) return null;

        const project: Project = {
            id: data.id,
            name: data.name,
            date: data.date,
            context: data.context,
            projectStyle: data.project_style,
            image_style_name: data.image_style_name,
            customStylePrompt: data.custom_style_prompt,
            audioUrl: data.audio_url,
            items: data.transcription_items
                .sort((a: any, b: any) => parseFloat(a.start_seconds) - parseFloat(b.start_seconds))
                .map((item: any) => {
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
                        imageCost: item.imageCost ? parseFloat(item.imageCost) : undefined,
                        characterIds: item.character_ids || [],
                        locationIds: item.location_ids || [],
                        propIds: item.prop_ids || [],
                        ...extraData
                    };
                }),
            characters: data.master_assets
                .filter((asset: any) => asset.asset_type === 'character')
                .map((asset: any) => ({
                    id: asset.id, name: asset.name, realName: asset.real_name,
                    description: asset.description, imageUrl: asset.image_url, provider: asset.provider,
                })),
            locations: data.master_assets
                .filter((asset: any) => asset.asset_type === 'location')
                .map((asset: any) => ({
                    id: asset.id, name: asset.name, realName: asset.real_name,
                    description: asset.description, imageUrl: asset.image_url, provider: asset.provider,
                })),
            props: data.master_assets
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
        // Tentar primeiro com .wav (padrão)
        const { data, error } = await supabase.storage
            .from('project-audio')
            .download(`${projectId}.wav`);

        if (!error && data) return data;

        // Tentar sem extensão (backup)
        console.warn(`[Storage] Download .wav falhou para ${projectId}, tentando sem extensão...`);
        const { data: data2, error: error2 } = await supabase.storage
            .from('project-audio')
            .download(`${projectId}`);

        if (!error2 && data2) return data2;

        if (error) throw error;
        return null;
    } catch (e) {
        console.error("[Storage] Falha ao baixar áudio do projeto:", e);
        return null;
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
            id: projectId,
            name: project.name || `Projeto ${new Date().toLocaleString()}`,
            date: project.date || new Date().toISOString(),
            context: project.context,
            project_style: project.projectStyle,
            image_style_name: project.image_style_name,
            custom_style_prompt: project.customStylePrompt,
            audio_url: project.audioUrl,
            updated_at: new Date().toISOString(),
        };

        const { error: projectError } = await supabase.from('projects').upsert(projectData);
        if (projectError) throw projectError;

        console.log(`[Storage] Cleaning up old items...`);
        await supabase.from('transcription_items').delete().eq('project_id', projectId);
        await supabase.from('master_assets').delete().eq('project_id', projectId);

        // (1) Extrair todos os assets para salvar e criar mapeamento de IDs
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const isValidUUID = (id: string | undefined) => !!id && UUID_REGEX.test(id);

        const assetsToProcess = [
            ...(project.characters || []).map(char => ({ ...char, asset_type: 'character' as const })),
            ...(project.locations || []).map(loc => ({ ...loc, asset_type: 'location' as const })),
            ...(project.props || []).map(prop => ({ ...prop, asset_type: 'prop' as const }))
        ];

        // Mapeamento: ID_Antigo -> ID_Novo (UUID válido)
        const idMapping: Record<string, string> = {};

        const assetsToSave = assetsToProcess.map(asset => {
            if (!isValidUUID(asset.id)) {
                const newId = crypto.randomUUID();
                idMapping[asset.id] = newId;  // Guarda de onde veio e para onde vai
                return { ...asset, id: newId };
            }
            return asset;
        });

        // (2) Preparar itens de transcrição, atualizando IDs antigos para novos UUIDs
        if (project.items && project.items.length > 0) {
            const transcriptionData = project.items.map(item => {
                const extraData = {
                    medium: item.medium, subject: item.subject, action: item.action,
                    cenario: item.cenario, style: item.style, camera: item.camera,
                    negative: item.negative, animation: item.animation,
                    selectedMotionEffect: item.selectedMotionEffect,
                };

                // Função helper para traduzir arrays de IDs usando o mapeamento
                const translateIds = (ids: string[]) => ids.map(id => idMapping[id] || id);

                return {
                    project_id: projectId,
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
                    image_url: item.imageUrl,
                    google_image_url: item.googleImageUrl,
                    pollinations_image_url: item.pollinationsImageUrl,
                    imported_image_url: item.importedImageUrl,
                    imported_video_url: item.importedVideoUrl,
                    image_cost: item.imageCost,
                    character_ids: translateIds(item.characterIds || []),
                    location_ids: translateIds(item.locationIds || []),
                    prop_ids: translateIds(item.propIds || []),
                };
            });

            const { error: itemsError } = await supabase.from('transcription_items').insert(transcriptionData);
            if (itemsError) throw itemsError;
        }

        // (3) Salvar Assets já com IDs corrigidos
        if (assetsToSave.length > 0) {
            const assetData = assetsToSave.map(asset => ({
                id: asset.id,
                project_id: projectId, asset_type: asset.asset_type, name: asset.name,
                real_name: asset.realName,
                description: asset.description,
                image_url: asset.imageUrl, provider: asset.provider || 'google',
            }));
            const { error: assetError } = await supabase.from('master_assets').insert(assetData);
            if (assetError) throw assetError;
        }


        if (audioFile && audioFile instanceof Blob) {
            console.log(`[Storage] Uploading audio file (${audioFile.size} bytes)...`);
            const { error: uploadError } = await supabase.storage.from('project-audio').upload(`${projectId}.wav`, audioFile, {
                upsert: true, contentType: audioFile.type || 'audio/wav',
            });
            if (uploadError) {
                console.error("[Storage] Failed to upload audio:", uploadError);
                if (uploadError.message.includes("size") || uploadError.message.includes("limit")) {
                    alert(`Falha ao salvar o áudio na nuvem (${(audioFile.size / 1024 / 1024).toFixed(1)}MB). Provavelmente excede o limite do Supabase Free (50MB). O projeto foi salvo, mas o áudio original será perdido se fechar a página. Reduza o áudio gravando em .mp3.`);
                }
            } else {
                const { data: urlData } = supabase.storage.from('project-audio').getPublicUrl(`${projectId}.wav`);
                if (urlData?.publicUrl) {
                    console.log(`[Storage] Audio public URL generated: ${urlData.publicUrl}`);
                    project.audioUrl = urlData.publicUrl;
                    await supabase.from('projects').update({ audio_url: urlData.publicUrl }).eq('id', projectId);
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

        // 1. Limpar Banco de Dados (Filhos Primários via SQL)
        await supabase.from('transcription_items').delete().eq('project_id', id);
        await supabase.from('master_assets').delete().eq('project_id', id);

        // 2. Limpar Bucket de Áudio (project-audio)
        await supabase.storage.from('project-audio').remove([`${id}.wav`, `${id}`]);
        console.log(`[Storage] Áudio removido.`);

        // 3. Limpar Bucket de Imagens (project-images/[ID_DO_PROJETO]/*)
        // O Supabase precisa que listemos os arquivos da pasta antes de apagar
        const { data: files } = await supabase.storage.from('project-images').list(id);
        if (files && files.length > 0) {
            const filePaths = files.map(x => `${id}/${x.name}`);
            const { error: storageErr } = await supabase.storage.from('project-images').remove(filePaths);
            if (storageErr) {
                console.error("[Storage] Falha ao esvaziar a pasta de imagens do projeto:", storageErr);
            } else {
                console.log(`[Storage] Imagens removidas: ${filePaths.length} arquivos deletados.`);
            }
        }

        // 4. Limpar Projeto Mestre
        const { error } = await supabase.from('projects').delete().eq('id', id);
        if (error) throw error;
        
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
        const { data } = await supabase.from('daily_usage').select('*').eq('date', todayKey).maybeSingle();
        return {
            date: todayKey, text: data?.text || 0, image: data?.image || 0, external: data?.external || 0,
            costUSD: data?.cost_usd ? parseFloat(data.cost_usd) : 0,
            costBRL: data?.cost_brl ? parseFloat(data.cost_brl) : 0,
        };
    } catch (e) { return { date: todayKey, text: 0, image: 0, external: 0, costUSD: 0, costBRL: 0 }; }
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
    await supabase.from('daily_usage').upsert(updatedDB, { onConflict: 'date' });
    return { ...current, ...updatedDB, costUSD: updatedDB.cost_usd, costBRL: updatedDB.cost_brl };
};

// ==================== SETTINGS ====================
export const saveSettingsToDB = async (settings: AppSettings): Promise<void> => {
    const { data: existing } = await supabase.from('app_settings').select('id').limit(1).single();
    if (existing) {
        await supabase.from('app_settings').update({ settings_data: settings }).eq('id', existing.id);
    } else {
        await supabase.from('app_settings').insert({ settings_data: settings });
    }
};

export const getSettingsFromDB = async (): Promise<AppSettings | null> => {
    try {
        const { data } = await supabase.from('app_settings').select('settings_data').limit(1).single();
        return data?.settings_data || null;
    } catch (e) { return null; }
};

// ==================== STYLE EXAMPLES ====================
export const saveStyleExample = async (example: StyleExample): Promise<void> => {
    await supabase.from('style_examples').upsert({
        style_id: example.styleId,
        image_url: example.imageUrl,
        prompt: example.prompt,
        timestamp: example.timestamp,
    }, { onConflict: 'style_id' });
};

export const getStyleExamples = async (): Promise<StyleExample[]> => {
    const { data } = await supabase.from('style_examples').select('*');
    return (data || []).map((item: any) => ({
        styleId: item.style_id,
        imageUrl: item.image_url,
        prompt: item.prompt,
        timestamp: item.timestamp,
    }));
};

export const clearStyleExamples = async (): Promise<void> => {
    await supabase.from('style_examples').delete().neq('style_id', 'none');
};

// ==================== IMAGE STYLE PROMPTS ====================
export const getImageStylePrompts = async (): Promise<ImageStyleOption[]> => {
    const { data } = await supabase.from('image_style_prompts').select('*').eq('is_active', true).order('display_order');
    const items = (data || []).map(item => ({ id: item.id, label: item.label, prompt: item.prompt }));
    // Remove duplicates by label
    const uniqueItems = items.filter((v, i, a) => a.findIndex(t => (t.label === v.label)) === i);
    return uniqueItems;
};

export const saveImageStylePrompt = async (style: ImageStyleOption, displayOrder?: number): Promise<void> => {
    await supabase.from('image_style_prompts').upsert({ id: style.id, label: style.label, prompt: style.prompt, display_order: displayOrder || 0, is_active: true });
};

export const deleteImageStylePrompt = async (id: string): Promise<void> => {
    await supabase.from('image_style_prompts').delete().eq('id', id);
};

export const saveImageStylePromptsBatch = async (styles: ImageStyleOption[]): Promise<void> => {
    const data = styles.map((s, index) => ({
        id: s.id,
        label: s.label,
        prompt: s.prompt,
        display_order: index,
        is_active: true
    }));
    await supabase.from('image_style_prompts').upsert(data);
};

// ==================== SUBTITLE PRESETS ====================
export const getSubtitlePresets = async (): Promise<SubtitleStyleOption[]> => {
    const { data } = await supabase.from('subtitle_presets').select('*').eq('is_active', true).order('display_order');
    return (data || []).map(item => ({
        id: item.id, label: item.label, maxWordsPerLine: item.max_words_per_line, fontSize: item.font_size,
        fontFamily: item.font_family, fontWeight: item.font_weight, textColor: item.text_color,
        strokeColor: item.stroke_color, strokeWidth: item.stroke_width, shadowColor: item.shadow_color,
        shadowBlur: item.shadow_blur, shadowOpacity: parseFloat(item.shadow_opacity),
        shadowDistance: item.shadow_distance, shadowAngle: item.shadow_angle, padding: item.padding,
        yPosition: item.y_position, isBold: item.is_bold, isItalic: item.is_italic, textCasing: item.text_casing
    }));
};

export const saveSubtitlePreset = async (preset: SubtitleStyleOption, displayOrder?: number): Promise<void> => {
    await supabase.from('subtitle_presets').upsert({
        id: preset.id, label: preset.label, max_words_per_line: preset.maxWordsPerLine, font_size: preset.fontSize,
        font_family: preset.fontFamily, font_weight: preset.fontWeight, text_color: preset.textColor,
        stroke_color: preset.strokeColor, stroke_width: preset.strokeWidth, shadow_color: preset.shadowColor,
        shadow_blur: preset.shadowBlur, shadow_opacity: preset.shadowOpacity, shadow_distance: preset.shadowDistance,
        shadow_angle: preset.shadowAngle, padding: preset.padding, y_position: preset.yPosition,
        is_bold: preset.isBold, is_italic: preset.isItalic, text_casing: preset.textCasing,
        display_order: displayOrder || 0, is_active: true
    });
};

export const saveSubtitlePresetsBatch = async (presets: SubtitleStyleOption[]): Promise<void> => {
    const data = presets.map((p, index) => ({
        id: p.id, label: p.label, max_words_per_line: p.maxWordsPerLine, font_size: p.fontSize,
        font_family: p.fontFamily, font_weight: p.fontWeight, text_color: p.textColor,
        stroke_color: p.strokeColor, stroke_width: p.strokeWidth, shadow_color: p.shadowColor,
        shadow_blur: p.shadowBlur, shadow_opacity: p.shadowOpacity, shadow_distance: p.shadowDistance,
        shadow_angle: p.shadowAngle, padding: p.padding, y_position: p.yPosition,
        is_bold: p.isBold, is_italic: p.isItalic, text_casing: p.textCasing,
        display_order: index, is_active: true
    }));
    await supabase.from('subtitle_presets').upsert(data);
};

export const deleteSubtitlePreset = async (id: string): Promise<void> => {
    await supabase.from('subtitle_presets').delete().eq('id', id);
};

// ==================== MOTION EFFECTS ====================
export const getMotionEffects = async (): Promise<MotionEffect[]> => {
    const { data } = await supabase.from('motion_effects').select('*').eq('is_active', true).order('display_order');
    return (data || []).map(item => ({ id: item.id, name: item.name, description: item.description, instruction: item.instruction }));
};

export const saveMotionEffectsBatch = async (effects: MotionEffect[]): Promise<void> => {
    const data = effects.map((e, index) => ({
        id: e.id,
        name: e.name,
        description: e.description,
        instruction: e.instruction,
        display_order: index,
        is_active: true
    }));
    await supabase.from('motion_effects').upsert(data);
};

export const deleteMotionEffect = async (id: string): Promise<void> => {
    await supabase.from('motion_effects').delete().eq('id', id);
};

export const saveMotionEffect = async (effect: MotionEffect, order: number): Promise<void> => {
    await supabase.from('motion_effects').upsert({
        id: effect.id,
        name: effect.name,
        description: effect.description,
        instruction: effect.instruction,
        display_order: order,
        is_active: true
    });
};

export const uploadProjectFile = async (projectId: string, file: File | Blob, type: string, filename?: string): Promise<string> => {
    try {
        const bucket = type === 'audio' ? 'project-audio' : 'project-images';
        const rawExt = filename?.split('.').pop() || 'png';
        const ext = rawExt.toLowerCase();

        // Sanitizar nome do arquivo: remover caracteres especiais e espaços
        const baseName = filename ? filename.replace(`.${rawExt}`, '') : `file_${Date.now()}`;
        const sanitizedName = baseName
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
            .replace(/[^a-z0-9]/gi, '_') // troca especiais por underline
            .toLowerCase();

        const finalFilename = `${sanitizedName}.${ext}`;
        const path = type === 'audio' ? `${projectId}.${ext}` : `${projectId}/${finalFilename}`;

        const { error } = await supabase.storage.from(bucket).upload(path, file, {
            upsert: true,
            contentType: file instanceof File ? file.type : (type === 'audio' ? 'audio/wav' : 'image/png')
        });
        if (error) throw error;

        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        return data.publicUrl;
    } catch (e) {
        console.error('[Storage] uploadProjectFile failed:', e);
        return '';
    }
};

export const downloadProjectFile = async (projectId: string, type: string): Promise<Blob | null> => {
    const bucket = type === 'audio' ? 'project-audio' : 'project-images';
    const ext = type === 'audio' ? 'wav' : 'png';
    const path = `${projectId}.${ext}`;
    try {
        const { data, error } = await supabase.storage.from(bucket).download(path);
        if (error) throw error;
        return data;
    } catch (e) {
        console.error('[Storage] downloadProjectFile failed:', e);
        return null;
    }
};

export const getProjectFileUrl = async (projectId: string, type: string, filename?: string): Promise<string | null> => {
    const bucket = type === 'audio' ? 'project-audio' : 'project-images';
    const path = type === 'audio' ? `${projectId}.wav` : `${projectId}/${filename}`;
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl || null;
};
