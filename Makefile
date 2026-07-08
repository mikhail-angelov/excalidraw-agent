IMAGE_NAME = ghcr.io/mikhail-angelov/excalidraw-agent:latest

.PHONY: build dist push deploy logs status

dist:
	npm ci && npm run build

build: dist
	docker build -t $(IMAGE_NAME) .

push: build
	docker push $(IMAGE_NAME)


install:
	@echo "Installing server..."
	-ssh root@$(HOST) "mkdir -p /opt/excalidraw-agent"
	scp ./.env root@$(HOST):/opt/excalidraw-agent/.env
	scp ./docker-compose.yml root@$(HOST):/opt/excalidraw-agent/docker-compose.yml

deploy:
	ssh $(VPS_USER)@$(VPS_HOST) "cd $(VPS_PATH) && docker compose pull && docker compose up -d"

logs:
	ssh $(VPS_USER)@$(VPS_HOST) "cd $(VPS_PATH) && docker compose logs -f"

status:
	ssh $(VPS_USER)@$(VPS_HOST) "cd $(VPS_PATH) && docker compose ps"
