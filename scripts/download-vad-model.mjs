import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const fileName = 'silero_vad.onnx';
const source = `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${fileName}`;
const modelDirectory = path.resolve(process.cwd(), 'models');
const destination = path.join(modelDirectory, fileName);
const temporary = `${destination}.download`;

fs.mkdirSync(modelDirectory, { recursive: true });

function validExistingModel() {
  if (!fs.existsSync(destination)) return false;
  const stat = fs.statSync(destination);
  return stat.isFile() && stat.size > 500_000;
}

if (validExistingModel()) {
  console.log(`Silero VAD model already present: ${destination}`);
  process.exit(0);
}

if (fs.existsSync(temporary)) fs.unlinkSync(temporary);

const response = await fetch(source, { redirect: 'follow' });
if (!response.ok || !response.body) {
  throw new Error(`VAD_MODEL_DOWNLOAD_FAILED:HTTP_${response.status}`);
}

await pipeline(response.body, fs.createWriteStream(temporary, { flags: 'wx' }));
const stat = fs.statSync(temporary);
if (!stat.isFile() || stat.size <= 500_000) {
  fs.unlinkSync(temporary);
  throw new Error(`VAD_MODEL_INVALID_SIZE:${stat.size}`);
}

fs.renameSync(temporary, destination);
console.log(`Silero VAD model installed: ${destination} (${stat.size} bytes)`);
