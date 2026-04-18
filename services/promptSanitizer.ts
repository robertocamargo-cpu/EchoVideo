
/**
 * Global Sanitizer for Image Prompts (EchoVideo)
 * Protocolo Djérriêngui: Eliminação total de ruído técnico, redundância e IDs.
 */

const FORBIDDEN_LABELS = [
  'Subject Archetype:', 'Hair:', 'Face Shape:', 'Face Shape/Eyes:', 'Eyes:', 'Upper:', 'Lower:', 'Vestuário:', 'Calçado:',
  'Structure:', 'Anchors:', 'Materials:', 'Lighting:', 'someone', 'Upper someone:', 'Shoes:', 'someone Eyes:', 'someone-up',
  'Generic -', 'Master Assets:', 'Objects:', 'Visual Integrity:', 'Archetype:', 'Densidade:', '(Densidade', 'Density:',
  'Cabelo/Barba:', 'Rosto:', 'Vestuário Superior:', 'Vestuário Inferior:', 'Calçados:', 'Acessórios:', 'Face:', 'Footwear:', 'Upper Clothing:', 'Lower Clothing:',
  'Fixed Anchors:', 'Structure & Limits:', 'Materials & Textures:', 'Lighting & Color:', 'Skeleton:',
  'MASTER PROMPT', 'SYNCHRONIZATION ENGINE', 'FIELD RULES', 'DIRECTOR\'S RULE', 'Return JSON', 'TranscriptionResponse'
];

const TECHNICAL_ID_REGEX = /\b(char_|prop_|loc_|c|l|p|pro|prop|char|loc)\d+\b/gi;
const DENSITY_CLEAN_REGEX = /\(Densidade\s*\d+\)/gi;

const TRANSLATION_MAP: Record<string, string> = {
  'ar-condicionado': 'air conditioner',
  'mesa': 'table',
  'cadeira': 'chair',
  'homem': 'man',
  'mulher': 'woman',
  'janela': 'window',
  'sala_de_reuniões': 'meeting room',
  'escritório': 'office'
};

const CAMERA_WHITELIST = [
  'Wide shot', 'Close-up', 'Low angle', 'Eye level', 'Bird\'s eye view', 
  'Dutch angle', 'Extreme Close-up', 'High Angle', 'Medium Shot'
];

/**
 * Limpa descrições de personagens e locais removendo rótulos e termos proibidos.
 * Garante que o texto seja plano e descritivo.
 */
export const cleanDescription = (text: string): string => {
  if (!text) return "";
  let clean = text;

  // 1. Remover IDs técnicos (c1, char001, etc.) e rótulos de densidade residuais
  clean = clean.replace(TECHNICAL_ID_REGEX, '');
  clean = clean.replace(DENSITY_CLEAN_REGEX, '');

  // 2. Remover rótulos conhecidos (insensível a maiúsculas)
  FORBIDDEN_LABELS.forEach(label => {
    // Escapar caracteres especiais para evitar SyntaxError em New RegExp
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedLabel, 'gi');
    clean = clean.replace(regex, '');
  });

  // 3. Remover duplicações de frases e frases que começam com "A " ou "An " se forem redundantes
  const sentences = clean.split('.').map(s => s.trim()).filter(Boolean);
  const uniqueSentences = Array.from(new Set(sentences));
  clean = uniqueSentences.join('. ');

  // 4. Tradução básica de segurança (PT -> EN)
  Object.keys(TRANSLATION_MAP).forEach(pt => {
    const regex = new RegExp(`\\b${pt}\\b`, 'gi');
    clean = clean.replace(regex, TRANSLATION_MAP[pt]);
  });

  // 5. Limpeza de pontuação e espaços vazios
  return clean
    .replace(/:\s*:/g, ':')
    .replace(/,\s*,/g, ',')
    .replace(/\.\s*\./g, '.')
    .replace(/^\s*[:,]\s*/, '') // Remove início sujo
    .trim();
};

/**
 * Normaliza o enquadramento de câmera.
 */
export const normalizeCamera = (text: string): string => {
  if (!text) return "Eye level";
  const found = CAMERA_WHITELIST.find(c => text.toLowerCase().includes(c.toLowerCase()));
  return found || "Eye level";
};

/**
 * Sanitiza o apelido (Nickname) removendo prefixos técnicos e garantindo legibilidade.
 */
export const sanitizeNickname = (name: string): string => {
  if (!name) return "";
  // 1. Remover parênteses e conteúdo técnico (ex: char01 (Elon) -> Elon)
  let clean = name.replace(/\(.*\)/g, '').trim();
  // 2. Mantém apenas letras e números, remove prefixos de ID
  clean = clean.replace(/^(char_|prop_|loc_|c|l|p|char|prop|loc|pro)\d+/gi, '').trim();
  // 3. Remove caracteres especiais remanescentes no início/fim
  clean = clean.replace(/^[:\s-]+|[:\s-]+$/g, '').trim();
  // Se sobrar apenas o nome real, removemos espaços extras
  return clean.split(/[:\s]/)[0];
};

/**
 * Constrói o prompt final com estrutura estrita (Protocolo Djérriêngui).
 * Formato: [Style]. [Subject]. [Action]. [Scenario]. [Camera]. [Integrity]
 */
export const buildFinalVisualPrompt = (
  style: string,
  subject: string,
  action: string,
  scenario: string,
  camera: string,
  visualIntegrity: string
): string => {
  // 1. Limpeza Individual
  let cleanSubject = cleanDescription(subject);
  let cleanAction = cleanDescription(action);
  let cleanScenario = cleanDescription(scenario);
  const cleanCamera = normalizeCamera(camera);

  // 2. Blindagem de Action (Remover qualquer menção a IDs que vazaram)
  cleanAction = cleanAction.replace(TECHNICAL_ID_REGEX, '');

  // 3. Montar Partes
  const parts = [
    style,
    cleanSubject,
    cleanAction,
    cleanScenario,
    cleanCamera,
    visualIntegrity
  ].filter(p => p && p.trim().length > 0);

  // 4. Limpeza Final de redundância global
  return parts.join(". ")
    .replace(/\s\s+/g, ' ')
    .replace(/\.\./g, '.')
    .replace(/\.,/g, '.')
    .trim();
};
