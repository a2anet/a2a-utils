.PHONY: install lint typecheck test fix ci install-hooks

install:
	cd python && uv sync --group dev
	cd javascript && bun install

lint:
	cd python && uv run ruff format --check . && uv run ruff check .
	cd javascript && bun run check

typecheck:
	cd python && uv run mypy .
	cd javascript && bun run typecheck

test:
	cd python && uv run pytest --cov --cov-report=term-missing
	cd javascript && bun test --coverage

fix:
	cd python && uv run ruff format . && uv run ruff check --fix .
	cd javascript && bun run check:fix

ci: lint typecheck test

install-hooks:
	./scripts/install-git-hooks.sh
