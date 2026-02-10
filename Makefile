.PHONY: format lint type-check quality-check check-format

format:
	black src/cuepoint
	isort src/cuepoint

lint:
	pylint src/cuepoint
	flake8 src/cuepoint

type-check:
	mypy src/cuepoint

quality-check: format lint type-check
	@echo "All quality checks passed!"

check-format:
	black --check src/cuepoint
	isort --check-only src/cuepoint
