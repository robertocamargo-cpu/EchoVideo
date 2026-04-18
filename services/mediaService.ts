
import { generateImage } from "./geminiService";
import { generatePollinationsImage, GPT_MODEL_NAME } from "./pollinationsService";

export type ImageProvider = 'google-fast' | 'google-nano' | 'pollinations-flux' | 'pollinations-gpt';

/**
 * Serviço unificado para geração de imagens de IA.
 * Centraliza a lógica para garantir consistência entre Storyboard, Galeria e Ativos.
 */
export const generateImageUnified = async (
    prompt: string,
    provider: string,
    aspectRatio: '16:9' | '9:16' = '16:9'
): Promise<{ image: string, prompt: string }> => {
    console.log(`[MediaService] Iniciando geração unificada — Provedor: ${provider} | Aspect: ${aspectRatio}`);

    try {
        switch (provider) {
            case 'google-fast':
                // v7.8.4: Restaurado para v4 conforme pedido
                const fastResult = await generateImage(prompt, aspectRatio, 'imagen-4.0-fast-generate-001');
                return { image: fastResult.image, prompt };

            case 'google-nano':
                const nanoResult = await generateImage(prompt, aspectRatio, 'gemini-2.5-flash-image');
                return { image: nanoResult.image, prompt };

            case 'pollinations-flux':
                return await generatePollinationsImage(prompt, 'flux', '', aspectRatio);

            case 'pollinations-gpt':
            case 'pollinations-zimage': // Fallback para nomes antigos
            case 'gptimage':
            case 'zimage':
                return await generatePollinationsImage(prompt, GPT_MODEL_NAME, '', aspectRatio);

            default:
                console.warn(`[MediaService] Provedor desconhecido "${provider}", tentando fallback para Pollinations Flux.`);
                return await generatePollinationsImage(prompt, 'flux', '', aspectRatio);
        }
    } catch (error: any) {
        console.error(`[MediaService] Erro crítico na geração (${provider}):`, error);
        throw error;
    }
};
