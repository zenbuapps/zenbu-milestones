# Zenbu-Roadmaps K8s Deployment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy zenbu-roadmaps (NestJS API + React SPA + PostgreSQL) to K8s cluster, modeled after zenbu-webinar's deployment pattern.

**Architecture:** pnpm monorepo builds two Docker images (API + Web). Helm chart deploys them to namespace `zenburoadmaps-prod` with PostgreSQL StatefulSet, Envoy Gateway + HTTPRoute, and wildcard TLS from cert-manager. Single production environment, domain `roadmaps.zenbuapps.com`.

**Tech Stack:** K8s (Envoy Gateway), Helm 3, Docker (multi-stage), GitHub Actions CI/CD, Cloudflare DNS, cert-manager wildcard TLS

**Reference:** Zenbu-webinar helm chart at `/Users/powerhouse/Documents/works/ai-projects/Zenbu/zenbu-webinar/helm/zenbu-webinar/`

---

## Key Differences from zenbu-webinar

| Aspect | zenbu-webinar | zenbu-roadmaps |
|--------|--------------|----------------|
| Package manager | npm (single project) | pnpm 10.32.1 (monorepo) |
| Backend | Express.js | NestJS 11 |
| Auth | JWT | Google OAuth + express-session (PostgreSQL store) |
| Workspace | server/ + client/ | apps/api/ + apps/web/ + packages/shared/ |
| Routing | /api, /socket.io, /uploads → API | /api/* → API only |
| Environments | staging + production | production only |
| TLS | Per-domain cert | Wildcard `*.zenbuapps.com` |

---

### Task 1: Infrastructure Setup

**Files:** None (kubectl + Cloudflare API + gh CLI commands)

- [ ] **Step 1: Create Cloudflare DNS A record**

```bash
CF_TOKEN=$(cat ~/.claude/skills/cloudflare-dns/.cf-token)
ZONE_ID="69dc65df6cd786742bf94dbc32df5df4"

curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "A",
    "name": "roadmaps",
    "content": "163.61.60.30",
    "ttl": 1,
    "proxied": false,
    "comment": "managed by cloudflare-dns skill"
  }' | python3 -m json.tool
```

Expected: `"success": true`, record `roadmaps.zenbuapps.com` pointing to `163.61.60.30`.

- [ ] **Step 2: Create K8s namespace**

```bash
kubectl create namespace zenburoadmaps-prod
```

- [ ] **Step 3: Copy wildcard TLS secret to namespace**

The wildcard cert `wildcard-zenbuapps-com-tls` exists in `cert-manager` namespace. Copy it to the new namespace:

```bash
kubectl get secret wildcard-zenbuapps-com-tls -n cert-manager -o yaml \
  | sed 's/namespace: cert-manager/namespace: zenburoadmaps-prod/' \
  | kubectl apply -f -
```

Verify:
```bash
kubectl get secret wildcard-zenbuapps-com-tls -n zenburoadmaps-prod
```

- [ ] **Step 4: Add missing GitHub secret PROD_DB_PASSWORD**

The existing GitHub secrets cover app-level config. We need a separate DB password for the K8s PostgreSQL StatefulSet:

```bash
cd /Users/powerhouse/Documents/works/ai-projects/Zenbu/zenbu-roadmaps
gh secret set PROD_DB_PASSWORD --body "$(openssl rand -hex 24)"
```

Also update secrets that need production values for k8s:

```bash
# These should already be correct, but verify/update if needed:
gh secret set GOOGLE_OAUTH_CALLBACK_URL --body "https://roadmaps.zenbuapps.com/api/auth/google/callback"
gh secret set SESSION_COOKIE_DOMAIN --body "roadmaps.zenbuapps.com"
gh secret set SESSION_COOKIE_SECURE --body "true"
gh secret set APP_BASE_URL --body "https://roadmaps.zenbuapps.com"
gh secret set API_BASE_URL --body "https://roadmaps.zenbuapps.com"
gh secret set CORS_ALLOWED_ORIGINS --body "https://roadmaps.zenbuapps.com"
gh secret set GITHUB_ORG --body "zenbuapps"
```

---

### Task 2: Docker Build Configuration

**Files:**
- Create: `.dockerignore`
- Create: `apps/web/nginx.conf`
- Create: `apps/api/Dockerfile`
- Create: `apps/web/Dockerfile`

- [ ] **Step 1: Create `.dockerignore`**

Create `/Users/powerhouse/Documents/works/ai-projects/Zenbu/zenbu-roadmaps/.dockerignore`:

```
node_modules
.git
.github
.claude
.vscode
.serena
docs
specs
*.md
.env
.env.*
*.log
.DS_Store
apps/api/dist
apps/web/dist
packages/shared/dist
helm
```

- [ ] **Step 2: Create `apps/web/nginx.conf`**

Create `/Users/powerhouse/Documents/works/ai-projects/Zenbu/zenbu-roadmaps/apps/web/nginx.conf`:

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml text/javascript image/svg+xml;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 3: Create `apps/api/Dockerfile`**

Create `/Users/powerhouse/Documents/works/ai-projects/Zenbu/zenbu-roadmaps/apps/api/Dockerfile`:

Docker context = monorepo root. Single-stage build preserves pnpm symlink structure (required for `prisma migrate deploy` in migration job).

```dockerfile
FROM node:22-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

# Install dependencies (cached unless package files change)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/
RUN pnpm build:shared \
    && cd apps/api && pnpm exec prisma generate \
    && cd ../.. && pnpm build:api

ENV NODE_ENV=production
EXPOSE 3000
WORKDIR /app/apps/api
CMD ["node", "dist/main.js"]
```

- [ ] **Step 4: Create `apps/web/Dockerfile`**

Create `/Users/powerhouse/Documents/works/ai-projects/Zenbu/zenbu-roadmaps/apps/web/Dockerfile`:

Docker context = monorepo root. Multi-stage: Node build → nginx serve.

```dockerfile
FROM node:22-slim AS build
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/

ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm build:shared && pnpm build:web

FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 5: Verify Docker builds locally (optional)**

```bash
cd /Users/powerhouse/Documents/works/ai-projects/Zenbu/zenbu-roadmaps
docker build -f apps/api/Dockerfile -t zenbu-roadmaps-api:test .
docker build -f apps/web/Dockerfile -t zenbu-roadmaps-web:test .
```

---

### Task 3: Helm Chart — Core Resources

**Files:**
- Create: `helm/zenbu-roadmaps/Chart.yaml`
- Create: `helm/zenbu-roadmaps/values.yaml`
- Create: `helm/zenbu-roadmaps/templates/_helpers.tpl`
- Create: `helm/zenbu-roadmaps/templates/api-deployment.yaml`
- Create: `helm/zenbu-roadmaps/templates/api-service.yaml`
- Create: `helm/zenbu-roadmaps/templates/web-deployment.yaml`
- Create: `helm/zenbu-roadmaps/templates/web-service.yaml`
- Create: `helm/zenbu-roadmaps/templates/postgresql.yaml`
- Create: `helm/zenbu-roadmaps/templates/secret.yaml`
- Create: `helm/zenbu-roadmaps/templates/ghcr-secret.yaml`
- Create: `helm/zenbu-roadmaps/templates/migration-job.yaml`

- [ ] **Step 1: Create `helm/zenbu-roadmaps/Chart.yaml`**

```yaml
apiVersion: v2
name: zenbu-roadmaps
description: Zenbu Roadmaps — roadmap visualization & issue management
type: application
version: 0.1.0
appVersion: "0.2.0"
```

- [ ] **Step 2: Create `helm/zenbu-roadmaps/values.yaml`**

```yaml
instance:
  name: zenburoadmaps

namespace: zenburoadmaps-prod
domain: roadmaps.zenbuapps.com

# API Service (NestJS)
api:
  image:
    repository: ghcr.io/zenbuapps/zenbu-roadmaps-api
    tag: latest
  replicas: 1
  port: 3000
  env:
    NODE_ENV: production
    PORT: "3000"
    GITHUB_ORG: zenbuapps
  secrets:
    DATABASE_URL: "postgresql://zenburoadmaps:change-me@zenburoadmaps-postgresql:5432/zenburoadmaps"
    SESSION_SECRET: change-me
    SESSION_COOKIE_DOMAIN: roadmaps.zenbuapps.com
    SESSION_COOKIE_SECURE: "true"
    APP_BASE_URL: "https://roadmaps.zenbuapps.com"
    API_BASE_URL: "https://roadmaps.zenbuapps.com"
    CORS_ALLOWED_ORIGINS: "https://roadmaps.zenbuapps.com"
    GOOGLE_OAUTH_CLIENT_ID: ""
    GOOGLE_OAUTH_CLIENT_SECRET: ""
    GOOGLE_OAUTH_CALLBACK_URL: "https://roadmaps.zenbuapps.com/api/auth/google/callback"
    ZENBU_ORG_WRITE_TOKEN: ""
    INITIAL_ADMIN_EMAILS: ""
    BUNNY_CDN_URL: ""
    BUNNY_STORAGE_HOST: ""
    BUNNY_STORAGE_ZONE: ""
    BUNNY_STORAGE_PASSWORD: ""

# Web Service (nginx)
web:
  image:
    repository: ghcr.io/zenbuapps/zenbu-roadmaps-web
    tag: latest
  replicas: 1
  port: 80

# PostgreSQL Database
postgresql:
  enabled: true
  database: zenburoadmaps
  username: zenburoadmaps
  password: change-me
  storage: 10Gi
  storageClass: local-path

# TLS Configuration
tls:
  wildcardSecret: wildcard-zenbuapps-com-tls

# Admin Account
admin:
  email: ""
  password: ""
```

- [ ] **Step 3: Create `helm/zenbu-roadmaps/templates/_helpers.tpl`**

```
{{- define "zenbu-roadmaps.labels" -}}
app.kubernetes.io/managed-by: Helm
app.kubernetes.io/part-of: zenbu-roadmaps
{{- end -}}

{{- define "zenbu-roadmaps.name" -}}
{{ .Values.instance.name }}
{{- end -}}
```

- [ ] **Step 4: Create `helm/zenbu-roadmaps/templates/secret.yaml`**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: {{ include "zenbu-roadmaps.name" . }}-secrets
  namespace: {{ .Values.namespace }}
  labels:
    {{- include "zenbu-roadmaps.labels" . | nindent 4 }}
type: Opaque
stringData:
  {{- range $key, $val := .Values.api.secrets }}
  {{ $key }}: {{ $val | quote }}
  {{- end }}
```

- [ ] **Step 5: Create `helm/zenbu-roadmaps/templates/ghcr-secret.yaml`**

```yaml
{{- if .Values.imagePullSecret }}
apiVersion: v1
kind: Secret
metadata:
  name: ghcr-login
  namespace: {{ .Values.namespace }}
  labels:
    {{- include "zenbu-roadmaps.labels" . | nindent 4 }}
type: kubernetes.io/dockerconfigjson
data:
  .dockerconfigjson: {{ .Values.imagePullSecret }}
{{- end }}
```

- [ ] **Step 6: Create `helm/zenbu-roadmaps/templates/api-deployment.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "zenbu-roadmaps.name" . }}-api
  namespace: {{ .Values.namespace }}
  labels:
    app: {{ include "zenbu-roadmaps.name" . }}-api
    {{- include "zenbu-roadmaps.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.api.replicas }}
  selector:
    matchLabels:
      app: {{ include "zenbu-roadmaps.name" . }}-api
  template:
    metadata:
      labels:
        app: {{ include "zenbu-roadmaps.name" . }}-api
    spec:
      {{- if .Values.imagePullSecret }}
      imagePullSecrets:
        - name: ghcr-login
      {{- end }}
      containers:
        - name: api
          image: "{{ .Values.api.image.repository }}:{{ .Values.api.image.tag }}"
          ports:
            - containerPort: {{ .Values.api.port }}
          env:
            {{- range $key, $val := .Values.api.env }}
            - name: {{ $key }}
              value: {{ $val | quote }}
            {{- end }}
            {{- range $key, $_ := .Values.api.secrets }}
            - name: {{ $key }}
              valueFrom:
                secretKeyRef:
                  name: {{ include "zenbu-roadmaps.name" $ }}-secrets
                  key: {{ $key }}
            {{- end }}
          readinessProbe:
            httpGet:
              path: /api/health
              port: {{ .Values.api.port }}
            initialDelaySeconds: 15
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /api/health
              port: {{ .Values.api.port }}
            initialDelaySeconds: 30
            periodSeconds: 30
```

- [ ] **Step 7: Create `helm/zenbu-roadmaps/templates/api-service.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "zenbu-roadmaps.name" . }}-api
  namespace: {{ .Values.namespace }}
  labels:
    app: {{ include "zenbu-roadmaps.name" . }}-api
    {{- include "zenbu-roadmaps.labels" . | nindent 4 }}
spec:
  selector:
    app: {{ include "zenbu-roadmaps.name" . }}-api
  ports:
    - port: {{ .Values.api.port }}
      targetPort: {{ .Values.api.port }}
```

- [ ] **Step 8: Create `helm/zenbu-roadmaps/templates/web-deployment.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "zenbu-roadmaps.name" . }}-web
  namespace: {{ .Values.namespace }}
  labels:
    app: {{ include "zenbu-roadmaps.name" . }}-web
    {{- include "zenbu-roadmaps.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.web.replicas }}
  selector:
    matchLabels:
      app: {{ include "zenbu-roadmaps.name" . }}-web
  template:
    metadata:
      labels:
        app: {{ include "zenbu-roadmaps.name" . }}-web
    spec:
      {{- if .Values.imagePullSecret }}
      imagePullSecrets:
        - name: ghcr-login
      {{- end }}
      containers:
        - name: web
          image: "{{ .Values.web.image.repository }}:{{ .Values.web.image.tag }}"
          ports:
            - containerPort: {{ .Values.web.port }}
          readinessProbe:
            httpGet:
              path: /
              port: {{ .Values.web.port }}
            initialDelaySeconds: 5
            periodSeconds: 10
```

- [ ] **Step 9: Create `helm/zenbu-roadmaps/templates/web-service.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "zenbu-roadmaps.name" . }}-web
  namespace: {{ .Values.namespace }}
  labels:
    app: {{ include "zenbu-roadmaps.name" . }}-web
    {{- include "zenbu-roadmaps.labels" . | nindent 4 }}
spec:
  selector:
    app: {{ include "zenbu-roadmaps.name" . }}-web
  ports:
    - port: {{ .Values.web.port }}
      targetPort: {{ .Values.web.port }}
```

- [ ] **Step 10: Create `helm/zenbu-roadmaps/templates/postgresql.yaml`**

```yaml
{{- if .Values.postgresql.enabled }}
apiVersion: v1
kind: Service
metadata:
  name: {{ include "zenbu-roadmaps.name" . }}-postgresql
  namespace: {{ .Values.namespace }}
  labels:
    app: {{ include "zenbu-roadmaps.name" . }}-postgresql
    {{- include "zenbu-roadmaps.labels" . | nindent 4 }}
spec:
  selector:
    app: {{ include "zenbu-roadmaps.name" . }}-postgresql
  ports:
    - port: 5432
      targetPort: 5432
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: {{ include "zenbu-roadmaps.name" . }}-postgresql
  namespace: {{ .Values.namespace }}
  labels:
    app: {{ include "zenbu-roadmaps.name" . }}-postgresql
    {{- include "zenbu-roadmaps.labels" . | nindent 4 }}
spec:
  serviceName: {{ include "zenbu-roadmaps.name" . }}-postgresql
  replicas: 1
  selector:
    matchLabels:
      app: {{ include "zenbu-roadmaps.name" . }}-postgresql
  template:
    metadata:
      labels:
        app: {{ include "zenbu-roadmaps.name" . }}-postgresql
    spec:
      containers:
        - name: postgresql
          image: postgres:16-alpine
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_DB
              value: {{ .Values.postgresql.database }}
            - name: POSTGRES_USER
              value: {{ .Values.postgresql.username }}
            - name: POSTGRES_PASSWORD
              value: {{ .Values.postgresql.password | quote }}
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
          readinessProbe:
            exec:
              command: ["pg_isready", "-U", {{ .Values.postgresql.username | quote }}]
            initialDelaySeconds: 5
            periodSeconds: 10
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: {{ .Values.postgresql.storageClass }}
        resources:
          requests:
            storage: {{ .Values.postgresql.storage }}
{{- end }}
```

- [ ] **Step 11: Create `helm/zenbu-roadmaps/templates/migration-job.yaml`**

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ include "zenbu-roadmaps.name" . }}-migrate-{{ .Release.Revision }}
  namespace: {{ .Values.namespace }}
  labels:
    {{- include "zenbu-roadmaps.labels" . | nindent 4 }}
  annotations:
    "helm.sh/hook": post-install,post-upgrade
    "helm.sh/hook-weight": "0"
    "helm.sh/hook-delete-policy": before-hook-creation
spec:
  backoffLimit: 3
  activeDeadlineSeconds: 120
  template:
    metadata:
      labels:
        app: {{ include "zenbu-roadmaps.name" . }}-migrate
    spec:
      {{- if .Values.imagePullSecret }}
      imagePullSecrets:
        - name: ghcr-login
      {{- end }}
      initContainers:
        - name: wait-for-db
          image: postgres:16-alpine
          command:
            - sh
            - -c
            - |
              echo "Waiting for PostgreSQL at $DB_HOST:$DB_PORT..."
              for i in $(seq 1 60); do
                if pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" >/dev/null 2>&1; then
                  echo "PostgreSQL is ready"
                  exit 0
                fi
                echo "Attempt $i/60 - not ready, waiting..."
                sleep 2
              done
              echo "PostgreSQL did not become ready in time"
              exit 1
          env:
            - name: DB_HOST
              value: {{ include "zenbu-roadmaps.name" . }}-postgresql
            - name: DB_PORT
              value: "5432"
            - name: DB_USER
              value: {{ .Values.postgresql.username }}
      containers:
        - name: migrate
          image: "{{ .Values.api.image.repository }}:{{ .Values.api.image.tag }}"
          command:
            - sh
            - -c
            - "cd /app/apps/api && pnpm exec prisma migrate deploy"
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: {{ include "zenbu-roadmaps.name" . }}-secrets
                  key: DATABASE_URL
      restartPolicy: Never
```

- [ ] **Step 12: Verify template rendering**

```bash
cd /Users/powerhouse/Documents/works/ai-projects/Zenbu/zenbu-roadmaps
helm template zenbu-roadmaps helm/zenbu-roadmaps/ --debug
```

Expected: All templates render without errors.

---

### Task 4: Helm Chart — Networking & TLS

**Files:**
- Create: `helm/zenbu-roadmaps/templates/gateway-listener.yaml`
- Create: `helm/zenbu-roadmaps/templates/httproute.yaml`

- [ ] **Step 1: Create `helm/zenbu-roadmaps/templates/gateway-listener.yaml`**

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: {{ include "zenbu-roadmaps.name" . }}-gateway
  namespace: {{ .Values.namespace }}
  labels:
    {{- include "zenbu-roadmaps.labels" . | nindent 4 }}
spec:
  gatewayClassName: eg
  listeners:
    - name: http
      hostname: {{ .Values.domain }}
      port: 80
      protocol: HTTP
      allowedRoutes:
        namespaces:
          from: Same
    - name: https
      hostname: {{ .Values.domain }}
      port: 443
      protocol: HTTPS
      tls:
        mode: Terminate
        certificateRefs:
          - kind: Secret
            name: {{ .Values.tls.wildcardSecret }}
      allowedRoutes:
        namespaces:
          from: Same
```

- [ ] **Step 2: Create `helm/zenbu-roadmaps/templates/httproute.yaml`**

```yaml
# Route 1: HTTP → HTTPS redirect
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: {{ include "zenbu-roadmaps.name" . }}-http-redirect
  namespace: {{ .Values.namespace }}
  labels:
    {{- include "zenbu-roadmaps.labels" . | nindent 4 }}
spec:
  parentRefs:
    - name: {{ include "zenbu-roadmaps.name" . }}-gateway
      namespace: {{ .Values.namespace }}
      sectionName: http
  hostnames:
    - {{ .Values.domain }}
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      filters:
        - type: RequestRedirect
          requestRedirect:
            scheme: https
            statusCode: 301
---
# Route 2: HTTPS main traffic
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: {{ include "zenbu-roadmaps.name" . }}-https
  namespace: {{ .Values.namespace }}
  labels:
    {{- include "zenbu-roadmaps.labels" . | nindent 4 }}
spec:
  parentRefs:
    - name: {{ include "zenbu-roadmaps.name" . }}-gateway
      namespace: {{ .Values.namespace }}
      sectionName: https
  hostnames:
    - {{ .Values.domain }}
  rules:
    # /api/* → API service
    - matches:
        - path:
            type: PathPrefix
            value: /api
      backendRefs:
        - name: {{ include "zenbu-roadmaps.name" . }}-api
          port: {{ .Values.api.port }}
      timeouts:
        request: 120s
        backendRequest: 120s
    # /* → Web service (SPA)
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: {{ include "zenbu-roadmaps.name" . }}-web
          port: {{ .Values.web.port }}
```

- [ ] **Step 3: Verify full chart rendering**

```bash
helm template zenbu-roadmaps helm/zenbu-roadmaps/ --debug 2>&1 | head -200
```

---

### Task 5: CI/CD Pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

Create `/Users/powerhouse/Documents/works/ai-projects/Zenbu/zenbu-roadmaps/.github/workflows/ci.yml`:

```yaml
name: CI/CD

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: zenbu-cloud
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install pnpm
        run: corepack enable && corepack prepare pnpm@10.32.1 --activate

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build shared
        run: pnpm build:shared

      - name: Generate Prisma client
        run: pnpm prisma:generate

      - name: Type check
        run: pnpm typecheck

      - name: Build API
        run: pnpm build:api

      - name: Build Web
        run: pnpm build:web

  build-and-push:
    if: github.event_name == 'push'
    needs: test
    runs-on: zenbu-cloud
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Calculate image tag
        id: tag
        run: echo "sha=${GITHUB_SHA:0:7}" >> "$GITHUB_OUTPUT"

      - name: Build & push API image
        run: |
          docker build -f apps/api/Dockerfile \
            -t ghcr.io/zenbuapps/zenbu-roadmaps-api:${{ steps.tag.outputs.sha }} \
            -t ghcr.io/zenbuapps/zenbu-roadmaps-api:latest \
            .
          docker push ghcr.io/zenbuapps/zenbu-roadmaps-api:${{ steps.tag.outputs.sha }}
          docker push ghcr.io/zenbuapps/zenbu-roadmaps-api:latest

      - name: Build & push Web image
        run: |
          docker build -f apps/web/Dockerfile \
            --build-arg VITE_API_BASE_URL="" \
            -t ghcr.io/zenbuapps/zenbu-roadmaps-web:${{ steps.tag.outputs.sha }} \
            -t ghcr.io/zenbuapps/zenbu-roadmaps-web:latest \
            .
          docker push ghcr.io/zenbuapps/zenbu-roadmaps-web:${{ steps.tag.outputs.sha }}
          docker push ghcr.io/zenbuapps/zenbu-roadmaps-web:latest

  deploy:
    if: github.event_name == 'push' && github.ref == 'refs/heads/master'
    needs: build-and-push
    runs-on: zenbu-cloud
    steps:
      - uses: actions/checkout@v4

      - name: Configure kubeconfig
        run: |
          mkdir -p ~/.kube
          if [ -f /var/run/secrets/kubernetes.io/serviceaccount/token ]; then
            kubectl config set-cluster default --server=https://kubernetes.default.svc --certificate-authority=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt
            kubectl config set-credentials default --token=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
            kubectl config set-context default --cluster=default --user=default
            kubectl config use-context default
          fi

      - name: Verify cluster access
        run: kubectl get nodes

      - name: Calculate image tag
        id: tag
        run: echo "sha=${GITHUB_SHA:0:7}" >> "$GITHUB_OUTPUT"

      - name: Clean up stuck releases
        run: |
          NAMESPACE="zenburoadmaps-prod"
          RELEASE="zenbu-roadmaps"
          STATUS=$(helm status $RELEASE -n $NAMESPACE 2>/dev/null | grep STATUS | awk '{print $2}' || echo "not-found")
          if [ "$STATUS" = "failed" ]; then
            echo "Uninstalling failed release..."
            helm uninstall $RELEASE -n $NAMESPACE || true
          elif [[ "$STATUS" == pending-* ]]; then
            echo "Rolling back pending release..."
            helm rollback $RELEASE 0 -n $NAMESPACE || true
          fi

      - name: Create GHCR pull secret
        run: |
          GHCR_SECRET=$(echo -n '{"auths":{"ghcr.io":{"auth":"'$(echo -n "${{ github.actor }}:${{ secrets.GITHUB_TOKEN }}" | base64)'"}}}' | base64)
          echo "GHCR_SECRET=$GHCR_SECRET" >> "$GITHUB_ENV"

      - name: Deploy with Helm
        run: |
          IMAGE_TAG="${{ steps.tag.outputs.sha }}"
          DB_PASSWORD="${{ secrets.PROD_DB_PASSWORD }}"
          DATABASE_URL="postgresql://zenburoadmaps:${DB_PASSWORD}@zenburoadmaps-postgresql:5432/zenburoadmaps"

          helm upgrade --install zenbu-roadmaps helm/zenbu-roadmaps/ \
            -n zenburoadmaps-prod \
            --set api.image.tag="$IMAGE_TAG" \
            --set web.image.tag="$IMAGE_TAG" \
            --set imagePullSecret="$GHCR_SECRET" \
            --set postgresql.password="$DB_PASSWORD" \
            --set api.secrets.DATABASE_URL="$DATABASE_URL" \
            --set api.secrets.SESSION_SECRET="${{ secrets.SESSION_SECRET }}" \
            --set api.secrets.SESSION_COOKIE_DOMAIN="${{ secrets.SESSION_COOKIE_DOMAIN }}" \
            --set api.secrets.SESSION_COOKIE_SECURE="${{ secrets.SESSION_COOKIE_SECURE }}" \
            --set api.secrets.APP_BASE_URL="${{ secrets.APP_BASE_URL }}" \
            --set api.secrets.API_BASE_URL="${{ secrets.API_BASE_URL }}" \
            --set api.secrets.CORS_ALLOWED_ORIGINS="${{ secrets.CORS_ALLOWED_ORIGINS }}" \
            --set api.secrets.GOOGLE_OAUTH_CLIENT_ID="${{ secrets.GOOGLE_OAUTH_CLIENT_ID }}" \
            --set api.secrets.GOOGLE_OAUTH_CLIENT_SECRET="${{ secrets.GOOGLE_OAUTH_CLIENT_SECRET }}" \
            --set api.secrets.GOOGLE_OAUTH_CALLBACK_URL="${{ secrets.GOOGLE_OAUTH_CALLBACK_URL }}" \
            --set api.secrets.ZENBU_ORG_WRITE_TOKEN="${{ secrets.ZENBU_ORG_WRITE_TOKEN }}" \
            --set api.secrets.INITIAL_ADMIN_EMAILS="${{ secrets.INITIAL_ADMIN_EMAILS }}" \
            --set api.secrets.BUNNY_CDN_URL="${{ secrets.BUNNY_CDN_URL }}" \
            --set api.secrets.BUNNY_STORAGE_HOST="${{ secrets.BUNNY_STORAGE_HOST }}" \
            --set api.secrets.BUNNY_STORAGE_ZONE="${{ secrets.BUNNY_STORAGE_ZONE }}" \
            --set api.secrets.BUNNY_STORAGE_PASSWORD="${{ secrets.BUNNY_STORAGE_PASSWORD }}"

      - name: Verify deployment
        run: |
          kubectl rollout status deployment/zenburoadmaps-api -n zenburoadmaps-prod --timeout=120s
          kubectl rollout status deployment/zenburoadmaps-web -n zenburoadmaps-prod --timeout=120s

      - name: Show deployment status
        if: always()
        run: |
          kubectl get pods -n zenburoadmaps-prod
          kubectl get svc -n zenburoadmaps-prod
          kubectl get gateway -n zenburoadmaps-prod
          kubectl get httproute -n zenburoadmaps-prod
```

---

### Task 6: Deploy & Verify

- [ ] **Step 1: Commit and push all new files**

```bash
cd /Users/powerhouse/Documents/works/ai-projects/Zenbu/zenbu-roadmaps
git add .dockerignore apps/api/Dockerfile apps/web/Dockerfile apps/web/nginx.conf \
  helm/ .github/workflows/ci.yml
git commit -m "feat: add K8s deployment (Helm chart + Dockerfiles + CI/CD)

- Dockerfiles for API (NestJS, pnpm monorepo) and Web (Vite → nginx)
- Helm chart modeled after zenbu-webinar with Envoy Gateway + HTTPRoute
- CI/CD pipeline: test → build → deploy to zenburoadmaps-prod
- Domain: roadmaps.zenbuapps.com with wildcard TLS from cert-manager"
git push origin master
```

- [ ] **Step 2: Monitor CI/CD pipeline**

```bash
gh run watch
```

- [ ] **Step 3: Verify deployment**

```bash
# Check pods
kubectl get pods -n zenburoadmaps-prod

# Check API health
kubectl exec -n zenburoadmaps-prod deploy/zenburoadmaps-api -- curl -s http://localhost:3000/api/health

# Check gateway
kubectl get gateway -n zenburoadmaps-prod
kubectl get httproute -n zenburoadmaps-prod

# Test external access
curl -s -o /dev/null -w "%{http_code}" https://roadmaps.zenbuapps.com/
curl -s https://roadmaps.zenbuapps.com/api/health
```

- [ ] **Step 4: Verify HTTPS redirect**

```bash
curl -s -o /dev/null -w "%{http_code} → %{redirect_url}" http://roadmaps.zenbuapps.com/
```

Expected: `301 → https://roadmaps.zenbuapps.com/`

---

## Architecture Diagram

```
Internet
  │
  163.61.60.30 (NAT → 192.168.30.200)
  │
  Envoy Gateway (namespace: zenburoadmaps-prod)
  │
  ├─ HTTPS roadmaps.zenbuapps.com
  │   ├─ /api/*  → zenburoadmaps-api:3000 (NestJS)
  │   └─ /*      → zenburoadmaps-web:80   (nginx SPA)
  │
  └─ HTTP roadmaps.zenbuapps.com → 301 → HTTPS

  TLS: wildcard-zenbuapps-com-tls (from cert-manager namespace)

  PostgreSQL: zenburoadmaps-postgresql:5432 (StatefulSet, 10Gi local-path)
```

## Secrets Checklist (GitHub)

| Secret | Status | Value for K8s |
|--------|--------|---------------|
| PROD_DB_PASSWORD | **NEW** | Auto-generated random hex |
| GOOGLE_OAUTH_CLIENT_ID | Exists | Keep as-is |
| GOOGLE_OAUTH_CLIENT_SECRET | Exists | Keep as-is |
| GOOGLE_OAUTH_CALLBACK_URL | Update | `https://roadmaps.zenbuapps.com/api/auth/google/callback` |
| SESSION_SECRET | Exists | Keep as-is |
| SESSION_COOKIE_DOMAIN | Update | `roadmaps.zenbuapps.com` |
| SESSION_COOKIE_SECURE | Update | `true` |
| APP_BASE_URL | Update | `https://roadmaps.zenbuapps.com` |
| API_BASE_URL | Update | `https://roadmaps.zenbuapps.com` |
| CORS_ALLOWED_ORIGINS | Update | `https://roadmaps.zenbuapps.com` |
| ZENBU_ORG_WRITE_TOKEN | Exists | Keep as-is |
| INITIAL_ADMIN_EMAILS | Exists | Keep as-is |
| BUNNY_* | Exists | Keep as-is |
| GITHUB_ORG | **NEW** | `zenbuapps` (set via `--set api.env`) |
