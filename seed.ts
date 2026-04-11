import { saveImageStylePromptsBatch, saveSubtitlePresetsBatch, saveMotionEffectsBatch } from './services/storageService';
import { DEFAULT_SETTINGS } from './components/SettingsModal';

export const seedDatabase = async () => {
  console.log('[SEED] Iniciando seed...');
  
  await saveImageStylePromptsBatch(DEFAULT_SETTINGS.items);
  console.log('[SEED] Estilos de Imagem inseridos.');

  await saveSubtitlePresetsBatch(DEFAULT_SETTINGS.subtitleStyles);
  console.log('[SEED] Legendas inseridas.');

  const motionEffects = [
    {
      id: 'effect_1',
      name: 'Dynamic Zoom-In Drift',
      description: 'Esta versão intensifica a imersão. Ao aumentar a variação de escala de 1.12 para 1.22, cria-se um "mergulho" progressivo no assunto central.',
      instruction: 'Linearly increase the image scale from 1.12 to 1.22 while shifting the horizontal axis based on the direction tag: for move:right shift from -3% to +3% or for move:left shift from +3% to -3%, keeping the vertical axis centered throughout the scene duration.'
    },
    {
      id: 'effect_2',
      name: 'Contextual Zoom-Out Reveal',
      description: 'Ideal para concluir um segmento narrativo ou revelar o ambiente mais amplo. O zoom out constante abre a imagem para revelar o contexto.',
      instruction: 'Linearly decrease the image scale from 1.22 to 1.12 while shifting the horizontal axis based on the direction tag: for move:right shift from -3% to +3% or for move:left shift from +3% to -3%, ensuring the movement remains subtle and the vertical axis stays fixed at the center.'
    },
    {
      id: 'effect_3',
      name: 'Cinematic Dolly Slide',
      description: 'Simula uma câmera profissional movendo-se em um trilho físico (dolly), ideal para paisagens ou grandes grupos.',
      instruction: 'Linearly increase the image scale from 1.16 to 1.20. While maintaining a relatively tight vertical margin, perform a continuous linear horizontal shift based on the direction tag: for move:right from -6% to +6% or for move:left from +6% to -6%. The vertical axis should shift very slightly from -1% to +1% to ensure no part of the frame remains strictly static.'
    },
    {
      id: 'effect_4',
      name: 'Elegant Diagonal Lift',
      description: 'Adiciona sofisticação a fotos de arquitetura, retratos ou objetos altos, explorando a imagem diagonalmente.',
      instruction: 'Linearly decrease the image scale from 1.20 to 1.15 while executing a linear diagonal shift by moving the vertical axis from -3% to +3% (upward) and simultaneously shifting the horizontal axis based on the direction tag: for move:right-up shift from -3% to +3% or for move:left-down shift from +3% to -3%.'
    },
    {
      id: 'effect_5',
      name: 'Fluid Descending Sweep',
      description: 'Cria uma sensação observacional enquanto a câmera "escaneia" a imagem de cima para baixo, guiando o olhar.',
      instruction: 'Linearly increase the image scale from 1.15 to 1.20 to ensure dynamic focus. Perform a linear diagonal movement by shifting the vertical axis from +3% to -3% (downward) while simultaneously moving the horizontal axis based on the direction tag: for move:right-down shift from -3% to +3% or for move:left-down shift from +3% to -3%.'
    }
  ];

  await saveMotionEffectsBatch(motionEffects);
  console.log('[SEED] Motion Effects inseridos. Seed Completo!');
};
