# Lugano in anteprima — server completo (API, pianificatore, salvataggi, condivisione, pannello editoriale).
# Node 24: node:sqlite e TypeScript eseguito direttamente (rimozione dei tipi), senza compilatore a runtime.
# I dati costruiti (data/build, public/tiles, public/terrain, public/glyphs) sono nel repository.

# --- 1. compilazione dell'interfaccia -------------------------------------------------
FROM node:24-slim AS build
WORKDIR /app
ENV CI=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.ts tsconfig.json ./
COPY src ./src
COPY public ./public
# Vite copia anche tile, terreno e glifi in dist: al server bastano quelli di public/
RUN npm run build && rm -rf dist/tiles dist/terrain dist/glyphs

# --- 2. immagine di esecuzione -------------------------------------------------------
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=10000 \
    DB_PATH=/app/data/db/lugano.sqlite \
    NODE_OPTIONS=--max-old-space-size=400
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY src/server ./src/server
COPY src/shared ./src/shared
COPY data/geo ./data/geo
COPY data/build/catalog.json data/build/explore.json data/build/addresses.json data/build/graph-walk.json data/build/transit.json ./data/build/
COPY public/tiles ./public/tiles
COPY public/terrain ./public/terrain
COPY public/glyphs ./public/glyphs
COPY --from=build /app/public/vendor ./public/vendor
RUN mkdir -p data/db && chown -R node:node data/db
USER node
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||10000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server/index.ts"]
