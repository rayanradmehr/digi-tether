# ---------------------------------------------------------------------------
# Stage 1: Dependencies
# Installs only production + build dependencies in an isolated layer so that
# dependency installation is cached independently from source code changes.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS dependencies

WORKDIR /app

# Enable pnpm via corepack (pinned version, matches packageManager field).
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml* ./

# Install full dependency graph (dev + prod) needed for the build stage.
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 2: Build
# Compiles TypeScript to JavaScript using the dependencies installed above.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

RUN pnpm run build

# Prune devDependencies after build, keeping only what is needed at runtime.
RUN pnpm install --prod --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 3: Runtime
# Minimal final image. Runs as a non-root user, contains only the compiled
# output (dist) and production node_modules. No build tools, no source TS.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime

ENV NODE_ENV=production

WORKDIR /app

# Create a dedicated non-root user/group for running the process.
RUN addgroup -S nodeapp && adduser -S nodeapp -G nodeapp

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

USER nodeapp

EXPOSE 3000

CMD ["node", "dist/main.js"]
