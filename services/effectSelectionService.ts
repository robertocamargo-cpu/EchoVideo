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

    // 1. Filtrar efeito anterior para evitar repetição
    const candidates = previousEffect
        ? availableEffects.filter(e => e.id !== previousEffect.id)
        : availableEffects;

    // Se só sobrou um efeito ou nenhum, usar todos
    const effectsToConsider = candidates.length > 0 ? candidates : availableEffects;

    // 2. Tentar seleção por IA (se habilitado)
    if (useAI) {
        const aiSelectedId = await selectEffectWithAI(scene, effectsToConsider);
        if (aiSelectedId) {
            const aiEffect = effectsToConsider.find(e => e.id === aiSelectedId);
            if (aiEffect) return aiEffect;
        }
    }

    // 3. Tentar match contextual
    const bestMatch = matchEffectToScene(scene, effectsToConsider);
    if (bestMatch) {
        console.log(`Efeito selecionado por contexto: ${bestMatch.name} para cena: "${scene.text.substring(0, 50)}..."`);
        return bestMatch;
    }

    // 4. Fallback aleatório
    const randomEffect = getRandomEffect(effectsToConsider);
    console.log(`Efeito selecionado aleatoriamente: ${randomEffect.name} para cena: "${scene.text.substring(0, 50)}..."`);
    return randomEffect;
};

/**
 * Parseia a instrução técnica do efeito e retorna parâmetros numéricos
 * 
 * Formato esperado: "zoom:START-END,move:DIRECTION"
 * Exemplos:
 * - "zoom:1.15-1.35,move:left-up"
 * - "zoom:1.35-1.15,move:right-down"
 * - "zoom:1.0-1.2,move:none"
 */
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
        const parts = instruction.toLowerCase().split(/[,;]/);
        const params: Partial<EffectParams> = {};

        let moveTag = 'none';
        let xRange = 0;
        let yRange = 0;

        parts.forEach(part => {
            const cleanPart = part.trim();
            if (!cleanPart || !cleanPart.includes(':')) return;

            const [key, value] = cleanPart.split(':').map(s => s.trim());

            if (key === 'zoom') {
                const [start, end] = value.split('-').map(parseFloat);
                if (!isNaN(start)) params.scaleStart = start;
                if (!isNaN(end)) params.scaleEnd = end;
            } else if (key === 'move') {
                moveTag = value;
            } else if (key === 'xrange') {
                xRange = parseFloat(value) / 100;
            } else if (key === 'yrange') {
                yRange = parseFloat(value) / 100;
            } else if (key === 'rotation') {
                const rotation = parseFloat(value);
                if (!isNaN(rotation)) params.rotation = rotation;
            }
        });

        // Aplicar lógica de direção baseada nas tags do instructions.md
        const finalParams = { ...defaultParams, ...params };

        // Horizontal
        if (moveTag === 'right') {
            finalParams.moveXStart = -xRange;
            finalParams.moveXEnd = xRange;
        } else if (moveTag === 'left') {
            finalParams.moveXStart = xRange;
            finalParams.moveXEnd = -xRange;
        }

        // Vertical / Diagonal
        if (moveTag.includes('up')) {
            finalParams.moveYStart = yRange; // Inicia embaixo (+ em canvas)
            finalParams.moveYEnd = -yRange;  // Vai para cima (- em canvas)
        } else if (moveTag.includes('down')) {
            finalParams.moveYStart = -yRange;
            finalParams.moveYEnd = yRange;
        }

        // Movimento Horizontal Complementar em Diagonais
        if (moveTag === 'right-up' || moveTag === 'right-down') {
            finalParams.moveXStart = -xRange;
            finalParams.moveXEnd = xRange;
        } else if (moveTag === 'left-up' || moveTag === 'left-down') {
            finalParams.moveXStart = xRange;
            finalParams.moveXEnd = -xRange;
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
        console.warn("Nenhum efeito disponível, usando efeitos padrão");
        return effectMap;
    }

    let previousEffect: MotionEffect | undefined;

    for (let index = 0; index < scenes.length; index++) {
        const scene = scenes[index];
        const selectedEffect = await selectEffectForScene(scene, availableEffects, previousEffect, useAI);
        effectMap.set(index, selectedEffect);
        previousEffect = selectedEffect;
    }

    return effectMap;
};
