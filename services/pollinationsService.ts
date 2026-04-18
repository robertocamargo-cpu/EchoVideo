import { logApiCost } from "./usageService";

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      if (result) resolve(result);
      else reject(new Error("Failed to convert blob to base64"));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const POLLINATIONS_MODEL_NAME = "flux";
export const GPT_MODEL_NAME = "zimage"; // v7.5.4: Alterado de gptimage para zimage conforme solicitado

const FLUX_KEY = (import.meta as any).env.VITE_FLUX_KEY || '';

export const generatePollinationsImage = async (
  fullPrompt: string,
  model: string = 'flux',
  _unusedContext?: string,
  aspectRatio: '16:9' | '9:16' = '16:9'
): Promise<{ image: string, prompt: string }> => {

  // Mapeamento inteligente de modelos (MANDATÓRIO para v7.5.0)
  let activeModel = model;
  if (model === 'gptimage' || model === 'zimage' || model === 'pollinations-gpt' || model === 'pollinations-zimage') {
    activeModel = 'zimage'; // v7.8.4: Restaurado para 'zimage' conforme pedido do usuário
  }

  logApiCost('image', `pollinations-${activeModel}`, 0, { prompt: fullPrompt, aspectRatio });

  // Limpeza do prompt (v7.8.6: Reduzido para 1000 para evitar URLs gigantes)
  const finalPrompt = fullPrompt
    .replace(/(Character|Scene|Location|Style|Strictly|Negative|Identidade|Prompt|Cena|Cenário)[:：]/gi, '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 1000);

  const encodedPrompt = encodeURIComponent(finalPrompt);
  const width = aspectRatio === '9:16' ? 768 : 1024;
  const height = aspectRatio === '9:16' ? 1024 : 768;
  const seed = Math.floor(Math.random() * 9999999);

  // v7.8.7: MOTOR DE BYPASS VIA CANVAS (Anti-Bloqueio / Anti-Failed-to-Fetch)
  const fetchImageViaCanvas = (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      const timeout = setTimeout(() => {
        img.src = "";
        reject(new Error("Timeout carregando imagem via Canvas"));
      }, 30000);

      img.onload = () => {
        clearTimeout(timeout);
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Falha ao obter contexto 2D");
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        } catch (e) {
          reject(e);
        }
      };

      img.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Erro no objeto Image (bloqueio de rede?)"));
      };

      img.src = url;
    });
  };

  // v7.8.9: AJUSTE UNIVERSAL DE CHAVES + FALLBACK TURBO (Sincronia Total)
  const tryGenerateOnce = async (useKey: boolean, useNoLogo: boolean = true, strategy: 'gen' | 'image' | 'p' = 'gen', forceModel?: string): Promise<string> => {
    // v7.8.9: Enviar chave para todos os modelos conforme o código antigo
    const keyParam = (useKey && FLUX_KEY) ? `&key=${FLUX_KEY}` : '';
    const nologoParam = useNoLogo ? '&nologo=true' : '';
    const currentModel = forceModel || activeModel;
    
    let baseUrl = 'https://gen.pollinations.ai/image/';
    if (strategy === 'image') baseUrl = 'https://image.pollinations.ai/prompt/';
    if (strategy === 'p') baseUrl = 'https://pollinations.ai/p/';
    
    const url = `${baseUrl}${encodedPrompt}?model=${currentModel}&width=${width}&height=${height}&seed=${seed}${nologoParam}${keyParam}`;
    console.log(`[Pollinations] Estratégia: ${strategy} | Modelo: ${currentModel} | Key: ${useKey}`);

    try {
        return await fetchImageViaCanvas(url);
    } catch (e: any) {
        console.warn(`[Pollinations] Falha com ${currentModel} na estratégia ${strategy}:`, e.message);
        
        // Se zimage falhar, tenta turbo na mesma estratégia antes de mudar de endpoint
        if (currentModel === 'zimage' && !forceModel) {
            console.log(`[Pollinations] Tentando fallback de zimage -> turbo...`);
            return await tryGenerateOnce(useKey, useNoLogo, strategy, 'turbo');
        }

        // Cascata de Endpoints
        if (strategy === 'gen') return await tryGenerateOnce(useKey, useNoLogo, 'image');
        if (strategy === 'image') return await tryGenerateOnce(useKey, useNoLogo, 'p');
        
        // Cascata de Segurança
        if (useNoLogo) return await tryGenerateOnce(useKey, false, 'gen');
        if (useKey) return await tryGenerateOnce(false, useNoLogo, 'gen');
        
        throw e;
    }
  };

  try {
    const base64 = await tryGenerateOnce(true);
    return { image: base64, prompt: finalPrompt };
  } catch (error: any) {
    console.error("❌ [Pollinations] Erro crítico:", error);
    throw new Error(`Falha definitiva no Pollinations (${activeModel}). Tente recarregar a página.`);
  }
};
