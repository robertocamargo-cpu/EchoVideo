

export interface ImageHistoryItem {
  id: string;
  url: string;
  provider: 'google' | 'pollinations' | 'imported';
  timestamp: number;
  prompt: string;
}

export interface StyleExample {
  styleId: string;
  providerId?: string; // Novo campo para suporte multi-IA
  imageUrl: string;
  prompt: string;
  timestamp: number;
}

export interface SRTSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionItem {
  filename: string;
  startTimestamp: string;
  endTimestamp: string;
  startSeconds: number;
  endSeconds: number;
  duration: number;
  text: string;
  imagePrompt: string;
  visualSummary?: string;

  // Novos campos estruturados de prompt
  medium?: string;
  subject?: string;
  action?: string;
  cenario?: string;
  props?: string;
  symbolism?: string;
  style?: string;
  camera?: string;
  negative?: string;
  animation?: string;
  animationRationale?: string;

  googleImageUrl?: string;
  pollinationsImageUrl?: string;
  importedImageUrl?: string;
  importedVideoUrl?: string;

  imageCost?: number;
  googleError?: string;
  pollinationsError?: string;

  imageHistory?: ImageHistoryItem[];
  selectedProvider: 'google-nano' | 'google-imagen' | 'pollinations' | 'pollinations-zimage' | 'imported';

  isGeneratingGoogle?: boolean;
  isGeneratingPollinations?: boolean;

  imageUrl?: string;

  // Added properties for character, location and prop mapping
  characterIds?: string[];
  locationIds?: string[];
  propIds?: string[];

  // Motion effect selection
  selectedMotionEffect?: MotionEffect;

  // Original SRT segments for timing preservation
  srtSegments?: SRTSegment[];
}

export interface MasterAsset {
  id: string;
  name: string; // Fictional name for prompts
  realName?: string; // Real name for discovery
  description: string;
  imageUrl?: string;
  isGeneratingGoogle?: boolean;
  isGeneratingPollinations?: boolean;
  provider?: 'google' | 'pollinations';
}

export interface Project {
  id: string;
  name: string;
  date: string;
  audioUrl?: string;
  items: TranscriptionItem[];
  itemsCount?: number; // Contador de cenas para a listagem
  projectStyle?: string;
  image_style_name?: string;
  context?: string;
  characters?: MasterAsset[];
  locations?: MasterAsset[];
  props?: MasterAsset[];
  customStylePrompt?: string;
  updatedAt?: string;
  preferredImageModel?: 'google-imagen' | 'pollinations-flux' | 'pollinations-zimage' | 'pollinations-turbo';
}

export interface TranscriptionResponse {
  items: TranscriptionItem[];
  englishContext?: string;
  detectedCharacters?: MasterAsset[];
  detectedLocations?: MasterAsset[];
  detectedProps?: MasterAsset[];
  rawSrt?: string;
}

export interface ImageStyleOption {
  id: string;
  label: string;
  prompt: string;
}

export interface SubtitleStyleOption {
  id: string;
  label: string;
  maxWordsPerLine: number;
  maxCharsPerLine: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  textColor: string;
  strokeColor: string;
  strokeWidth: number; // In percentage of font size
  shadowColor: string;
  shadowBlur: number;
  shadowOpacity: number;
  shadowDistance: number;
  shadowAngle: number;
  padding: number;
  yPosition: number; // Vertical percentage 0-100
  isBold: boolean;
  isItalic: boolean;
  textCasing: 'uppercase' | 'sentence' | 'title';
}

export interface AppSettings {
  transcriptionPrompt: string;
  effectsPrompt: string;
  titlesPrompt: string;
  items: ImageStyleOption[];
  subtitleStyles: SubtitleStyleOption[];
  stickmanStyle: string;
  disneyStyle: string;
  audioChunkDuration: number;
  aspectRatio: '16:9' | '9:16';
  imageGenerationStrategy: 'gemini-preferred' | 'pollinations-only';
  preferredImageModel?: 'google-imagen' | 'pollinations-flux' | 'pollinations-zimage' | 'pollinations-turbo';
}

export interface ViralTitle {
  title: string;
  explanation: string;
  viralityScore: number;
  thumbnailVisual: string;
  thumbnailText: string;
  abWinnerReason?: string;
}

export enum ProcessingStatus {
  IDLE = 'IDLE',
  READING_FILE = 'READING_FILE',
  TRANSCRIBING = 'TRANSCRIBING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export enum TransitionType {
  FADE_IN_OUT = 'fade_in_out',
  DISSOLVE = 'dissolve',
  CUTAWAY = 'cutaway',
  MATCH_CUT = 'match_cut',
  SPEED_RAMP = 'speed_ramp',
  SLIDE_MINIMAL = 'slide_minimal',
  GLITCH_2F = 'glitch_2f'
}

export interface MotionEffect {
  id: string;
  name: string;
  description: string;
  instruction: string;
}

export type RenderEngine = 'browser' | 'ffmpeg';