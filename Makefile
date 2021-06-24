#Helps to have a line like %sudo ALL=(ALL) NOPASSWD: /bin/systemctl

CONTAINERS=postgis pgbouncer redis client gunicorn nginx pruner sizer

OPERATIONS=reset logs bash

IMAGES=python-bindings postgis-image client-image

GIT_VERSION=$(shell git rev-parse HEAD)

# Get python version and set yaml arguments correctly
PYTHON3_REVISION=$(shell python3 --version | grep ^Python | sed 's/^.* //g' | awk -F. '{print $$2}')
ifeq ($(shell if [ $(PYTHON3_REVISION) -ge 7 ]; then echo "7"; fi),7)
YAML_ARGS=Loader=yaml.FullLoader
else
YAML_ARGS=
endif

DOCKERHUB_USER=$(shell python3 -c 'import yaml; a = yaml.load(open("helm/tator/values.yaml", "r"),$(YAML_ARGS)); print(a["dockerRegistry"])')

SYSTEM_IMAGE_REGISTRY=$(shell python3 -c 'import yaml; a = yaml.load(open("helm/tator/values.yaml", "r"),$(YAML_ARGS)); print(a.get("systemImageRepo"))')

# default to dockerhub cvisionai organization
ifeq ($(SYSTEM_IMAGE_REGISTRY),None)
SYSTEM_IMAGE_REGISTRY=cvisionai
endif

POSTGRES_HOST=$(shell python3 -c 'import yaml; a = yaml.load(open("helm/tator/values.yaml", "r"),$(YAML_ARGS)); print(a["postgresHost"])')
POSTGRES_USERNAME=$(shell python3 -c 'import yaml; a = yaml.load(open("helm/tator/values.yaml", "r"),$(YAML_ARGS)); print(a["postgresUsername"])')
POSTGRES_PASSWORD=$(shell python3 -c 'import yaml; a = yaml.load(open("helm/tator/values.yaml", "r"),$(YAML_ARGS)); print(a["postgresPassword"])')

OBJECT_STORAGE_HOST=$(shell python3 -c 'import yaml; a = yaml.load(open("helm/tator/values.yaml", "r"),$(YAML_ARGS)); print("http://tator-minio:9000" if a["minio"]["enabled"] else a["objectStorageHost"])')
OBJECT_STORAGE_REGION_NAME=$(shell python3 -c 'import yaml; a = yaml.load(open("helm/tator/values.yaml", "r"),$(YAML_ARGS)); print("us-east-2" if a["minio"]["enabled"] else a["objectStorageRegionName"])')
OBJECT_STORAGE_BUCKET_NAME=$(shell python3 -c 'import yaml; a = yaml.load(open("helm/tator/values.yaml", "r"),$(YAML_ARGS)); print(a["minio"]["defaultBucket"]["name"] if a["minio"]["enabled"] else a["objectStorageBucketName"])')
OBJECT_STORAGE_ACCESS_KEY=$(shell python3 -c 'import yaml; a = yaml.load(open("helm/tator/values.yaml", "r"),$(YAML_ARGS)); print(a["minio"]["accessKey"] if a["minio"]["enabled"] else a["objectStorageAccessKey"])')
OBJECT_STORAGE_SECRET_KEY=$(shell python3 -c 'import yaml; a = yaml.load(open("helm/tator/values.yaml", "r"),$(YAML_ARGS)); print(a["minio"]["secretKey"] if a["minio"]["enabled"] else a["objectStorageSecretKey"])')

#############################
## Help Rule + Generic targets
#############################
.PHONY: help
help:
	@echo "Tator Online Makefile System"
	@echo  "Generic container operations: (container-action)"
	@echo "\tValid Containers:"
	@echo $(foreach  container, $(CONTAINERS), "\t\t- ${container}\n")
	@echo "\t\t- algorithm"
	@echo "\tValid Operations:"
	@echo $(foreach  operation, $(OPERATIONS), "\t\t- ${operation}\n")
	@echo "\tExample: "
	@echo "\t\tmake tator-reset"
	@echo "\nOther useful targets: "
	@echo "\t\t - collect-static : Runs collect-static on server (manage.py)."
	@echo "\t\t - migrate : Runs migrate on server (manage.py)"
	@echo "\t\t - status : Prints status of container deployment"
	@echo "\t\t - reset : Reset all pods"

	@echo "\t\t - imageQuery: Make sentinel files match docker registry"
	@echo "\t\t - imageHold: Hold sentinel files to current time"
	@echo "\t\t - imageClean: Delete sentinel files + generated dockerfiles"

# Create backup with pg_dump
backup:
	kubectl exec -it $$(kubectl get pod -l "app=postgis" -o name | head -n 1 | sed 's/pod\///') -- pg_dump -Fc -U django -d tator_online -f /backup/tator_online_$$(date +"%Y_%m_%d__%H_%M_%S")_$(GIT_VERSION).sql;

ecr_update:
	$(eval LOGIN := $(shell aws ecr get-login --no-include-email))
	$(eval KEY := $(shell echo $(LOGIN) | python3 -c 'import sys; print(sys.stdin.read().split()[5])'))
	$(LOGIN)
	echo $(KEY) | python3 -c 'import yaml; import sys; a = yaml.load(open("helm/tator/values.yaml", "r"),$(YAML_ARGS)); a["dockerPassword"] = sys.stdin.read(); yaml.dump(a, open("helm/tator/values.yaml", "w"), default_flow_style=False, default_style="|", sort_keys=False)'

# Restore database from specified backup (base filename only)
# Example:
#   make restore SQL_FILE=backup_to_use.sql DB_NAME=backup_db_name
restore: check_restore
	kubectl exec -it $$(kubectl get pod -l "app=postgis" -o name | head -n 1 | sed 's/pod\///') -- createdb -U django $(DB_NAME) 
	kubectl exec -it $$(kubectl get pod -l "app=postgis" -o name | head -n 1 | sed 's/pod\///') -- pg_restore -U django -d $(DB_NAME) /backup/$(SQL_FILE)

.PHONY: check_restore
check_restore:
	@echo -n "This will create a backup database and restore. Are you sure? [y/N] " && read ans && [ $${ans:-N} = y ]

init-logs:
	kubectl logs $$(kubectl get pod -l "app=gunicorn" -o name | head -n 1 | sed 's/pod\///') -c init-tator-online

# Top-level rule to catch user action + podname and whether it is present
# Sets pod name to the command to execute on each pod.
define generate_rule
$(1)-$(2):
	make podname=$(1) _$(2);
endef

$(foreach action,$(OPERATIONS),$(foreach container,$(CONTAINERS),$(eval $(call generate_rule,$(container),$(action)))))

# Generic handlers (variable podname is set to the requested pod)
_reset:
	kubectl delete pods -l app=$(podname)

_bash:
	kubectl exec -it $$(kubectl get pod -l "app=$(podname)" -o name | head -n 1 | sed 's/pod\///') -- /bin/bash

_logs:
	kubectl describe pod $$(kubectl get pod -l "app=$(podname)" -o name | head -n 1 | sed 's/pod\///')
	kubectl logs $$(kubectl get pod -l "app=$(podname)" -o name | head -n 1 | sed 's/pod\///') -f

django_shell:
	kubectl exec -it $$(kubectl get pod -l "app=gunicorn" -o name | head -n 1 | sed 's/pod\///') -- python3 manage.py shell


#####################################
## Custom rules below:
#####################################
.PHONY: status
status:
	kubectl get --watch pods -o wide --sort-by="{.spec.nodeName}"

.ONESHELL:

.PHONY: check-migration
check-migration:
	scripts/check-migration.sh $(pwd)

cluster: main/version.py
	$(MAKE) images cluster-deps cluster-install

cluster-deps:
	helm dependency update helm/tator

cluster-install:
#	kubectl apply -f k8s/network_fix.yaml
	kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.0.0-beta4/aio/deploy/recommended.yaml # No helm chart for this version yet
	helm install --debug --atomic --timeout 60m0s --set gitRevision=$(GIT_VERSION) tator helm/tator

cluster-upgrade: check-migration main/version.py images
	helm upgrade --debug --atomic --timeout 60m0s --set gitRevision=$(GIT_VERSION) tator helm/tator

cluster-uninstall:
	kubectl delete apiservice v1beta1.metrics.k8s.io
	kubectl delete all --namespace kubernetes-dashboard --all
	helm uninstall tator

.PHONY: clean
clean: cluster-uninstall

dashboard-token:
	kubectl -n kube-system describe secret $$(kubectl -n kube-system get secret | grep tator-kubernetes-dashboard | awk '{print $$1}')

.PHONY: tator-image
tator-image:
	$(MAKE) min-js min-css r-docs docs
	docker build --network host -t $(DOCKERHUB_USER)/tator_online:$(GIT_VERSION) -f containers/tator/Dockerfile . || exit 255
	docker push $(DOCKERHUB_USER)/tator_online:$(GIT_VERSION)

.PHONY: postgis-image
postgis-image:
	docker build --network host -t $(DOCKERHUB_USER)/tator_postgis:latest -f containers/postgis/Dockerfile . || exit 255
	docker push $(DOCKERHUB_USER)/tator_postgis:latest

# Publish client image to dockerhub so it can be used cross-cluster
.PHONY: client-image
client-image:
	docker build --network host -t $(SYSTEM_IMAGE_REGISTRY)/tator_client:$(GIT_VERSION) -f containers/tator_client/Dockerfile . || exit 255
	docker push $(SYSTEM_IMAGE_REGISTRY)/tator_client:$(GIT_VERSION)
	docker tag $(SYSTEM_IMAGE_REGISTRY)/tator_client:$(GIT_VERSION) $(SYSTEM_IMAGE_REGISTRY)/tator_client:latest
	docker push $(SYSTEM_IMAGE_REGISTRY)/tator_client:latest

.PHONY: client-latest
client-latest: client-image
	docker tag $(SYSTEM_IMAGE_REGISTRY)/tator_client:$(GIT_VERSION) cvisionai/tator_client:latest
	docker push cvisionai/tator_client:latest

.PHONY: main/version.py
main/version.py:
	./scripts/version.sh > main/version.py
	chmod +x main/version.py

collect-static: min-css min-js
	kubectl exec -it $$(kubectl get pod -l "app=gunicorn" -o name | head -n 1 |sed 's/pod\///') -- rm -rf /tator_online/main/static
	kubectl cp main/static $$(kubectl get pod -l "app=gunicorn" -o name | head -n 1 |sed 's/pod\///'):/tator_online/main
	kubectl exec -it $$(kubectl get pod -l "app=gunicorn" -o name | head -n 1 |sed 's/pod\///') -- rm -f /data/static/js/tator/tator.min.js
	kubectl exec -it $$(kubectl get pod -l "app=gunicorn" -o name | head -n 1 |sed 's/pod\///') -- rm -f /data/static/css/tator/tator.min.css
	kubectl exec -it $$(kubectl get pod -l "app=gunicorn" -o name | head -n 1 |sed 's/pod\///') -- python3 manage.py collectstatic --noinput

dev-push:
	@scripts/dev-push.sh

min-css:
	node_modules/.bin/sass main/static/css/tator/styles.scss:main/static/css/tator/tator.min.css --style compressed

FILES = \
    node-uuid.js \
    StreamSaver.js \
    zip-stream.js \
    util/get-cookie.js \
    util/identifying-attribute.js \
    util/fetch-retry.js \
    util/has-permission.js \
    util/join-params.js \
    util/filter-utilities.js \
    util/tator-data.js \
    util/same-origin-credentials.js \
    components/tator-element.js \
    components/buttons/entity-frame-link-button.js \
    components/inputs/feature/color-inputs.js \
    components/inputs/feature/thumb-inputs.js \
    components/inputs/feature/checkbox-set.js \
    components/inputs/array-input.js \
    components/inputs/user-input.js \
    components/inputs/bool-input.js \
    components/inputs/checkbox-input.js \
    components/inputs/enum-input.js \
    components/inputs/text-area.js \
    components/inputs/datetime-input.js \
    components/inputs/text-input.js \
    components/labeled-checkbox.js \
    components/markdown-div.js \
    components/svg-definitions/chevron-right.js \
    components/svg-definitions/modal-close.js \
    components/svg-definitions/modal-warning.js \
    components/svg-definitions/modal-success.js \
    components/svg-definitions/more-icon.js \
    components/svg-definitions/all-svg.js \
    components/modal-dialog.js \
    components/modal-notify.js \
    components/upload-dialog.js \
    components/announcement-dialog.js \
    components/cancel-button.js \
    components/cancel-confirm.js \
    components/canvas-ctxmenu.js \
    components/big-upload-form.js \
    components/upload-element.js \
    components/entity-gallery/entity-gallery-card.js \
    components/entity-gallery/entity-gallery-resize.js \
    components/entity-gallery/entity-gallery-aspect-ratio.js \
    components/entity-gallery/entity-gallery-paginator.js \
    components/entity-gallery/entity-gallery-labels.js \
    components/entity-gallery/entity-gallery-sort.js \
    components/entity-gallery/entity-gallery-slider.js \
    components/entity-gallery/entity-gallery_h-slide.js \
    components/entity-gallery/entity-gallery_grid.js \
    components/entity-panel/entity-panel-navigation.js \
    components/entity-panel/entity-panel-localization.js \
    components/entity-panel/entity-panel-form.js \
    components/entity-panel/entity-panel-top.js \
    components/entity-panel/entity-panel-container.js \
    components/entity-panel/entity-panel.js \
    components/header-notification.js \
    components/header-menu.js \
    components/header-user.js \
    components/header-main.js \
    components/nav-close.js \
    components/nav-back.js \
    components/nav-shortcut.js \
    components/nav-main.js \
    components/keyboard-shortcuts.js \
    components/tator-page.js \
    components/form-text.js \
    components/form-file.js \
    components/text-autocomplete.js \
    components/success-light.js \
    components/warning-light.js \
    components/name-dialog.js \
    components/filter-data-button.js \
    components/filter-condition.js \
    components/filter-condition-group.js \
    components/filter-dialog.js \
    components/filter-interface.js \
    components/filter-data.js \
    components/removable-pill.js \
    components/user-data.js \
    registration/registration-page.js \
    password-reset/password-reset-request-page.js \
    password-reset/password-reset-page.js \
    projects/settings-button.js \
    projects/project-remove.js \
    projects/project-nav.js \
    projects/project-collaborators.js \
    projects/project-description.js \
    projects/project-summary.js \
    projects/new-project.js \
    projects/new-project-dialog.js \
    projects/delete-project.js \
    projects/projects-dashboard.js \
    account-profile/account-profile.js \
    new-project/new-project-close.js \
    new-project/custom/custom-form.js \
    new-project/custom/custom.js \
    project-detail/new-algorithm-button.js \
    project-detail/algorithm-menu.js \
    project-detail/algorithm-button.js \
    project-detail/confirm-run-algorithm.js \
    project-detail/analytics-button.js \
    project-detail/activity-button.js \
    project-detail/project-text.js \
    project-detail/project-search.js \
    project-detail/new-section.js \
    project-detail/reload-button.js \
    project-detail/section-search.js \
    project-detail/section-upload.js \
    project-detail/big-download-form.js \
    project-detail/download-button.js \
    project-detail/rename-button.js \
    project-detail/toggle-button.js \
    project-detail/delete-button.js \
    project-detail/section-more.js \
    project-detail/section-card.js \
    project-detail/media-move.js \
    project-detail/media-more.js \
    project-detail/media-description.js \
    project-detail/media-card.js \
    project-detail/attachment-dialog.js \
    project-detail/section-prev.js \
    project-detail/section-next.js \
    project-detail/section-expand.js \
    project-detail/section-paginator.js \
    project-detail/section-files.js \
    project-detail/media-section.js \
    project-detail/delete-section-form.js \
    project-detail/delete-file-form.js \
    project-detail/activity-nav.js \
    project-detail/new-algorithm-form.js \
    project-detail/project-detail.js \
    components/loading-spinner.js \
    project-settings/type-form-validation.js \
    project-settings/settings-input-helpers.js \
    project-settings/settings-box-helpers.js \
    project-settings/type-delete.js \
    project-settings/type-form.js \
    project-settings/settings-nav.js \
    components/inline-warning.js \
    project-settings/single-upload.js \
    project-settings/data-media-list.js \
    project-settings/data-project-types.js \
    project-settings/data-attributes-clone.js \
    project-settings/data-memberships.js \
    project-settings/type-new.js \
    project-settings/attributes-clone.js \
    project-settings/attributes-main.js \
    project-settings/attributes-form.js \
    project-settings/attributes-delete.js \
    project-settings/media-type-main-edit.js \
    project-settings/project-delete.js \
    project-settings/project-main-edit.js \
    project-settings/localization-type-edit.js \
    project-settings/leaf-type-edit.js \
    project-settings/state-type-edit.js \
    project-settings/membership-edit.js \
    project-settings/project-settings.js \
    annotation/annotation-breadcrumbs.js \
    annotation/lock-button.js \
    annotation/fill-boxes-button.js \
    annotation/toggle-text-button.js \
    annotation/media-capture-button.js \
    annotation/bookmark-button.js \
    annotation/media-link-button.js \
    annotation/media-prev-button.js \
    annotation/media-next-button.js \
    annotation/zoom-control.js \
    annotation/rate-control.js \
    annotation/quality-control.js \
    annotation/annotation-settings.js \
    annotation/edit-button.js \
    annotation/box-button.js \
    annotation/line-button.js \
    annotation/point-button.js \
    annotation/track-button.js \
    annotation/zoom-in-button.js \
    annotation/zoom-out-button.js \
    annotation/pan-button.js \
    annotation/annotation-sidebar.js \
    annotation/rewind-button.js \
    annotation/play-button.js \
    annotation/fast-forward-button.js \
    annotation/frame-prev.js \
    annotation/frame-next.js \
    annotation/timeline-canvas.js \
    annotation/timeline-d3.js \
    annotation/video-fullscreen.js \
    annotator/FrameBuffer.js \
    annotator/drawGL_colors.js \
    annotator/drawGL.js \
    annotator/annotation.js \
    annotator/video.js \
    annotator/image.js \
    annotator/live-video.js \
    annotation/annotation-player.js \
    annotation/annotation-image.js \
    annotation/annotation-multi.js \
    annotation/annotation-live.js \
    annotation/attribute-panel.js \
    annotation/modify-track-dialog.js \
    annotation/progress-dialog.js \
    annotation/favorite-button.js \
    annotation/favorites-panel.js \
    annotation/save-dialog.js \
    annotation/entity-button.js \
    annotation/media-panel.js \
    annotation/frame-panel.js \
    annotation/annotation-search.js \
    annotation/entity-browser.js \
    annotation/entity-prev-button.js \
    annotation/entity-next-button.js \
    annotation/entity-delete-button.js \
    annotation/entity-redraw-button.js \
    annotation/entity-frame-button.js \
    annotation/entity-track-button.js \
    annotation/entity-more.js \
    annotation/entity-selector.js \
    annotation/annotation-browser.js \
    annotation/undo-buffer.js \
    annotation/annotation-data.js \
    annotation/annotation-page.js \
    annotation/seek-bar.js \
    annotation/version-button.js \
    annotation/version-select.js \
    annotation/version-dialog.js \
    annotation/video-settings-dialog.js \
    annotation/volume-control.js \
    analytics/analytics-breadcrumbs.js \
    analytics/analytics-settings.js \
    analytics/dashboard/dashboard.js \
    analytics/annotations/card.js \
    analytics/annotations/gallery.js \
    analytics/annotations/panel-data.js \
    analytics/annotations/card-data.js \
    analytics/annotations/annotations.js \
    analytics/collections/slide-data.js \
    analytics/collections/card.js \
    analytics/collections/gallery.js \
    analytics/collections/collections.js \
    analytics/collections/collections-data.js \
    analytics/visualization/visualization.js \
    analytics/reports/reports.js \
    third_party/autocomplete.js \
    third_party/webrtcstreamer.js \
    utilities.js

JSDIR = main/static/js
OUTDIR = main/static/js/tator

define generate_minjs
.min_js/${1:.js=.min.js}: $(JSDIR)/${1}
	@mkdir -p .min_js/$(shell dirname ${1})
	@echo "Building '${1:.js=.min.js}'"
	node_modules/.bin/babel-minify $(JSDIR)/${1} -o .min_js/${1:.js=.min.js}
endef
$(foreach file,$(FILES),$(eval $(call generate_minjs,$(file))))


USE_MIN_JS=$(shell python3 -c 'import yaml; a = yaml.load(open("helm/tator/values.yaml", "r"),$(YAML_ARGS)); print(a.get("useMinJs","True"))')
ifeq ($(USE_MIN_JS),True)
min-js:
	@echo "Building min-js file, because USE_MIN_JS is true"
	mkdir -p $(OUTDIR)
	rm -f $(OUTDIR)/tator.min.js
	mkdir -p .min_js
	@$(foreach file,$(FILES),make --no-print-directory .min_js/$(file:.js=.min.js); cat .min_js/$(file:.js=.min.js) >> $(OUTDIR)/tator.min.js;)
else
min-js:
	@echo "Skipping min-js, because USE_MIN_JS is false"
endif

migrate:
	kubectl exec -it $$(kubectl get pod -l "app=gunicorn" -o name | head -n 1 | sed 's/pod\///') -- python3 manage.py makemigrations
	kubectl exec -it $$(kubectl get pod -l "app=gunicorn" -o name | head -n 1 | sed 's/pod\///') -- python3 manage.py migrate

testinit:
	kubectl exec -it $$(kubectl get pod -l "app=postgis" -o name | head -n 1 | sed 's/pod\///') -- psql -U django -d tator_online -c 'CREATE DATABASE test_tator_online';
	kubectl exec -it $$(kubectl get pod -l "app=postgis" -o name | head -n 1 | sed 's/pod\///') -- psql -U django -d test_tator_online -c 'CREATE EXTENSION LTREE';

test:
	kubectl exec -it $$(kubectl get pod -l "app=gunicorn" -o name | head -n 1 | sed 's/pod\///') -- python3 -c 'from elasticsearch import Elasticsearch; import os; es = Elasticsearch(host=os.getenv("ELASTICSEARCH_HOST")).indices.delete("test*")'
	kubectl exec -it $$(kubectl get pod -l "app=gunicorn" -o name | head -n 1 | sed 's/pod\///') -- sh -c 'ELASTICSEARCH_PREFIX=test python3 manage.py test --keep'

.PHONY: cache_clear
cache-clear:
	kubectl exec -it $$(kubectl get pod -l "app=gunicorn" -o name | head -n 1 | sed 's/pod\///') -- python3 -c 'from main.cache import TatorCache;TatorCache().invalidate_all()'

.PHONY: cleanup-evicted
cleanup-evicted:
	kubectl get pods | grep Evicted | awk '{print $$1}' | xargs kubectl delete pod

# Example:
#   make build-search-indices MAX_AGE_DAYS=365
.PHONY: build-search-indices
build-search-indices:
	argo submit workflows/build-search-indices.yaml --parameter-file helm/tator/values.yaml -p version="$(GIT_VERSION)" -p dockerRegistry="$(DOCKERHUB_USER)" -p maxAgeDays="$(MAX_AGE_DAYS)" -p objectStorageHost="$(OBJECT_STORAGE_HOST)" -p objectStorageRegionName="$(OBJECT_STORAGE_REGION_NAME)" -p objectStorageBucketName="$(OBJECT_STORAGE_BUCKET_NAME)" -p objectStorageAccessKey="$(OBJECT_STORAGE_ACCESS_KEY)" -p objectStorageSecretKey="$(OBJECT_STORAGE_SECRET_KEY)"

.PHONY: s3-migrate
s3-migrate:
	argo submit workflows/s3-migrate.yaml --parameter-file helm/tator/values.yaml -p version="$(GIT_VERSION)" -p dockerRegistry="$(DOCKERHUB_USER)"

.PHONY: s3-verify
s3-verify:
	argo submit workflows/s3-verify.yaml --parameter-file helm/tator/values.yaml -p version="$(GIT_VERSION)" -p dockerRegistry="$(DOCKERHUB_USER)"

.PHONY: efs-delete
efs-delete:
	argo submit workflows/efs-delete.yaml --parameter-file helm/tator/values.yaml -p version="$(GIT_VERSION)" -p dockerRegistry="$(DOCKERHUB_USER)"

.PHONY: clean_js
clean_js:
	rm -rf .min_js

.PHONY: images
images:
	make ${IMAGES}

lazyPush:
	rsync -a -e ssh --exclude main/migrations --exclude main/__pycache__ main adamant:/home/brian/working/tator_online

.PHONY: python-bindings-only
python-bindings-only:
	docker run -it --rm -e DJANGO_SECRET_KEY=asdf -e ELASTICSEARCH_HOST=127.0.0.1 -e TATOR_DEBUG=false -e TATOR_USE_MIN_JS=false $(DOCKERHUB_USER)/tator_online:$(GIT_VERSION) python3 manage.py getschema > scripts/packages/tator-py/schema.yaml
	cd scripts/packages/tator-py
	rm -rf dist
	python3 setup.py sdist bdist_wheel
	cd ../../..

.PHONY: python-bindings
python-bindings: tator-image
	docker run -it --rm -e DJANGO_SECRET_KEY=asdf -e ELASTICSEARCH_HOST=127.0.0.1 -e TATOR_DEBUG=false -e TATOR_USE_MIN_JS=false $(DOCKERHUB_USER)/tator_online:$(GIT_VERSION) python3 manage.py getschema > scripts/packages/tator-py/schema.yaml
	cd scripts/packages/tator-py
	rm -rf dist
	python3 setup.py sdist bdist_wheel
	cd ../../..

.PHONY: r-docs
r-docs:
	docker inspect --type=image $(DOCKERHUB_USER)/tator_online:$(GIT_VERSION) && \
	docker run -it --rm -e DJANGO_SECRET_KEY=asdf -e ELASTICSEARCH_HOST=127.0.0.1 -e TATOR_DEBUG=false -e TATOR_USE_MIN_JS=false $(DOCKERHUB_USER)/tator_online:$(GIT_VERSION) python3 manage.py getschema > scripts/packages/tator-r/schema.yaml
	rm -rf scripts/packages/tator-r/tmp
	mkdir -p scripts/packages/tator-r/tmp
	./scripts/packages/tator-r/codegen.py $(shell pwd)/scripts/packages/tator-r/schema.yaml
	docker run -it --rm \
		-v $(shell pwd)/scripts/packages/tator-r:/pwd \
		-v $(shell pwd)/scripts/packages/tator-r/tmp:/out openapitools/openapi-generator-cli:v5.0.0-beta \
		generate -c /pwd/config.json \
		-i /pwd/schema.yaml \
		-g r -o /out/tator-r-new-bindings -t /pwd/templates
	docker run -it --rm \
		-v $(shell pwd)/scripts/packages/tator-r/tmp:/out openapitools/openapi-generator-cli:v5.0.0-beta \
		/bin/sh -c "chown -R nobody:nogroup /out"
	rm -f scripts/packages/tator-r/R/generated_*
	rm scripts/packages/tator-r/schema.yaml
	cd $(shell pwd)/scripts/packages/tator-r/tmp/tator-r-new-bindings/R && \
		for f in $$(ls -l | awk -F':[0-9]* ' '/:/{print $$2}'); do cp -- "$$f" "../../../R/generated_$$f"; done
	docker run -it --rm \
		-v $(shell pwd)/scripts/packages/tator-r:/tator \
		rocker/tidyverse:latest \
		/bin/sh -c "R --slave -e \"devtools::install_deps('/tator')\"; \
		R CMD build tator; R CMD INSTALL tator_*.tar.gz; \
		R --slave -e \"install.packages('pkgdown')\"; \
		Rscript -e \"devtools::document('tator')\"; \
		Rscript -e \"pkgdown::build_site('tator')\"; \
		chown -R $(shell id -u):$(shell id -g) /tator"
	rm -rf $(shell pwd)/doc/_build/html/tator-r
	cp -r $(shell pwd)/scripts/packages/tator-r/docs $(shell pwd)/doc/_build/html/tator-r
	touch $(shell pwd)/doc/tator-r/overview.rst
	touch $(shell pwd)/doc/tator-r/reference/api.rst
	cd ../../..

TOKEN=$(shell cat token.txt)
HOST=$(shell python3 -c 'import yaml; a = yaml.load(open("helm/tator/values.yaml", "r"),$(YAML_ARGS)); print("https://" + a["domain"])')
.PHONY: pytest
pytest:
	cd scripts/packages/tator-py && pip3 install . --upgrade && pytest --full-trace --host $(HOST) --token $(TOKEN)

.PHONY: pylint
pylint:
	docker run -it --rm -v $(shell pwd):/pwd localhost:5000/tator_online:$(GIT_VERSION) pylint --rcfile /pwd/pylint.ini --load-plugins pylint_django /pwd/main

.PHONY: letsencrypt
letsencrypt:
	kubectl exec -it $$(kubectl get pod -l "app=gunicorn" -o name | head -n 1 | sed 's/pod\///') -- env DOMAIN=$(DOMAIN) env DOMAIN_KEY=$(DOMAIN_KEY) env SIGNED_CHAIN=$(SIGNED_CHAIN) env KEY_SECRET_NAME=$(KEY_SECRET_NAME) env CERT_SECRET_NAME=$(CERT_SECRET_NAME) scripts/cert/letsencrypt.sh 

.PHONY: selfsigned
selfsigned:
	kubectl exec -it $$(kubectl get pod -l "app=gunicorn" -o name | head -n 1 | sed 's/pod\///') -- env DOMAIN=$(DOMAIN) env DOMAIN_KEY=$(DOMAIN_KEY) env SIGNED_CHAIN=$(SIGNED_CHAIN) env KEY_SECRET_NAME=$(KEY_SECRET_NAME) env CERT_SECRET_NAME=$(CERT_SECRET_NAME) scripts/cert/selfsigned.sh

.PHONY: docs
docs:
	make -C doc html

.PHONY: check_schema
check_schema: tator-image
	docker run -it --rm -e DJANGO_SECRET_KEY=1337 -e ELASTICSEARCH_HOST=127.0.0.1 -e TATOR_DEBUG=false -e TATOR_USE_MIN_JS=false localhost:5000/tator_online:$(GIT_VERSION) python3 manage.py getschema

ifdef PROJECT_ID
ANNOUNCE_CMD=python3 manage.py announce --file /tmp/announce.md --project $(PROJECT_ID)
else ifdef USER_ID
ANNOUNCE_CMD=python3 manage.py announce --file /tmp/announce.md --user $(USER_ID)
else
ANNOUNCE_CMD=python3 manage.py announce --file /tmp/announce.md
endif
# Makes an announcement
# System-wide announcement:
# make announce FILE=blah.md
# Project-wide announcement:
# make announce FILE=blah.md PROJECT_ID=1
# User-specific announcement:
# make announce FILE=blah.md USER_ID=1
.PHONY: announce
announce:
	kubectl cp $(FILE) $$(kubectl get pod -l "app=gunicorn" -o name | head -n 1 | sed 's/pod\///'):/tmp/announce.md
	kubectl exec $$(kubectl get pod -l "app=gunicorn" -o name | head -n 1 | sed 's/pod\///') -- $(ANNOUNCE_CMD) 
