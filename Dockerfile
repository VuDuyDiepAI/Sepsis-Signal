FROM node:22-alpine AS web
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
WORKDIR /app
COPY requirements.txt requirements-api.txt ./
RUN pip install --no-cache-dir -r requirements-api.txt && python -c "from sqlalchemy import create_engine; from fastapi import FastAPI; import uvicorn; assert callable(uvicorn.run)"
COPY backend/ backend/
COPY scripts/ scripts/
COPY src/ src/
COPY artifacts/ artifacts/
COPY frontend/src/data/ frontend/src/data/
COPY --from=web /build/frontend/dist/ frontend/dist/
RUN python -c "from backend.app.scoring import bundle; bundle()"
RUN useradd --create-home --uid 10001 sepsis && mkdir -p data && chown sepsis:sepsis data
USER sepsis
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "backend.app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
