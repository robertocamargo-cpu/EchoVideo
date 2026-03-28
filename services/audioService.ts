import { TranscriptionItem } from '../types';
import { Mp3Encoder } from '@breezystack/lamejs';

// Fix for lamejs internal reference to MPEGMode in some module environments
if (typeof (window as any).MPEGMode === 'undefined') {
  (window as any).MPEGMode = {
    STEREO: 0,
    JOINT_STEREO: 1,
    DUAL_CHANNEL: 2,
    MONO: 3,
    NOT_SET: 4
  };
}

// Utility to write WAV headers
const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

export const audioBufferToMp3 = (buffer: AudioBuffer): Blob => {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const mp3encoder = new Mp3Encoder(channels, sampleRate, 128);
  const mp3Data = [];

  const samplesLeft = buffer.getChannelData(0);
  const samplesRight = channels > 1 ? buffer.getChannelData(1) : samplesLeft;

  const floatTo16Bit = (input: Float32Array) => {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  };

  const left16 = floatTo16Bit(samplesLeft);
  const right16 = floatTo16Bit(samplesRight);

  const sampleBlockSize = 1152;
  for (let i = 0; i < left16.length; i += sampleBlockSize) {
    const leftChunk = left16.subarray(i, i + sampleBlockSize);
    const rightChunk = right16.subarray(i, i + sampleBlockSize);
    const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
    if (mp3buf.length > 0) {
      mp3Data.push(new Int8Array(mp3buf));
    }
  }

  const flush = mp3encoder.flush();
  if (flush.length > 0) {
    mp3Data.push(new Int8Array(flush));
  }

  return new Blob(mp3Data, { type: 'audio/mpeg' });
};

// Generates a valid silent MP3 file for video previews
export const createSilentAudioBlob = (durationSeconds: number): Blob => {
  const sampleRate = 44100;
  const offlineCtx = new OfflineAudioContext(1, sampleRate * durationSeconds, sampleRate);
  const buffer = offlineCtx.createBuffer(1, sampleRate * durationSeconds, sampleRate);
  // Buffer is already silent (filled with zeros)
  return audioBufferToMp3(buffer);
};

export const getAudioDuration = async (file: File): Promise<number> => {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      window.URL.revokeObjectURL(audio.src);
      resolve(audio.duration);
    };
    audio.onerror = reject;
    audio.src = URL.createObjectURL(file);
  });
};

// Helper to find silence/low amplitude to avoid cutting mid-sentence
const findSilence = (channelData: Float32Array, startIndex: number, sampleRate: number): number => {
  const windowSize = Math.floor(sampleRate * 0.1); // 100ms window
  const threshold = 0.02; // Silence threshold (2% amplitude)
  const maxSearchSamples = sampleRate * 15; // Search up to 15s instead of 60s for tighter chunks

  let currentIndex = startIndex;
  const limit = Math.min(channelData.length, startIndex + maxSearchSamples);

  while (currentIndex < limit) {
    let sum = 0;
    for (let i = 0; i < windowSize && (currentIndex + i) < limit; i++) {
      sum += channelData[currentIndex + i] * channelData[currentIndex + i];
    }
    const rms = Math.sqrt(sum / windowSize);

    if (rms < threshold) {
      return currentIndex + Math.floor(windowSize / 2);
    }

    currentIndex += windowSize;
  }

  return startIndex;
};

export interface AudioChunk {
  file: File;
  startSeconds: number;
  durationSeconds: number;
}

export const splitAudioFile = async (file: File, targetChunkDurationSecs: number = 60): Promise<AudioChunk[]> => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const totalDurationSamples = audioBuffer.length;
  const chunks: AudioChunk[] = [];
  const sampleRate = audioBuffer.sampleRate;
  const numberOfChannels = audioBuffer.numberOfChannels;

  let startSample = 0;
  let partIndex = 1;

  const primaryChannelData = audioBuffer.getChannelData(0);

  while (startSample < totalDurationSamples) {
    const targetEndSample = startSample + (targetChunkDurationSecs * sampleRate);
    let actualEndSample = targetEndSample;

    if (targetEndSample < totalDurationSamples) {
      actualEndSample = findSilence(primaryChannelData, targetEndSample, sampleRate);
      const maxExtension = 10 * sampleRate;
      if (actualEndSample > targetEndSample + maxExtension) {
        actualEndSample = targetEndSample;
      }
    } else {
      actualEndSample = totalDurationSamples;
    }

    const frameCount = actualEndSample - startSample;
    const chunkBuffer = audioContext.createBuffer(numberOfChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numberOfChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      const chunkChannelData = chunkBuffer.getChannelData(channel);

      if (startSample < channelData.length) {
        const end = Math.min(startSample + frameCount, channelData.length);
        chunkChannelData.set(channelData.subarray(startSample, end));
      }
    }

    const mp3Blob = audioBufferToMp3(chunkBuffer);
    const fileName = file.name.replace(/\.[^/.]+$/, "");
    const chunkFile = new File([mp3Blob], `${fileName}_part_${partIndex}.mp3`, { type: 'audio/mpeg' });

    chunks.push({
      file: chunkFile,
      startSeconds: startSample / sampleRate,
      durationSeconds: frameCount / sampleRate
    });

    startSample = actualEndSample;
    partIndex++;
  }

  audioContext.close();
  return chunks;
};
