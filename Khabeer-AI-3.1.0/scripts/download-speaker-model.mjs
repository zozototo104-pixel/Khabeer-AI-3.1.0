import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const fileName = '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx';
const expectedSha256 = '1a331345f04805badbb495c775a6ddffcdd1a732567d5ec8b3d5749e3c7a5e4b';
const expectedSize = 39_593_761;
const sources = [
  `https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/${fileName}`,
  `https://huggingface.co/csukuangfj/speaker-embedding-models/resolve/main/${fileName}`,
];

const modelDirectory = path.resolve(process.cwd(), 'models');
const destination = path.join(modelDirectory, fileName);
const temporary = `${destination}.download`;

fs.mkdirSync(modelDirectory, { recursive: true });

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function validExistingModel() {
  if (!fs.existsSync(destination)) return false;
  const stat = fs.statSync(destination);
  if (stat.size !== expectedSize) return false;
  return sha256(destination) === expectedSha256;
}

if (validExistingModel()) {
  console.log(`Speaker model already verified: ${destination}`);
  process.exit(0);
}

if (fs.existsSync(temporary)) fs.unlinkSync(temporary);

let lastError;
for (const source of sources) {
  try {
    console.log(`Downloading neural speaker model from ${new URL(source).host} ...`);
    const response = await fetch(source, { redirect: 'follow' });
    if (!response.ok || !response.body) {
      throw new Error(`HTTP_${response.status}`);
    }

    await pipeline(response.body, fs.createWriteStream(temporary, { flags: 'wx' }));

    const downloadedSize = fs.statSync(temporary).size;
    if (downloadedSize !== expectedSize) {
      throw new Error(`MODEL_SIZE_MISMATCH:${downloadedSize}`);
    }

    const downloadedHash = sha256(temporary);
    if (downloadedHash !== expectedSha256) {
      throw new Error(`MODEL_HASH_MISMATCH:${downloadedHash}`);
    }

    fs.renameSync(temporary, destination);
    console.log(`Verified ERes2Net speaker model installed: ${destination}`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    console.warn(`Speaker model source failed: ${source}`);
    console.warn(error instanceof Error ? error.message : String(error));
  }
}

throw new Error(`MODEL_DOWNLOAD_FAILED:${lastError instanceof Error ? lastError.message : String(lastError)}`);
