
/**
 * Global Sanitizer for Image Prompts (EchoVideo)
 * Protocolo Djérriêngui: Eliminação total de ruído técnico, redundância e IDs.
 */

const FORBIDDEN_LABELS = [
  'Subject Archetype:', 'Hair:', 'Face Shape:', 'Face Shape/Eyes:', 'Eyes:', 'Upper:', 'Lower:', 'Vestuário:', 'Calçado:',
  'Structure:', 'Anchors:', 'Materials:', 'Lighting:', 'someone', 'Upper someone:', 'Shoes:', 'someone Eyes:', 'someone-up',
  'Generic -', 'Master Assets:', 'Objects:', 'Visual Integrity:', 'Archetype:'
];

const TECHNICAL_ID_REGEX = /\b([c|l|p]\d+|char\d+|loc\d+|prop\d+)\b/gi;

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

  // 1. Remover IDs técnicos (c1, char001, etc.)
  clean = clean.replace(TECHNICAL_ID_REGEX, '');

  // 2. Remover rótulos conhecidos (insensível a maiúsculas)
  FORBIDDEN_LABELS.forEach(label => {
    const regex = new RegExp(label, 'gi');
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
  // Mantém apenas letras e números, remove prefixos de ID
  let clean = name.replace(/^(char_|prop_|loc_|c|l|p)\d+/gi, '').trim();
  // Se sobrar apenas o nome real (ex: "Elon Musk"), removemos espaços extras
  return clean.split(/[:\s]/)[0]; // Pega a primeira palavra se houver sujeira
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

  // 2. Blindagem de Subject (Evitar: "Jerry: Jerry is...")
  // Se o subject contém ":", pegamos o que vem depois para evitar o rótulo redundante
  if (cleanSubject.includes(':')) {
    cleanSubject = cleanSubject.split(':').slice(1).join(':').trim();
  }

  // 3. Blindagem de Action (Remover qualquer menção a IDs que vazaram)
  cleanAction = cleanAction.replace(TECHNICAL_ID_REGEX, '');

  // 4. Montar Partes
  const parts = [
    style,
    cleanSubject,
    cleanAction,
    cleanScenario,
    cleanCamera,
    visualIntegrity
  ].filter(p => p && p.trim().length > 0);

  // 5. Limpeza Final de redundância global
  return parts.join(". ")
    .replace(/\s\s+/g, ' ')
    .replace(/\.\./g, '.')
    .replace(/\.,/g, '.')
    .trim();
};
