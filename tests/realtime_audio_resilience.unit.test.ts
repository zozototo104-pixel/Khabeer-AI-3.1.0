import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const voice = fs.readFileSync('src/components/VoiceChat.tsx', 'utf8');

test('microphone frames are gated during AI playback until sustained barge-in is confirmed', () => {
  assert.match(voice, /bargeInConfirmedRef/);
  assert.match(voice, /micPreRollRef\.current\.push\(base64\)/);
  assert.match(voice, /if \(bargeInConfirmedRef\.current\)/);
  assert.doesNotMatch(voice, /Zero-latency Immediate Audio Dispatch/);
});

test('playback uses adaptive jitter buffer and unity output gain', () => {
  assert.match(voice, /const queuedAudioMs = audioQueueRef\.current\.reduce/);
  assert.match(voice, /const targetBufferMs = recoveringFromStarvation/);
  assert.match(voice, /\[JITTER_BUFFER_TIMEOUT\]/);
  assert.match(voice, /playbackWarmupReadyRef/);
  assert.match(voice, /gainNode\.gain\.value = 1\.0/);
});
