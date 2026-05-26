# Migration Job TTL Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically clean up completed migration jobs with differentiated retention — successful jobs deleted after 3 days, failed jobs after 7 days.

**Architecture:** Kubernetes-native `ttlSecondsAfterFinished` on the migration Job provides a 7-day fallback for all jobs. A daily CronJob with a jq-based cleanup script selectively deletes successful jobs older than 3 days. Namespace-scoped RBAC ensures least-privilege access.

**Tech Stack:** Kubernetes Job/CronJob, Helm templates, bitnami/kubectl image (includes jq), RBAC (Role/RoleBinding/ServiceAccount)

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `helm/zenbu-roadmaps/values.yaml` | Add `migration` config section |
| Modify | `helm/zenbu-roadmaps/templates/migration-job.yaml` | Add TTL, add Job-level label, remove dead annotation |
| Create | `helm/zenbu-roadmaps/templates/migration-cleanup-rbac.yaml` | ServiceAccount + Role + RoleBinding for cleanup CronJob |
| Create | `helm/zenbu-roadmaps/templates/migration-cleanup-cronjob.yaml` | Daily CronJob that deletes successful jobs older than 3 days |

---

### Task 1: Add `migration` section to values.yaml

**Files:**
- Modify: `helm/zenbu-roadmaps/values.yaml:58-61` (append after `admin` block)

- [ ] **Step 1: Add migration config block to values.yaml**

Append the following at the end of `helm/zenbu-roadmaps/values.yaml` (after the existing `admin:` block):

```yaml

# Migration Job Cleanup
migration:
  ttlSecondsAfterFinished: 604800  # 7 days fallback (all jobs, success or failure)
  cleanup:
    enabled: true
    schedule: "0 3 * * *"           # Daily at 03:00
    successTTLSeconds: 259200        # 3 days for successful jobs
    image: bitnami/kubectl:1.33
```

- [ ] **Step 2: Validate YAML syntax**

Run:
```bash
cd /Users/powerhouse/Documents/works/ai-projects/Zenbu/zenbu-roadmaps
python3 -c "import yaml; yaml.safe_load(open('helm/zenbu-roadmaps/values.yaml'))" && echo "YAML OK"
```

Expected: `YAML OK`

- [ ] **Step 3: Commit**

```bash
git add helm/zenbu-roadmaps/values.yaml
git commit -m "feat(helm): add migration cleanup config to values.yaml"
```

---

### Task 2: Modify migration-job.yaml

**Files:**
- Modify: `helm/zenbu-roadmaps/templates/migration-job.yaml`

Three changes:
1. Add `app` label to Job **metadata** (currently only on pod template) — this is the CronJob's selector
2. Add `ttlSecondsAfterFinished` to Job spec
3. Remove the ineffective `helm.sh/hook-delete-policy` annotation

- [ ] **Step 1: Add `app` label to Job metadata labels**

The current `metadata.labels` block (line 6-7) only has the shared Helm labels. Add the `app` label after it:

```yaml
  labels:
    {{- include "zenbu-roadmaps.labels" . | nindent 4 }}
    app: {{ include "zenbu-roadmaps.name" . }}-migrate
```

- [ ] **Step 2: Remove the `hook-delete-policy` annotation**

Delete this line (currently line 11):

```yaml
    "helm.sh/hook-delete-policy": before-hook-creation
```

The annotations block should now only contain:

```yaml
  annotations:
    "helm.sh/hook": post-install,post-upgrade
    "helm.sh/hook-weight": "0"
```

- [ ] **Step 3: Add `ttlSecondsAfterFinished` to Job spec**

Add it as the first field under `spec:`, before `backoffLimit`:

```yaml
spec:
  ttlSecondsAfterFinished: {{ .Values.migration.ttlSecondsAfterFinished }}
  backoffLimit: 3
```

- [ ] **Step 4: Verify the final file**

The complete `migration-job.yaml` should now be:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ include "zenbu-roadmaps.name" . }}-migrate-{{ .Release.Revision }}
  namespace: {{ .Values.namespace }}
  labels:
    {{- include "zenbu-roadmaps.labels" . | nindent 4 }}
    app: {{ include "zenbu-roadmaps.name" . }}-migrate
  annotations:
    "helm.sh/hook": post-install,post-upgrade
    "helm.sh/hook-weight": "0"
spec:
  ttlSecondsAfterFinished: {{ .Values.migration.ttlSecondsAfterFinished }}
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

- [ ] **Step 5: Dry-run Helm template to verify rendering**

```bash
helm template zenburoadmaps helm/zenbu-roadmaps -f helm/zenbu-roadmaps/values.yaml -s templates/migration-job.yaml
```

Expected: renders valid YAML with `ttlSecondsAfterFinished: 604800`, `app: zenburoadmaps-migrate` label on Job metadata, and no `hook-delete-policy` annotation.

- [ ] **Step 6: Commit**

```bash
git add helm/zenbu-roadmaps/templates/migration-job.yaml
git commit -m "feat(helm): add TTL fallback and app label to migration job"
```

---

### Task 3: Create migration-cleanup-rbac.yaml

**Files:**
- Create: `helm/zenbu-roadmaps/templates/migration-cleanup-rbac.yaml`

- [ ] **Step 1: Create the RBAC template**

Create `helm/zenbu-roadmaps/templates/migration-cleanup-rbac.yaml` with the following content:

```yaml
{{- if .Values.migration.cleanup.enabled }}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ include "zenbu-roadmaps.name" . }}-migrate-cleanup
  namespace: {{ .Values.namespace }}
  labels:
    {{- include "zenbu-roadmaps.labels" . | nindent 4 }}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: {{ include "zenbu-roadmaps.name" . }}-migrate-cleanup
  namespace: {{ .Values.namespace }}
  labels:
    {{- include "zenbu-roadmaps.labels" . | nindent 4 }}
rules:
  - apiGroups: ["batch"]
    resources: ["jobs"]
    verbs: ["get", "list", "delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: {{ include "zenbu-roadmaps.name" . }}-migrate-cleanup
  namespace: {{ .Values.namespace }}
  labels:
    {{- include "zenbu-roadmaps.labels" . | nindent 4 }}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: {{ include "zenbu-roadmaps.name" . }}-migrate-cleanup
subjects:
  - kind: ServiceAccount
    name: {{ include "zenbu-roadmaps.name" . }}-migrate-cleanup
    namespace: {{ .Values.namespace }}
{{- end }}
```

- [ ] **Step 2: Dry-run Helm template to verify rendering**

```bash
helm template zenburoadmaps helm/zenbu-roadmaps -f helm/zenbu-roadmaps/values.yaml -s templates/migration-cleanup-rbac.yaml
```

Expected: renders three resources (ServiceAccount, Role, RoleBinding) with name `zenburoadmaps-migrate-cleanup` in namespace `zenburoadmaps-prod`. Role has `batch/jobs` with `get`, `list`, `delete`.

- [ ] **Step 3: Verify disabled state**

```bash
helm template zenburoadmaps helm/zenbu-roadmaps -f helm/zenbu-roadmaps/values.yaml --set migration.cleanup.enabled=false -s templates/migration-cleanup-rbac.yaml
```

Expected: empty output (no resources rendered).

- [ ] **Step 4: Commit**

```bash
git add helm/zenbu-roadmaps/templates/migration-cleanup-rbac.yaml
git commit -m "feat(helm): add RBAC for migration cleanup CronJob"
```

---

### Task 4: Create migration-cleanup-cronjob.yaml

**Files:**
- Create: `helm/zenbu-roadmaps/templates/migration-cleanup-cronjob.yaml`

- [ ] **Step 1: Create the CronJob template**

Create `helm/zenbu-roadmaps/templates/migration-cleanup-cronjob.yaml` with the following content:

```yaml
{{- if .Values.migration.cleanup.enabled }}
apiVersion: batch/v1
kind: CronJob
metadata:
  name: {{ include "zenbu-roadmaps.name" . }}-migrate-cleanup
  namespace: {{ .Values.namespace }}
  labels:
    {{- include "zenbu-roadmaps.labels" . | nindent 4 }}
spec:
  schedule: {{ .Values.migration.cleanup.schedule | quote }}
  successfulJobsHistoryLimit: 1
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      ttlSecondsAfterFinished: 3600
      template:
        spec:
          serviceAccountName: {{ include "zenbu-roadmaps.name" . }}-migrate-cleanup
          containers:
            - name: cleanup
              image: {{ .Values.migration.cleanup.image }}
              command: [sh, -c]
              args:
                - |
                  echo "Cleaning up successful migration jobs older than $SUCCESS_TTL seconds..."
                  DELETED=$(kubectl get jobs -n $NAMESPACE -l app={{ include "zenbu-roadmaps.name" . }}-migrate \
                    --field-selector status.successful=1 -o json \
                  | jq -r --argjson ttl $SUCCESS_TTL '
                      .items[]
                      | select(.status.completionTime)
                      | select((now - (.status.completionTime | fromdateiso8601)) > $ttl)
                      | .metadata.name
                    ')
                  if [ -z "$DELETED" ]; then
                    echo "No jobs to clean up."
                  else
                    echo "$DELETED" | xargs kubectl delete job -n $NAMESPACE
                  fi
                  echo "Cleanup complete."
              env:
                - name: NAMESPACE
                  value: {{ .Values.namespace }}
                - name: SUCCESS_TTL
                  value: {{ .Values.migration.cleanup.successTTLSeconds | quote }}
          restartPolicy: OnFailure
{{- end }}
```

- [ ] **Step 2: Dry-run Helm template to verify rendering**

```bash
helm template zenburoadmaps helm/zenbu-roadmaps -f helm/zenbu-roadmaps/values.yaml -s templates/migration-cleanup-cronjob.yaml
```

Expected: renders a CronJob with:
- schedule `"0 3 * * *"`
- serviceAccountName `zenburoadmaps-migrate-cleanup`
- image `bitnami/kubectl:1.33`
- env `NAMESPACE=zenburoadmaps-prod`, `SUCCESS_TTL=259200`
- label selector `-l app=zenburoadmaps-migrate`

- [ ] **Step 3: Verify disabled state**

```bash
helm template zenburoadmaps helm/zenbu-roadmaps -f helm/zenbu-roadmaps/values.yaml --set migration.cleanup.enabled=false -s templates/migration-cleanup-cronjob.yaml
```

Expected: empty output.

- [ ] **Step 4: Commit**

```bash
git add helm/zenbu-roadmaps/templates/migration-cleanup-cronjob.yaml
git commit -m "feat(helm): add CronJob for migration job cleanup"
```

---

### Task 5: Full Helm template validation & deploy dry-run

- [ ] **Step 1: Render all templates**

```bash
helm template zenburoadmaps helm/zenbu-roadmaps -f helm/zenbu-roadmaps/values.yaml > /tmp/rendered.yaml && echo "Template OK"
```

Expected: `Template OK`, no errors.

- [ ] **Step 2: Validate rendered YAML**

```bash
python3 -c "
import yaml, sys
docs = list(yaml.safe_load_all(open('/tmp/rendered.yaml')))
print(f'{len(docs)} documents parsed OK')
# Verify our new resources exist
names = [d['metadata']['name'] for d in docs if d]
assert 'zenburoadmaps-migrate-cleanup' in names, 'CronJob missing'
print('All expected resources present')
"
```

Expected: document count includes our new resources, assertion passes.

- [ ] **Step 3: Helm dry-run against cluster**

```bash
helm upgrade --install zenburoadmaps helm/zenbu-roadmaps \
  -n zenburoadmaps-prod \
  -f helm/zenbu-roadmaps/values.yaml \
  --dry-run
```

Expected: renders successfully, shows the new CronJob, RBAC resources, and updated migration Job with `ttlSecondsAfterFinished`.

- [ ] **Step 4: Commit all (if any uncommitted changes remain)**

```bash
git status
# If clean, skip. Otherwise:
git add -A helm/
git commit -m "feat(helm): migration job TTL cleanup — complete"
```
