# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates libgomp1 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run lint \
  && npm run test:unit \
  && npm run speaker:download-model \
  && npm run speaker:verify-model \
  && npm run build

# Official NVIDIA NeMo-Speech.cpp CPU diarization runtime. The compiler and
# conversion toolchain stay in this build stage, not in production.
FROM node:22-bookworm-slim AS sortformer
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git build-essential ninja-build pkg-config libsentencepiece-dev python3 python3-venv python3-pip \
  && curl -fsSL https://github.com/Kitware/CMake/releases/download/v4.1.1/cmake-4.1.1-linux-x86_64.tar.gz -o /tmp/cmake.tar.gz \
  && tar -xzf /tmp/cmake.tar.gz -C /usr/local --strip-components=1 \
  && cmake --version \
  && rm -f /tmp/cmake.tar.gz \
  && rm -rf /var/lib/apt/lists/*
COPY scripts/install-sortformer.sh ./scripts/install-sortformer.sh
RUN sh ./scripts/install-sortformer.sh

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates libgomp1 libgl1 libglib2.0-0 libsentencepiece0 poppler-utils tesseract-ocr tesseract-ocr-ara tesseract-ocr-eng python3 python3-venv python3-pip \
  && rm -rf /var/lib/apt/lists/*

# Docling provides production-grade PDF layout/reading-order reconstruction.
# RapidOCR/PP-OCR handles Arabic OCR locally; models are prefetched at image
# build time so production requests never depend on downloading model files.
RUN python3 -m venv /opt/docling \
  && /opt/docling/bin/pip install --no-cache-dir --upgrade pip \
  && /opt/docling/bin/pip install --no-cache-dir "docling-slim[format-pdf,models-local,feat-ocr-rapidocr,cli]" scipy --extra-index-url https://download.pytorch.org/whl/cpu \
  && mkdir -p /opt/docling-models \
  && /opt/docling/bin/docling-tools models download layout tableformer rapidocr --rapidocr-backend-lang onnxruntime:arabic -o /opt/docling-models

ENV DOCLING_ARTIFACTS_PATH=/opt/docling-models

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force

COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/models ./models
COPY --from=build --chown=node:node /app/migrations ./migrations
COPY --from=sortformer /opt/nemo /opt/nemo
ENV NEMO_SPEECH_BIN=/opt/nemo/bin/nemo-speech \
    SORTFORMER_MODEL=/opt/nemo/models/sortformer-v2.q8_0.gguf \
    LD_LIBRARY_PATH=/opt/nemo/lib

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["sh", "-c", "npm run db:migrate:prod && node dist/server.cjs"]
