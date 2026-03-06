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

const FLUX_KEY = (import.meta as any).env.VITE_FLUX_KEY || '';

export const generatePollinationsImage = async (
  fullPrompt: string,
  model: string = 'flux',
  _unusedContext?: string,
  aspectRatio: '16:9' | '9:16' = '16:9'
): Promise<{ image: string, prompt: string }> => {

  logApiCost('image', `pollinations-${model}`, 0, { prompt: fullPrompt, aspectRatio });

  // Limpeza do prompt
  const finalPrompt = fullPrompt
    .replace(/(Character|Scene|Location|Style|Strictly|Negative|Identidade|Prompt|Cena|Cenário)[:：]/gi, '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 1500);

  const encodedPrompt = encodeURIComponent(finalPrompt);
  const width = aspectRatio === '9:16' ? 768 : 1024;
  const height = aspectRatio === '9:16' ? 1024 : 768;
  const seed = Math.floor(Math.random() * 9999999);

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  // URL: https://gen.pollinations.ai/image/{prompt}?model={model}&key={key}&width=...&height=...&seed=...
  const tryGenerateOnce = async (useKey: boolean): Promise<string> => {
    const keyParam = (useKey && FLUX_KEY) ? `&key=${FLUX_KEY}` : '';
    // Pollinations images are generated via: https://gen.pollinations.ai/image/{prompt}?model={model}&...
    const url = `https://gen.pollinations.ai/image/${encodedPrompt}?model=${model}&width=${width}&height=${height}&seed=${seed}&nologo=true${keyParam}`;
    console.log(`[Pollinations] Gerando (${model}) — key: ${useKey} | ${url.substring(0, 120)}...`);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (blob.size < 1000) throw new Error("Imagem inválida (tamanho < 1KB)");
    return await blobToBase64(blob);
  };

  const MAX_RETRIES = 3;
  const RETRY_DELAY = 5000;

  const tryWithRetry = async (useKey: boolean): Promise<string> => {
    let lastError: any;
    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        return await tryGenerateOnce(useKey);
      } catch (e: any) {
        lastError = e;
        console.warn(`[Pollinations] Tentativa ${i + 1}/${MAX_RETRIES} falhou: ${e.message}`);
        if (i < MAX_RETRIES - 1) {
          console.log(`[Pollinations] Aguardando ${RETRY_DELAY / 1000}s para retentar...`);
          await delay(RETRY_DELAY);
        }
      }
    }
    throw lastError;
  };

  try {
    // Tentativa 1: com chave (com retentativa)
    return { image: await tryWithRetry(true), prompt: finalPrompt };
  } catch (e1) {
    console.warn(`[Pollinations] Falha definitiva com chave (após retentativas):`, e1, '— tentando sem chave...');
    try {
      // Tentativa 2: sem chave (fallback com retentativa)
      return { image: await tryWithRetry(false), prompt: finalPrompt };
    } catch (e2) {
      throw new Error(`Pollinations indisponível após várias tentativas: ${(e2 as Error).message}`);
    }
  }
};
