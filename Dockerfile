# Lugano in anteprima — server completo (API, pianificatore, salvataggi, condivisione, pannello editoriale).
# Node 24 per node:sqlite. I dati costruiti (data/build, public/tiles, public/terrain) sono nel repository.
FROM node:24-slim
WORKDIR /app
ENV CI=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=10000 \
    DB_PATH=/app/data/db/lugano.sqlite \
    NODE_OPTIONS=--max-old-space-size=400
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||10000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
