.PHONY: install lint typecheck test

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
