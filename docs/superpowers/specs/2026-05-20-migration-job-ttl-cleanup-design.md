# Migration Job TTL Cleanup Design

## Summary

Migration jobs in `zenburoadmaps-prod` accumulate indefinitely because the current `helm.sh/hook-delete-policy: before-hook-creation` never fires (job names include the release revision number, so each deploy creates a uniquely-named job that never matches the previous one). This design introduces automatic cleanup with differentiated retention: **successful jobs are deleted after 3 days, failed jobs after 7 days**.

## Approach: Hybrid (K8s TTL + CronJob)

1. **`ttlSecondsAfterFinished` on the migration Job** — 7-day fallback for all jobs (success or failure). Guarantees no job lives forever, even if the CronJob is down.
2. **CronJob cleaner** — runs daily, deletes successful jobs older than 3 days. Provides the differentiated TTL that `ttlSecondsAfterFinished` alone cannot.
3. **RBAC** — namespace-scoped ServiceAccount + Role + RoleBinding with minimal permissions (`get`, `list`, `delete` on `batch/jobs`).

### Why not alternatives

| Alternative | Rejected because |
|---|---|
| `ttlSecondsAfterFinished` only | Cannot differentiate success vs failure TTL |
| CronJob only | No fallback if CronJob fails; jobs could accumulate again |
| Fix `hook-delete-policy` only | Would delete the previous job immediately on next deploy, not retain for 3 days |

## Changes

### 1. Modify `helm/zenbu-roadmaps/templates/migration-job.yaml`

- Add `spec.ttlSecondsAfterFinished: {{ .Values.migration.ttlSecondsAfterFinished }}` (default 604800 = 7 days)
- Remove annotation `helm.sh/hook-delete-policy: before-hook-creation` (ineffective due to revision-based naming)
- Add label `app: {{ include "zenbu-roadmaps.name" . }}-migrate` to the Job metadata (for CronJob's label selector)

### 2. New file `helm/zenbu-roadmaps/templates/migration-cleanup-cronjob.yaml`

Conditional on `{{ if .Values.migration.cleanup.enabled }}`.

```yaml
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
                  kubectl get jobs -n $NAMESPACE -l app={{ include "zenbu-roadmaps.name" . }}-migrate \
                    --field-selector status.successful=1 -o json \
                  | jq -r --argjson ttl $SUCCESS_TTL '
                      .items[]
                      | select(.status.completionTime)
                      | select((now - (.status.completionTime | fromdateiso8601)) > $ttl)
                      | .metadata.name
                    ' \
                  | xargs -r kubectl delete job -n $NAMESPACE
                  echo "Cleanup complete."
              env:
                - name: NAMESPACE
                  value: {{ .Values.namespace }}
                - name: SUCCESS_TTL
                  value: {{ .Values.migration.cleanup.successTTLSeconds | quote }}
          restartPolicy: OnFailure
```

### 3. New file `helm/zenbu-roadmaps/templates/migration-cleanup-rbac.yaml`

Conditional on `{{ if .Values.migration.cleanup.enabled }}`.

Contains three resources:

- **ServiceAccount**: `{{ name }}-migrate-cleanup`
- **Role**: `batch/jobs` with verbs `get`, `list`, `delete` (namespace-scoped)
- **RoleBinding**: binds the Role to the ServiceAccount

### 4. Modify `helm/zenbu-roadmaps/values.yaml`

Add `migration` section:

```yaml
migration:
  ttlSecondsAfterFinished: 604800  # 7 days fallback (all jobs)
  cleanup:
    enabled: true
    schedule: "0 3 * * *"
    successTTLSeconds: 259200      # 3 days for successful jobs
    image: bitnami/kubectl:1.33
```

## Cleanup Timeline

```
Day 0:  helm upgrade → migration job runs and completes
Day 3:  CronJob deletes job (if successful)
Day 7:  TTL controller deletes job (if failed, or CronJob missed it)
```

## File Summary

| Action | File |
|---|---|
| Modify | `helm/zenbu-roadmaps/templates/migration-job.yaml` |
| Modify | `helm/zenbu-roadmaps/values.yaml` |
| Create | `helm/zenbu-roadmaps/templates/migration-cleanup-cronjob.yaml` |
| Create | `helm/zenbu-roadmaps/templates/migration-cleanup-rbac.yaml` |

## Constraints

- CronJob image `bitnami/kubectl:1.33` must have `jq` available (bitnami/kubectl includes it).
- The `app` label on migration jobs is the CronJob's selector — if the label naming changes, the cleanup script breaks.
- RBAC is namespace-scoped (Role, not ClusterRole) — safe for multi-tenant clusters.
- `ttlSecondsAfterFinished` requires K8s 1.23+ (server is 1.33, confirmed).
