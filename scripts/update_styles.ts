import { db } from '../services/firebaseClient';
import { collection, doc, setDoc, writeBatch } from 'firebase/firestore';

const newStyles = [
  {
    id: 'disney',
    label: 'Disney / Pixar (3D)',
    prompt: '3D animated feature film style, stylized character design, vibrant colors, warm soft lighting, subsurface scattering, smooth textures, clean shapes, polished cinematic render, high detail.',
    display_order: 0
  },
  {
    id: 'ultrarealistic',
    label: 'Ultra-realista',
    prompt: 'Ultra-realistic photography, 35mm lens, shallow depth of field, highly detailed skin texture, natural lighting, soft shadows, realistic colors, photographic realism, high detail.',
    display_order: 1
  },
  {
    id: 'cinematic',
    label: 'Cinemático Dramático',
    prompt: 'Cinematic film still, anamorphic lens look, teal and orange color grading, volumetric haze, rim lighting, controlled contrast, shallow depth of field, high production value, detailed image.',
    display_order: 2
  },
  {
    id: 'papercut',
    label: 'Paper Cut (Arte em Papel)',
    prompt: 'Layered paper cut art, multi-layered cutout shapes, handcrafted diorama look, visible paper texture, soft diffuse lighting, pastel color palette, clean edges, strong depth separation.',
    display_order: 3
  },
  {
    id: 'sketch',
    label: 'Sketch (Lápis)',
    prompt: 'Traditional graphite pencil sketch, monochromatic greyscale, visible paper grain, cross-hatching shading, rough hand-drawn strokes, unfinished edges, natural sketch texture.',
    display_order: 4
  },
  {
    id: 'noir',
    label: 'Noir Graphic Novel',
    prompt: 'Noir graphic novel style, stark high-contrast black and white, deep shadows, heavy ink outlines, strong chiaroscuro, gritty texture, minimal selective yellow accent only, black, grey and white dominant palette, no red accents.',
    display_order: 5
  },
  {
    id: 'stickman',
    label: 'Stickman (Palito)',
    prompt: 'Minimalist stickman illustration, thin black lines, flat simple shapes, light blue background, subtle light purple accents, clean composition, no shadows, no 3D, whiteboard explainer look.',
    display_order: 6
  },
  {
    id: 'goldenage',
    label: 'Golden Age (Vintage 40/50)',
    prompt: 'Vintage Golden Age comic style, Ben-Day dots, CMYK offset print look, aged yellowed paper texture, retro 1940s to 1950s aesthetic, bold primary colors, slightly worn print finish, simple backgrounds.',
    display_order: 7
  },
  {
    id: 'hqcartoon',
    label: 'HQ Cartoon',
    prompt: 'Western comic book style, bold black outlines, vibrant flat colors, dynamic cel shading, halftone texture, expressive character design, detailed inking, clean graphic finish, 1990s animation influence.',
    display_order: 8
  },
  {
    id: 'ligneclaire',
    label: 'Ligne Claire (Franco-Belga)',
    prompt: 'Ligne Claire comic style, clear line art, uniform line weight, flat vivid colors, no hatching, clean backgrounds, minimal shadows, precise architectural details.',
    display_order: 9
  }
];

async function updateStyles() {
  console.log('🚀 Iniciando atualização de estilos de imagem no Firestore...');
  
  try {
    const batch = writeBatch(db);
    const stylesCollection = collection(db, 'image_style_prompts');

    newStyles.forEach(style => {
      const docRef = doc(stylesCollection, style.id);
      batch.set(docRef, {
        id: style.id,
        label: style.label,
        prompt: style.prompt,
        display_order: style.display_order,
        is_active: true,
        updated_at: new Date().toISOString()
      }, { merge: true });
      console.log(`✅ Preparado: ${style.label}`);
    });

    await batch.commit();
    console.log('\n✨ SUCESSO! Todos os 10 estilos foram atualizados no banco de dados.');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERRO durante a atualização:', error);
    process.exit(1);
  }
}

updateStyles();
