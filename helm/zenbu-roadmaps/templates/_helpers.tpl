{{- define "zenbu-roadmaps.labels" -}}
app.kubernetes.io/managed-by: Helm
app.kubernetes.io/part-of: zenbu-roadmaps
{{- end -}}

{{- define "zenbu-roadmaps.name" -}}
{{ .Values.instance.name }}
{{- end -}}
