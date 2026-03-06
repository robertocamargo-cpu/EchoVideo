
import { TranscriptionItem } from '../types';

// Utility to write WAV headers
const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

const audioBufferToWav = (buffer: AudioBuffer): Blob => {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArray = new ArrayBuffer(length);
  const view = new DataView(bufferArray);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  // write WAVE header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + buffer.length * numOfChan * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numOfChan, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 2 * numOfChan, true);
  view.setUint16(32, numOfChan * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, buffer.length * numOfChan * 2, true);

  // interleave channels
  for (i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  offset = 44;
  while (pos < buffer.length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][pos]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(offset, sample, true);
      offset += 2;
    }
    pos++;
  }

  return new Blob([view], { type: 'audio/wav' });
};

// Generates a valid silent WAV file for video previews
export const createSilentAudioBlob = (durationSeconds: number): Blob => {
  const sampleRate = 44100;
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = numChannels * bitsPerSample / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = durationSeconds * sampleRate * blockAlign;
  const fileSize = 36 + dataSize;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // file length
  view.setUint32(4, fileSize, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, byteRate, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, blockAlign, true);
  // bits per sample
  view.setUint16(34, bitsPerSample, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, dataSize, true);

  return new Blob([view], { type: 'audio/wav' });
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
      const maxExtension = 15 * sampleRate;
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

    const wavBlob = audioBufferToWav(chunkBuffer);
    const fileName = file.name.replace(/\.[^/.]+$/, "");
    const chunkFile = new File([wavBlob], `${fileName}_part_${partIndex}.wav`, { type: 'audio/wav' });

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
