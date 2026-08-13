.PHONY: help dev dev-build dev-down dev-clean install test lint format db-migrate db-seed db-reset logs

# Default target
help:
	@echo "Open Banking MVP - Available Commands"
	@echo "======================================"
	@echo "make dev          - Start development environment"
	@echo "make dev-build    - Build and start development environment"
	@echo "make dev-down     - Stop development environment"
	@echo "make dev-clean    - Stop and remove all containers and volumes"
	@echo "make install      - Install dependencies"
	@echo "make test         - Run all tests"
	@echo "make lint         - Run linter"
	@echo "make format       - Format code"
	@echo "make db-migrate   - Run database migrations"
	@echo "make db-seed      - Seed database with sample data"
	@echo "make db-reset     - Reset database (migrate + seed)"
	@echo "make logs         - View all container logs"

# Development commands
dev:
	docker-compose up

dev-build:
	docker-compose up --build

dev-down:
	docker-compose down

dev-clean:
	docker-compose down -v
	@echo "All containers and volumes removed"

# Install dependencies
install:
	npm install

# Testing
test:
	npm run test

test-auth:
	npm run test:auth

test-consent:
	npm run test:consent

test-gateway:
	npm run test:gateway

test-integration:
	npm run test:integration

# Code quality
lint:
	npm run lint

format:
	npm run format

format-check:
	npm run format:check

# Database operations
db-migrate:
	docker-compose exec banking-api npm run db:migrate

db-seed:
	docker-compose exec banking-api npm run db:seed

db-reset:
	docker-compose exec banking-api npm run db:reset

# Logs
logs:
	docker-compose logs -f

logs-api:
	docker-compose logs -f banking-api

logs-consent:
	docker-compose logs -f customer-consent

logs-fintech:
	docker-compose logs -f fintech-demo

logs-gateway:
	docker-compose logs -f api-gateway

# Setup
setup: install
	@echo "Copying environment file..."
	@if [ ! -f .env ]; then cp .env.example .env; echo ".env file created"; else echo ".env already exists"; fi
	@echo "Setup complete! Edit .env file and run 'make dev' to start"

# Made with Bob
