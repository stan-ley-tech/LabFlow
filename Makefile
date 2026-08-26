.PHONY: up down restart logs ps build migrate migrate-down seed test test-unit test-integration lint fmt clean

up:
	docker compose up -d --build

down:
	docker compose down

restart:
	docker compose restart api worker externallab

logs:
	docker compose logs -f api worker externallab

ps:
	docker compose ps

build:
	docker compose build

migrate:
	npm run migrate

migrate-down:
	npm run migrate:down

seed:
	npm run seed

test:
	npm test

test-unit:
	npm run test:unit

test-integration:
	npm run test:integration

lint:
	npm run lint

fmt:
	npm run format

clean:
	docker compose down -v
