# Quality Checks - Simple Guide

## Format code

```bash
python -m black SRC/cuepoint

python -m isort SRC/cuepoint
```

## Check formatting (without modifying)

```bash
python -m black --check SRC/cuepoint

python -m isort --check-only SRC/cuepoint
```

## Run linters

```bash
python -m pylint SRC/cuepoint

python -m flake8 SRC/cuepoint --max-line-length=100 --extend-ignore=E203
```

## Type check

```bash
python -m mypy SRC/cuepoint
```

## Run tests

```bash
python -m pytest SRC/tests/ -v
```

