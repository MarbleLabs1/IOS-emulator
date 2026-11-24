# Makefile for the QEMU emulator manager (Go API). Run from linux-emulator-server/.

APP_NAME := qemu-ios-emulator
VERSION  := 2.0.0
BIN_DIR  := bin
PKG      := ./cmd/manager

GO       := go
LDFLAGS  := -s -w -X main.Version=$(VERSION) -X main.BuildTime=$(shell date -u +%Y-%m-%dT%H:%M:%SZ)

.DEFAULT_GOAL := help
.PHONY: help build build-static release deps test test-coverage vet fmt lint run vm-setup vm-run ui clean docker-build docker-run docker-stop

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-16s %s\n", $$1, $$2}'

## Build

build: ## Build the manager into bin/
	@mkdir -p $(BIN_DIR)
	$(GO) build -ldflags "$(LDFLAGS)" -o $(BIN_DIR)/$(APP_NAME) $(PKG)
	@echo "Built $(BIN_DIR)/$(APP_NAME)"

build-static: ## Build a static binary (no libc dependency)
	@mkdir -p $(BIN_DIR)
	CGO_ENABLED=0 $(GO) build -ldflags "$(LDFLAGS)" -o $(BIN_DIR)/$(APP_NAME)-static $(PKG)

release: ## Cross-compile Linux and macOS binaries into bin/release/
	@mkdir -p $(BIN_DIR)/release
	GOOS=linux  GOARCH=amd64 CGO_ENABLED=0 $(GO) build -ldflags "$(LDFLAGS)" -o $(BIN_DIR)/release/$(APP_NAME)-linux-amd64  $(PKG)
	GOOS=linux  GOARCH=arm64 CGO_ENABLED=0 $(GO) build -ldflags "$(LDFLAGS)" -o $(BIN_DIR)/release/$(APP_NAME)-linux-arm64  $(PKG)
	GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 $(GO) build -ldflags "$(LDFLAGS)" -o $(BIN_DIR)/release/$(APP_NAME)-darwin-amd64 $(PKG)
	GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 $(GO) build -ldflags "$(LDFLAGS)" -o $(BIN_DIR)/release/$(APP_NAME)-darwin-arm64 $(PKG)

ui: ## Build the web dashboard (output: ../dist)
	cd .. && npm ci && npm run build

## Quality

deps: ## Download and verify Go modules
	$(GO) mod download
	$(GO) mod verify

test: ## Run tests with the race detector
	$(GO) test -race -count=1 ./...

test-coverage: ## Run tests and write coverage.html
	$(GO) test -race -coverprofile=coverage.out ./...
	$(GO) tool cover -html=coverage.out -o coverage.html

vet: ## Run go vet
	$(GO) vet ./...

fmt: ## Format Go code
	$(GO) fmt ./...

lint: ## Run golangci-lint
	golangci-lint run ./...

## Run

run: build ## Build and run the manager (API on 127.0.0.1:8080)
	EMULATOR_RUNNER=$(CURDIR)/src/scripts/enhanced-run.sh MANAGER_STATIC_DIR=$(CURDIR)/../dist ./$(BIN_DIR)/$(APP_NAME)

vm-setup: ## Install QEMU (ARM64) and UEFI firmware (Debian/Ubuntu, Fedora, Arch)
	bash src/scripts/advanced-setup.sh

vm-run: ## Boot a test VM named "default" (set ISO=/path/installer.iso to install an OS)
	bash src/scripts/enhanced-run.sh --name default $(if $(ISO),--iso $(ISO),)

## Docker (from the repository root)

docker-build: ## Build the container image
	docker compose -f ../docker-compose.qemu.yml build

docker-run: ## Run the container (needs MANAGER_TOKEN in ../.env)
	docker compose -f ../docker-compose.qemu.yml up -d

docker-stop: ## Stop the container
	docker compose -f ../docker-compose.qemu.yml down

clean: ## Remove build artifacts
	rm -rf $(BIN_DIR) coverage.out coverage.html
	$(GO) clean
