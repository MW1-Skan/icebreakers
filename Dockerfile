# Image de secours pour la bascule VPS en 30 min (PRD §7.2, docs/DEPLOY.md §11).
# Multi-stage : le build (Angular + Nest) reste hors de l'image finale, qui ne
# contient que le runtime serveur, le front buildé et les packs `normal`
# committés. `data/` et `config.json` sont montés en volumes (docker-compose.yml).

FROM node:24-alpine AS build
WORKDIR /app
# D'abord les manifestes seuls : le npm ci est mis en cache tant qu'ils ne bougent pas.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY libs/shared/package.json libs/shared/
RUN npm ci
COPY tsconfig.base.json config.example.json ./
COPY libs ./libs
COPY apps ./apps
RUN npm run build \
  # Puis on réduit node_modules au runtime serveur (sans devDeps ni Angular).
  && npm ci --omit=dev -w apps/server -w libs/shared

FROM node:24-alpine
ENV NODE_ENV=production \
    APP_ROOT=/app \
    # Dans le conteneur on écoute sur toutes les interfaces ; c'est la
    # publication côté hôte qui reste locale (127.0.0.1:3000, cf. compose).
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist/web/browser ./apps/web/dist/web/browser
COPY packs ./packs
COPY config.example.json package.json ./
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "apps/server/dist/apps/server/src/main.js"]
