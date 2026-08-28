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
# Component presets build a dynamically-linked unified CLI. Preserve both the
# executable and every shared library produced by the preset; copying only the
# binary makes the runtime fail with missing libnemo_speech_*.so dependencies.
mkdir -p "$PREFIX/bin" "$PREFIX/lib"
cp "build/cpu-diar/bin/nemo-speech" "$PREFIX/bin/nemo-speech"
# Do not restrict the dependency scan to build/cpu-diar: ggml and other
# transitive libraries may be emitted by submodule build trees outside that
# directory. Copy the complete shared-library closure produced by this build,
# including versioned files such as libggml.so.0, and recreate SONAME symlinks.
find "$SRC" -type f \( -name '*.so' -o -name '*.so.*' \) -exec cp -L {} "$PREFIX/lib/" \;
for lib in "$PREFIX"/lib/*.so.*; do
  [ -e "$lib" ] || continue
  base=$(basename "$lib")
  stem=${base%%.so.*}.so
  ln -sf "$base" "$PREFIX/lib/$stem"
done
chmod 0755 "$PREFIX/bin/nemo-speech"
export LD_LIBRARY_PATH="$PREFIX/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

# Fail the image build here if any runtime dependency is still unresolved.
missing=$(ldd "$PREFIX/bin/nemo-speech" | grep 'not found' || true)
if [ -n "$missing" ]; then
  echo "Unresolved NeMo-Speech runtime libraries:" >&2
  echo "$missing" >&2
  exit 1
fi

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
