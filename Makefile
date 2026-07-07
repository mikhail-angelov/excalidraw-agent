IMAGE_NAME = ghcr.io/mikhail-angelov/excalidraw-agent:latest

.PHONY: build push deploy logs status

build:
	docker build -t $(IMAGE_NAME) .

push: build
	docker push $(IMAGE_NAME)

deploy:
	ssh $(VPS_USER)@$(VPS_HOST) "cd $(VPS_PATH) && docker compose pull && docker compose up -d"

logs:
	ssh $(VPS_USER)@$(VPS_HOST) "cd $(VPS_PATH) && docker compose logs -f"

status:
	ssh $(VPS_USER)@$(VPS_HOST) "cd $(VPS_PATH) && docker compose ps"
