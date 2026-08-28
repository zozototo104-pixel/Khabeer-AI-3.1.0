#!/bin/sh
set -eu

PREFIX="${NEMO_SPEECH_PREFIX:-/opt/nemo}"
MODEL_DIR="$PREFIX/models"
MODEL="$MODEL_DIR/sortformer-v2.q8_0.gguf"
SRC=/tmp/nemo-speech-src
VENV=/tmp/nemo-speech-convert

rm -rf "$SRC" "$VENV"
git clone --depth 1 --recurse-submodules https://github.com/NVIDIA/NeMo-Speech.cpp.git "$SRC"

# Build only the CPU diarization component. This avoids shipping the much
# larger ASR/TTS server stack into the production image.
cd "$SRC"
scripts/configure.sh cpu-diar
cmake --build --preset cpu-diar -j2
# Component presets write the unified CLI to build/<preset>/bin. Copy the
# minimal runtime explicitly because component builds do not guarantee an
# install target/layout across releases.
mkdir -p "$PREFIX/bin"
cp "build/cpu-diar/bin/nemo-speech" "$PREFIX/bin/nemo-speech"
chmod 0755 "$PREFIX/bin/nemo-speech"

# NVIDIA's official converter is the supported path from the public NeMo
# Sortformer checkpoint to the GGUF consumed by NeMo-Speech.cpp.
python3 -m venv "$VENV"
"$VENV/bin/pip" install --no-cache-dir --upgrade pip
if [ -f requirements-convert.txt ]; then
  "$VENV/bin/pip" install --no-cache-dir -r requirements-convert.txt
elif [ -f requirements.txt ]; then
  "$VENV/bin/pip" install --no-cache-dir -r requirements.txt
else
  "$VENV/bin/pip" install --no-cache-dir huggingface-hub numpy safetensors sentencepiece
fi
mkdir -p "$MODEL_DIR"
"$VENV/bin/python" convert_model.py nvidia/diar_streaming_sortformer_4spk-v2 \
  --outfile "$MODEL" --outtype q8_0

"$PREFIX/bin/nemo-speech" model info "$MODEL"
rm -rf "$SRC" "$VENV"
