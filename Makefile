.PHONY: format lint type-check quality-check check-format

format:
	black SRC/cuepoint
	isort SRC/cuepoint

lint:
	pylint SRC/cuepoint
	flake8 SRC/cuepoint

type-check:
	mypy SRC/cuepoint

quality-check: format lint type-check
	@echo "All quality checks passed!"

check-format:
	black --check SRC/cuepoint
	isort --check-only SRC/cuepoint
