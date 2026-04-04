import { TranscriptionItem, MotionEffect } from "../types";

/**
 * Parâmetros extraídos da instrução técnica do efeito
 */
export interface EffectParams {
    scaleStart: number;
    scaleEnd: number;
    moveXStart: number;  // Em porcentagem da largura/altura (ex: -0.05 a 0.05)
    moveXEnd: number;
    moveYStart: number;
    moveYEnd: number;
    rotation?: number;
}

/**
 * Extrai palavras-chave da descrição do efeito
 */
const extractKeywords = (description: string): string[] => {
    const text = description.toLowerCase();
    const words = text.split(/\s+/);

    // Filtrar palavras comuns e manter apenas palavras significativas
    const stopWords = ['o', 'a', 'de', 'da', 'do', 'para', 'com', 'em', 'um', 'uma', 'e', 'ou'];
    return words.filter(w => w.length > 3 && !stopWords.includes(w));
};

/**
 * Calcula score de compatibilidade entre cena e efeito
 */
const calculateMatchScore = (
    sceneText: string,
    effect: MotionEffect
): number => {
    const sceneTextLower = sceneText.toLowerCase();
    const keywords = extractKeywords(effect.description);

    let score = 0;
    keywords.forEach(keyword => {
        if (sceneTextLower.includes(keyword)) {
            score += 0.2;
        }
    });

    // Normalizar score para máximo de 1.0
    return Math.min(score, 1.0);
};

/**
 * Tenta encontrar o melhor efeito baseado no contexto da cena
 */
const matchEffectToScene = (
    scene: TranscriptionItem,
    effects: MotionEffect[]
): MotionEffect | null => {
    if (effects.length === 0) return null;

    const sceneText = scene.text || scene.imagePrompt || '';

    // Calcular score para cada efeito
    const scores = effects.map(effect => ({
        effect,
        score: calculateMatchScore(sceneText, effect)
    }));

    // Ordenar por score (maior primeiro)
    scores.sort((a, b) => b.score - a.score);

    // Retornar melhor match se score > threshold (30%)
    const best = scores[0];
    return best.score > 0.3 ? best.effect : null;
};

/**
 * Seleciona um efeito aleatório da lista
 */
const getRandomEffect = (effects: MotionEffect[]): MotionEffect => {
    const randomIndex = Math.floor(Math.random() * effects.length);
    return effects[randomIndex];
};

/**
 * Seleciona efeito usando IA (Gemini API)
 * 
 * @param scene - Cena para análise
 * @param effects - Efeitos disponíveis
 * @returns ID do efeito selecionado ou null se falhar
 */
const selectEffectWithAI = async (
    scene: TranscriptionItem,
    effects: MotionEffect[]
): Promise<string | null> => {
    try {
        // Importar GoogleGenAI do módulo correto
        const { GoogleGenAI } = await import('@google/genai');

        // Acessar variável de ambiente via process.env (configurado no vite.config.ts)
        const apiKey = (process.env as any).GEMINI_API_KEY || (process.env as any).API_KEY;

        if (!apiKey) {
            console.warn('GEMINI_API_KEY não configurada em process.env, usando seleção contextual');
            return null;
        }

        const ai = new GoogleGenAI({ apiKey });

        const sceneText = scene.text || '';
        const sceneVisual = scene.imagePrompt || '';

        const effectsList = effects.map(e =>
            `- ID: ${e.id}\n  Nome: ${e.name}\n  Descrição: ${e.description}\n  Instrução: ${e.instruction}`
        ).join('\n\n');

        const prompt = `Você é um diretor de fotografia especializado em Ken Burns. Escolha o efeito de movimento ideal para a cena abaixo.

CENA:
Texto: "${sceneText}"
Descrição Visual: "${sceneVisual}"

EFEITOS DISPONÍVEIS (Escolha estritamente UM destes IDs):
${effectsList}

REGRAS CRÍTICAS:
1. Analise o "mood" da cena: Cenas introspectivas pedem zooms lentos e suaves. Cenas de ação pedem pans rápidos ou zooms intensos.
2. Seja criativo: Varie as direções (esquerda, direita, cima, baixo) para manter o dinamismo visual.
3. Use APENAS os IDs listados acima.
4. Proibido repetir o efeito da cena anterior se houver outras opções.
5. Retorne APENAS o ID do efeito (ex: "zoom-in-left").

Resposta:`;

        const responseJson = await ai.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: {
                parts: [{ text: prompt }]
            }
        });

        const responseText = responseJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
        // Limpeza agressiva da resposta: pegar apenas o primeiro ID válido encontrado ou limpar markdown
        const response = responseText.trim().replace(/[`"']+/g, '').split('\n')[0].trim().toLowerCase();

        // Validar se o ID retornado existe
        const selectedEffect = effects.find(e => e.id.toLowerCase() === response);
        if (selectedEffect) {
            console.log(`✨ IA selecionou: ${selectedEffect.name} [ID: ${selectedEffect.id}] para cena: "${sceneText.substring(0, 40)}..."`);
            return selectedEffect.id;
        }

        console.warn(`IA retornou algo não mapeado: "${response}". Tentando match contextual.`);
        return null;
    } catch (error) {
        console.error('Erro ao usar IA para seleção de efeito:', error);
        return null;
    }
};

/**
 * Seleciona o melhor efeito para uma cena
 * 
 * @param scene - Cena para a qual selecionar o efeito
 * @param availableEffects - Lista de efeitos disponíveis
 * @param previousEffect - Efeito usado na cena anterior (para evitar repetição)
 * @param useAI - Se deve tentar usar IA para seleção (padrão: true)
 * @returns Efeito selecionado
 */
export const selectEffectForScene = async (
    scene: TranscriptionItem,
    availableEffects: MotionEffect[],
    previousEffect?: MotionEffect,
    useAI: boolean = true
): Promise<MotionEffect> => {
    if (availableEffects.length === 0) {
        throw new Error("Nenhum efeito disponível para seleção");
    }

    // 1. Filtrar efeito anterior para evitar repetição ABSOLUTA
    // Se tivermos mais de um efeito disponível, os candidatos NUNCA podem incluir o anterior.
    let candidates = previousEffect && availableEffects.length > 1
        ? availableEffects.filter(e => e.id !== previousEffect.id)
        : availableEffects;

    // 2. Tentar seleção por IA (se habilitado)
    if (useAI) {
        const aiSelectedId = await selectEffectWithAI(scene, candidates);
        if (aiSelectedId) {
            const aiEffect = candidates.find(e => e.id === aiSelectedId);
            if (aiEffect) return aiEffect;
        }
    }

    // 3. Tentar match contextual
    const bestMatch = matchEffectToScene(scene, candidates);
    if (bestMatch) {
        console.log(`✨ Efeito selecionado por contexto: ${bestMatch.name} para cena: "${scene.text.substring(0, 50)}..."`);
        return bestMatch;
    }

    // 4. Fallback aleatório (garantindo não repetir se possível)
    const randomEffect = getRandomEffect(candidates);
    console.log(`🎲 Efeito selecionado aleatoriamente: ${randomEffect.name} para cena: "${scene.text.substring(0, 50)}..."`);
    return randomEffect;
};

export const parseEffectInstruction = (instruction: string): EffectParams => {
    const defaultParams: EffectParams = {
        scaleStart: 1.15,
        scaleEnd: 1.25,
        moveXStart: 0,
        moveXEnd: 0,
        moveYStart: 0,
        moveYEnd: 0
    };

    if (!instruction) return defaultParams;

    try {
        const text = instruction.toLowerCase();
        const params: Partial<EffectParams> = {};

        // 1. Extrair Escalas (Ex: "from 1.12 to 1.22" ou "scale from 1.12 to 1.22")
        const scaleMatch = text.match(/scale\s+from\s+([\d.]+)\s+to\s+([\d.]+)/i);
        if (scaleMatch) {
            params.scaleStart = parseFloat(scaleMatch[1]);
            params.scaleEnd = parseFloat(scaleMatch[2]);
        }

        // 2. Detectar Tags de Movimento explicíticas (Ex: "move:right")
        let moveTag = 'none';
        const tagMatch = text.match(/move:([a-z-]+)/i);
        if (tagMatch) moveTag = tagMatch[1];

        // 3. Extrair Eixos Nomeados (Prioridade Máxima)
        const hMatch = text.match(/horizontal axis.*?from\s+([+-]?\d+)%\s+to\s+([+-]?\d+)%/i);
        const vMatch = text.match(/vertical axis.*?from\s+([+-]?\d+)%\s+to\s+([+-]?\d+)%/i);
        
        let hStart = 0, hEnd = 0, vStart = 0, vEnd = 0;

        if (hMatch) {
            hStart = parseFloat(hMatch[1]) / 100;
            hEnd = parseFloat(hMatch[2]) / 100;
        }
        if (vMatch) {
            vStart = parseFloat(vMatch[1]) / 100;
            vEnd = parseFloat(vMatch[2]) / 100;
        }

        // 4. Fallback: Se não encontrou eixos nomeados, busca por range atrelado a moveTag
        if (!hMatch && !vMatch) {
            const specificPattern = new RegExp(`move:${moveTag}.*?from\\s+([+-]?\\d+)%\\s+to\\s+([+-]?\\d+)%`, 'i');
            const specificMatch = text.match(specificPattern);
            if (specificMatch) {
                const s = parseFloat(specificMatch[1]) / 100;
                const e = parseFloat(specificMatch[2]) / 100;
                if (['left', 'right'].includes(moveTag)) { hStart = s; hEnd = e; }
                else if (['up', 'down'].includes(moveTag)) { vStart = s; vEnd = e; }
                else { hStart = s; hEnd = e; vStart = s; vEnd = e; }
            }
        }

        const finalParams = { ...defaultParams, ...params };
        finalParams.moveXStart = hStart;
        finalParams.moveXEnd = hEnd;
        finalParams.moveYStart = vStart;
        finalParams.moveYEnd = vEnd;

        // 5. Fallback Legado Geométrico
        if (hStart === 0 && hEnd === 0 && vStart === 0 && vEnd === 0 && moveTag !== 'none') {
            const range = 0.05;
            if (moveTag === 'right') { finalParams.moveXStart = -range; finalParams.moveXEnd = range; }
            else if (moveTag === 'left') { finalParams.moveXStart = range; finalParams.moveXEnd = -range; }
            if (moveTag.includes('up')) { finalParams.moveYStart = range; finalParams.moveYEnd = -range; }
            else if (moveTag.includes('down')) { finalParams.moveYStart = -range; finalParams.moveYEnd = range; }
        }

        return finalParams;
    } catch (error) {
        console.error("Erro ao parsear instrução de efeito:", error);
        return defaultParams;
    }
};

/**
 * Pré-seleciona efeitos para todas as cenas
 * 
 * @param scenes - Lista de cenas
 * @param availableEffects - Lista de efeitos disponíveis
 * @param useAI - Se deve usar IA para seleção (padrão: true)
 * @returns Mapa de índice da cena para efeito selecionado
 */
export const preselectEffectsForScenes = async (
    scenes: TranscriptionItem[],
    availableEffects: MotionEffect[],
    useAI: boolean = true
): Promise<Map<number, MotionEffect>> => {
    const effectMap = new Map<number, MotionEffect>();

    if (availableEffects.length === 0) {
        console.warn("Nenhum efeio disponível, usando efeitos padrão");
        return effectMap;
    }

    // Histórico de efeitos para evitar repetição excessiva
    const effectHistory: MotionEffect[] = [];
    const MAX_HISTORY = Math.min(3, availableEffects.length - 1);

    for (let index = 0; index < scenes.length; index++) {
        const scene = scenes[index];
        
        // No selectEffectForScene, agora passamos o último efeito para compatibilidade, 
        // mas a lógica local aqui vai forçar a variedade baseada no histórico.
        const previousEffect = effectHistory.length > 0 ? effectHistory[effectHistory.length - 1] : undefined;
        
        // Filtramos os candidatos localmente para garantir variedade maior que 1 cena
        const candidates = availableEffects.filter(e => !effectHistory.some(h => h.id === e.id));
        const pool = candidates.length > 0 ? candidates : availableEffects;

        const selectedEffect = await selectEffectForScene(scene, pool, previousEffect, useAI);
        
        effectMap.set(index, selectedEffect);
        
        // Atualiza histórico
        effectHistory.push(selectedEffect);
        if (effectHistory.length > MAX_HISTORY) {
            effectHistory.shift();
        }
    }

    return effectMap;
};
