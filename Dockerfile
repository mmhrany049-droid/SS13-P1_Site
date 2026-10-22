# SS 13 — no npm install needed (zero runtime dependencies); the web bundle in apps/web/dist is already built.
FROM node:22-slim
WORKDIR /opt/ss
COPY . .
ENV NODE_ENV=production PORT=8080 DATA_DIR=/opt/ss/data SS_COOKIE_SECURE=1 TRUST_PROXY=1 SS_REQUIRE_MFA=1
EXPOSE 8080
USER node
CMD ["node","--disable-warning=ExperimentalWarning","--import","./scripts/ss-resolve.mjs","apps/api/src/server.mjs"]
