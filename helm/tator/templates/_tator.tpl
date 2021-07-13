{{ define "tator.template" }}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .name }}
  labels:
    app: {{ .app }}
    type: web
spec:
  selector:
    matchLabels:
      app: {{ .app }}
      type: web
  replicas: {{ .replicas }}
  template:
    metadata:
      labels:
        app: {{ .app }}
        type: web
    spec:
      terminationGracePeriodSeconds: 60
      nodeSelector:
        {{ .selector }}
      containers:
        - name: tator-online
          image: {{ .Values.dockerRegistry }}/tator_online:{{ .Values.gitRevision }}
          imagePullPolicy: "Always"
          command: {{ .command }}
          args: {{ .args }}
          resources:
            limits:
              cpu: {{ .Values.gunicornCpuLimit | default "4000m" }}
              memory: {{ .Values.gunicornMemoryLimit | default "16Gi" }}
            requests:
              cpu: {{ .Values.gunicornCpuRequest | default "1000m" }}
              memory: {{ .Values.gunicornMemoryRequest | default "4Gi" }}
          env:
            - name: DJANGO_SECRET_KEY
              valueFrom:
                secretKeyRef:
                  name: tator-secrets
                  key: djangoSecretKey
            - name: POSTGRES_HOST
              value: {{ .Values.postgresHost }}
            - name: POSTGRES_USERNAME
              value: {{ .Values.postgresUsername }}
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: tator-secrets
                  key: postgresPassword
            - name: REDIS_HOST
              value: {{ .Values.redisHost }}
            - name: ELASTICSEARCH_HOST
              value: {{ .Values.elasticsearchHost }}
            - name: MAIN_HOST
              value: {{ .Values.domain }}
            - name: DOCKER_USERNAME
              value: {{ .Values.dockerUsername }}
            - name: DOCKER_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: tator-secrets
                  key: dockerPassword
            - name: DOCKER_REGISTRY
              value: {{ .Values.dockerRegistry }}
            - name: SYSTEM_IMAGES_REGISTRY
              value: {{ .Values.systemImageRepo | default "cvisionai" | quote }}
            {{- if .Values.minio.enabled }}
            - name: OBJECT_STORAGE_HOST
              value: http://tator-minio:9000
            - name: OBJECT_STORAGE_EXTERNAL_HOST
              value: {{ .Values.domain }}/objects
            - name: OBJECT_STORAGE_REGION_NAME
              value: {{ .Values.objectStorageRegionName | default "us-east-2" | quote }}
            - name: BUCKET_NAME
              value: {{ .Values.minio.defaultBucket.name }}
            - name: OBJECT_STORAGE_ACCESS_KEY
              value: {{ .Values.minio.accessKey }}
            - name: OBJECT_STORAGE_SECRET_KEY
              value: {{ .Values.minio.secretKey }}
            {{- else }}
            - name: OBJECT_STORAGE_HOST
              value: {{ .Values.objectStorageHost }}
            - name: OBJECT_STORAGE_REGION_NAME
              value: {{ .Values.objectStorageRegionName | default "us-east-2" | quote }}
            - name: BUCKET_NAME
              value: {{ .Values.objectStorageBucketName }}
            - name: OBJECT_STORAGE_ACCESS_KEY
              value: {{ .Values.objectStorageAccessKey }}
            - name: OBJECT_STORAGE_SECRET_KEY
              value: {{ .Values.objectStorageSecretKey }}
            {{- end }}
            - name: TATOR_DEBUG
            {{- if .Values.tatorDebug }}
              value: "true"
            {{- else }}
              value: "false"
            {{- end }}
            - name: TATOR_USE_MIN_JS
            {{- if .Values.useMinJs }}
              value: "true"
            {{- else }}
              value: "false"
            {{- end }}
            - name: REQUIRE_HTTPS
              {{- if .Values.requireHttps }}
              value: "TRUE"
              {{- else }}
              value: "FALSE"
              {{- end }}
            - name: TRANSCODER_MAX_RAM_DISK_SIZE
              value: {{ .Values.transcoderMaxRamDiskSize | default "8Gi" | quote }}
            - name: TRANSCODER_CPU_LIMIT
              value: {{ .Values.transcoderCpuLimit | default "4000m" | quote }}
            - name: TRANSCODER_MEMORY_LIMIT
              value: {{ .Values.transcoderMemoryLimit | default "8Gi" | quote }}
            - name: POD_GC_STRATEGY
              value: {{ .Values.podGCStrategy | default "OnPodCompletion" | quote }}
            - name: WORKFLOW_STORAGE_CLASSES
              {{- if hasKey .Values "workflowStorageClasses" }}
              {{- $storage_classes := "" }}
              {{- range .Values.workflowStorageClasses }}
              {{- $storage_classes = cat $storage_classes "," . }}
              {{- end }}
              {{- $storage_classes = nospace $storage_classes }}
              {{- $storage_classes = trimPrefix "," $storage_classes }}
              value: {{ $storage_classes }}
              {{- else }}
              value: nfs-client
              {{- end }}
            - name: SCRATCH_STORAGE_CLASS
              value: {{ .Values.scratchStorageClass | default "nfs-client" | quote }}
            {{- if hasKey .Values "slackToken" }}
            - name: TATOR_SLACK_TOKEN
              valueFrom:
                secretKeyRef:
                  name: tator-secrets
                  key: slackToken
            - name: TATOR_SLACK_CHANNEL
              valueFrom:
                secretKeyRef:
                  name: tator-secrets
                  key: slackChannel
            {{- end }}
            {{- if .Values.email.enabled }}
            - name: TATOR_EMAIL_ENABLED
              value: "true"
            - name: TATOR_EMAIL_SENDER
              value: {{ .Values.email.sender }}
            - name: TATOR_EMAIL_AWS_REGION
              value: {{ .Values.email.aws_region }}
            - name: TATOR_EMAIL_AWS_ACCESS_KEY_ID
              value: {{ .Values.email.aws_access_key_id }}
            - name: TATOR_EMAIL_AWS_SECRET_ACCESS_KEY
              value: {{ .Values.email.aws_secret_access_key }}
            {{- else }}
            - name: TATOR_EMAIL_ENABLED
              value: "false"
            {{- end }}
            {{- if .Values.remoteTranscodes.enabled }}
            - name: REMOTE_TRANSCODE_HOST
              value: {{ .Values.remoteTranscodes.host }}
            - name: REMOTE_TRANSCODE_PORT
              value: {{ .Values.remoteTranscodes.port | quote }}
            - name: REMOTE_TRANSCODE_TOKEN
              valueFrom:
                secretKeyRef:
                  name: tator-secrets
                  key: remoteTranscodeToken
            - name: REMOTE_TRANSCODE_CERT
              value: /remote_transcodes/ca.crt
            {{- end }}
            - name: POD_NAME
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
            - name: COGNITO_ENABLED
            {{- if .Values.cognito.enabled }}
              value: "TRUE"
            {{- else }}
              value: "FALSE"
            {{- end }}
            - name: ANONYMOUS_REGISTRATION_ENABLED
            {{- if hasKey .Values "anonymousRegistration" }}
            {{- if .Values.anonymousRegistration.enabled }}
              value: "TRUE"
            - name: EMAIL_CONFIRMATION
            {{- if .Values.anonymousRegistration.emailConfirmation }}
              value: "TRUE"
            {{- else }}
              value: "FALSE"
            {{- end }}
            {{- else }}
              value: "FALSE"
            {{- end }}
            {{- else }}
              value: "FALSE"
            {{- end }}
            {{- if hasKey .Values "organizations" }}
            {{- if .Values.organizations.autocreate }}
            - name: AUTOCREATE_ORGANIZATIONS
              value: "TRUE"
            {{- end }}
            {{- if .Values.organizations.allowPost }}
            - name: ALLOW_ORGANIZATION_POST
              value: "TRUE"
            {{- end }}
            {{- end }}
          ports:
            - containerPort: 8000
              name: gunicorn
          volumeMounts:
            {{ include "volumeMounts.template" . | indent 12 }}
            {{- if .Values.cognito.enabled }}
            - mountPath: /cognito
              name: cognito-config
              readOnly: true
            {{- end }}
      initContainers:
        - name: redis
          image: redis
          imagePullPolicy: "IfNotPresent"
          command: ["redis-cli"]
          args: ["-h", {{ .Values.redisHost | quote }}, "-p", "6379", "ping"]
      volumes:
        {{ include "volumes.template" . | indent 8 }}
        {{- if .Values.cognito.enabled }}
        - name: cognito-config
          secret:
            secretName: tator-secrets
            items:
              - key: cognito-config
                path: cognito.yaml
        {{- end }}
{{ end }}
