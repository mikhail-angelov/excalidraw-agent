HOST ?= $(shell grep '^HOST=' .env 2>/dev/null | cut -d '=' -f 2)
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
	ssh root@$(HOST) "cd /opt/excalidraw-agent && docker compose pull && docker compose up -d"

logs:
	ssh root@$(HOST) "cd /opt/excalidraw-agent && docker compose logs -f"

status:
	ssh root@$(HOST) "cd /opt/excalidraw-agent && docker compose ps"
