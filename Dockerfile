# TerraNova – single container (FastAPI backend + built React/Cesium frontend).
# Used for Hugging Face Spaces (Docker SDK, port 7860) and any container host.

# ---- frontend build ----
FROM node:20-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- runtime ----
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=7860
# Hugging Face Spaces run containers as uid 1000
RUN useradd -m -u 1000 app
WORKDIR /app
# Runtime dependencies only (the preprocessing extras in requirements.txt are not needed to serve)
RUN pip install --no-cache-dir "fastapi>=0.110" "uvicorn[standard]>=0.29" "numpy>=1.26" "scipy>=1.12" \
    "pillow>=10" "requests>=2.31" "global-land-mask>=1.0"
COPY backend/ backend/
COPY data/processed/ data/processed/
COPY --from=web /web/dist frontend/dist
RUN mkdir -p data/cache/live && chown -R app:app /app
USER app
WORKDIR /app/backend
EXPOSE 7860
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
