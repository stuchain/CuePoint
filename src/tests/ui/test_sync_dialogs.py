"""Minimal tests for SyncTagsDialog and SyncCompleteDialog (instantiate and show/close without crash)."""

import pytest

from cuepoint.ui.dialogs.sync_complete_dialog import SyncCompleteDialog
from cuepoint.ui.dialogs.sync_tags_dialog import SyncOptions, SyncTagsDialog


@pytest.fixture
def sync_tags_dialog(qapp):
    """Create a SyncTagsDialog instance for testing."""
    return SyncTagsDialog()


@pytest.fixture
def sync_complete_dialog(qapp):
    """Create a SyncCompleteDialog instance for testing."""
    return SyncCompleteDialog(written=2, failed=0, errors=[])


class TestSyncTagsDialog:
    """Minimal safety tests for SyncTagsDialog."""

    def test_sync_tags_dialog_creation(self, sync_tags_dialog):
        """SyncTagsDialog can be created."""
        assert sync_tags_dialog is not None
        assert isinstance(sync_tags_dialog, SyncTagsDialog)

    def test_sync_tags_dialog_has_title(self, sync_tags_dialog):
        """SyncTagsDialog has expected window title."""
        assert "Sync" in sync_tags_dialog.windowTitle()

    @pytest.mark.ui
    def test_sync_tags_dialog_show_and_close(self, sync_tags_dialog, qapp):
        """SyncTagsDialog can be shown and closed without crash."""
        sync_tags_dialog.show()
        assert sync_tags_dialog.isVisible()
        sync_tags_dialog.close()
        assert not sync_tags_dialog.isVisible()


class TestSyncCompleteDialog:
    """Minimal safety tests for SyncCompleteDialog."""

    def test_sync_complete_dialog_creation(self, sync_complete_dialog):
        """SyncCompleteDialog can be created."""
        assert sync_complete_dialog is not None
        assert isinstance(sync_complete_dialog, SyncCompleteDialog)

    def test_sync_complete_dialog_with_errors(self, qapp):
        """SyncCompleteDialog can be created with error list."""
        dlg = SyncCompleteDialog(written=1, failed=1, errors=["/path/to/file: File not found"])
        assert dlg is not None
        dlg.close()

    @pytest.mark.ui
    def test_sync_complete_dialog_show_and_close(self, sync_complete_dialog, qapp):
        """SyncCompleteDialog can be shown and closed without crash."""
        sync_complete_dialog.show()
        assert sync_complete_dialog.isVisible()
        sync_complete_dialog.close()
        assert not sync_complete_dialog.isVisible()


class TestSyncOptions:
    """Test SyncOptions dataclass used by sync flow."""

    def test_sync_options_to_dict(self):
        """SyncOptions.to_dict returns expected keys."""
        opts = SyncOptions(
            key_format="camelot",
            write_key=True,
            write_year=True,
            write_bpm=False,
            write_label=True,
            write_genre=False,
            write_comment=True,
            comment_text="ok",
        )
        d = opts.to_dict()
        assert d["key_format"] == "camelot"
        assert d["write_key"] is True
        assert d["write_comment"] is True
        assert "comment_text" in d
