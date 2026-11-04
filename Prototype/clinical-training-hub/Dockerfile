FROM node:22-bookworm-slim AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
RUN npm run build

FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend ./backend
COPY scripts ./scripts
COPY demo ./demo
COPY migrations ./migrations
COPY alembic.ini ./
COPY --from=frontend /app/dist ./dist
RUN useradd --create-home hub && mkdir -p /app/data && chown -R hub:hub /app
USER hub
ENV DATA_DIR=/app/data
EXPOSE 8000
CMD ["sh", "-c", "python -m alembic upgrade head && exec python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000"]
