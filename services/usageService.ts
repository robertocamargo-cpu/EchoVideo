import { getUsageFromDB, incrementUsageInDB, supabase } from "./storageService";

export interface DailyUsage {
  date: string;
  text: number;
  image: number;
  external: number;
  costUSD: number;
  costBRL: number;
}

// Now purely a bridge to the DB.
export const getDailyUsage = (): DailyUsage => {
  return {
    date: new Date().toISOString().split('T')[0],
    text: 0,
    image: 0,
    external: 0,
    costUSD: 0,
    costBRL: 0
  };
};

export const fetchRealUsage = async (): Promise<DailyUsage> => {
  return await getUsageFromDB();
}

/**
 * Busca cotação USD -> BRL
 */
export const getExchangeRate = async (): Promise<number> => {
  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const data = await response.json();
    return data.rates.BRL || 5.0; // Fallback para 5.0 se falhar
  } catch (error) {
    console.warn("Erro ao buscar cotação de câmbio (usando fallback 5.80):", error);
    return 5.80; // Fallback seguro e realista
  }
}

/**
 * Registra um uso de API com custo associado
 */
export const logApiCost = async (type: 'text' | 'image' | 'video' | 'ia_effects', model: string, costUSD: number, metadata: any = {}) => {
  try {
    const rate = await getExchangeRate();
    const costBRL = costUSD * rate;

    // Salvar no banco (tabela granular de logs)
    const { error } = await supabase
      .from('api_usage_log')
      .insert([{
        operation_type: type,
        model_used: model,
        cost_usd: costUSD,
        metadata: { ...metadata, rate_used: rate, cost_brl: costBRL }
      }]);

    if (error) {
      console.warn("Tabela api_usage_log não encontrada ou erro:", error.message);
    }

    // Incrementar o acumulado diário
    await incrementUsageInDB(
      type === 'text' ? 'text' : (type === 'image' ? 'image' : 'external'),
      costUSD,
      costBRL
    );

    window.dispatchEvent(new Event('usageUpdated'));
  } catch (error) {
    console.error("Erro ao logar custo de API:", error);
  }
}

export const incrementUsage = async (type: 'text' | 'image' | 'external', costUSD: number = 0) => {
  const rate = await getExchangeRate();
  await incrementUsageInDB(type, costUSD, costUSD * rate);
  window.dispatchEvent(new Event('usageUpdated'));
};
