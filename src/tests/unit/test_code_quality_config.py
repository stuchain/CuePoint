"""Live checks on the repository's code-quality configuration.

Ruff is the formatter and linter; pre-commit runs it plus file-hygiene hooks.
mypy is run on demand (see AGENTS.md), not by pre-commit.
"""

from pathlib import Path
from typing import List, Tuple


class TestConfigurationFiles:
    """The config files the quality gates read must exist."""

    def test_editorconfig_exists(self):
        """Test that .editorconfig file exists."""
        root = Path(__file__).parent.parent.parent.parent
        editorconfig = root / ".editorconfig"
        assert editorconfig.exists(), ".editorconfig file not found"

    def test_precommit_config_exists(self):
        """Test that .pre-commit-config.yaml exists."""
        root = Path(__file__).parent.parent.parent.parent
        precommit = root / ".pre-commit-config.yaml"
        assert precommit.exists(), ".pre-commit-config.yaml file not found"

    def test_mypy_ini_exists(self):
        """Test that mypy.ini exists."""
        root = Path(__file__).parent.parent.parent.parent
        mypy_ini = root / "mypy.ini"
        assert mypy_ini.exists(), "mypy.ini file not found"


class TestPreCommitHooks:
    """What the pre-commit config actually runs.

    Written against the parsed hooks rather than against words in the file.
    The four assertions here used to be substring checks, and all four were
    wrong in a way only a reader would notice: three looked for black, isort
    and flake8, which ruff replaced, so they had been failing for three phases;
    and the fourth looked for "mypy" and passed — on the comment explaining
    that mypy is deliberately *not* wired in. A test satisfied by a sentence
    saying the opposite is worse than one that fails.
    """

    @property
    def root_path(self) -> Path:
        """Get the root path of the project."""
        return Path(__file__).parent.parent.parent.parent

    @property
    def config_path(self) -> Path:
        return self.root_path / ".pre-commit-config.yaml"

    @property
    def hook_ids(self) -> set:
        """Every hook id the config configures."""
        import yaml

        config = yaml.safe_load(self.config_path.read_text(encoding="utf-8"))
        return {
            hook["id"]
            for repo in config.get("repos", [])
            for hook in repo.get("hooks", [])
        }

    def test_precommit_lints_with_ruff(self):
        assert "ruff-check" in self.hook_ids

    def test_precommit_formats_with_ruff(self):
        assert "ruff-format" in self.hook_ids

    def test_precommit_does_not_also_run_the_tools_ruff_replaced(self):
        """One formatter and one linter, or they fight over the same files.

        black, isort and flake8 were the gates before ruff. Leaving any of them
        configured beside it would mean two tools reformatting the same file on
        every commit, each undoing the other.
        """
        assert self.hook_ids.isdisjoint({"black", "isort", "flake8"})

    def test_precommit_keeps_the_file_hygiene_hooks(self):
        """The ones that rewrite a file and abort the commit for re-staging."""
        assert {"trailing-whitespace", "end-of-file-fixer"} <= self.hook_ids

    def test_precommit_leaves_mypy_out_and_says_why(self):
        """mypy is excluded deliberately (AGENTS.md), not forgotten.

        `mypy src/` still reports errors on the current tree, so wiring it in
        would block every commit rather than gate new work. The config has to
        say that, because an absence with no explanation reads as an oversight
        and gets "fixed" by the next person to look.
        """
        assert "mypy" not in self.hook_ids
        assert "mypy" in self.config_path.read_text(encoding="utf-8").lower()


class TestCodeQualityMetrics:
    """Test code quality metrics and standards."""

    @property
    def cuepoint_path(self) -> Path:
        """Get the path to the cuepoint source directory."""
        root = Path(__file__).parent.parent.parent.parent
        return root / "src" / "cuepoint"

    def test_python_files_exist(self):
        """Test that Python files exist in the cuepoint directory."""
        cuepoint_path = self.cuepoint_path
        python_files = list(cuepoint_path.rglob("*.py"))
        assert len(python_files) > 0, "No Python files found in cuepoint directory"

    def test_no_syntax_errors(self):
        """Test that all Python files have valid syntax."""
        cuepoint_path = self.cuepoint_path
        python_files = list(cuepoint_path.rglob("*.py"))
        syntax_errors: List[Tuple[str, str]] = []

        for py_file in python_files:
            try:
                with open(py_file, "r", encoding="utf-8") as f:
                    compile(f.read(), str(py_file), "exec")
            except SyntaxError as e:
                syntax_errors.append((str(py_file), str(e)))

        assert len(syntax_errors) == 0, f"Syntax errors found: {syntax_errors}"
