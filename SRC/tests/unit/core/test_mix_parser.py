"""Unit tests for mix_parser module."""

import pytest
from cuepoint.core.mix_parser import (
    _parse_mix_flags,
    _extract_remix_phrases,
    _extract_remixer_names_from_title,
    _extract_generic_parenthetical_phrases,
    _mix_bonus,
    _mix_ok_for_early_exit,
    _any_phrase_token_set_in_title
)


class TestMixParser:
    """Test mix parsing functions."""
    
    def test_parse_mix_flags_original(self):
        """Test parsing original mix flags."""
        flags = _parse_mix_flags("Track (Original Mix)")
        assert flags["is_original"] is True
        assert flags["is_remix"] is False
    
    def test_parse_mix_flags_remix(self):
        """Test parsing remix flags."""
        flags = _parse_mix_flags("Track (Remixer Remix)")
        assert flags["is_remix"] is True
        assert "Remixer" in flags["remixers"]
    
    def test_parse_mix_flags_extended(self):
        """Test parsing extended mix flags."""
        flags = _parse_mix_flags("Track (Extended Mix)")
        assert flags["is_extended"] is True
    
    def test_parse_mix_flags_no_mix(self):
        """Test parsing title with no mix indicators."""
        flags = _parse_mix_flags("Track")
        assert flags["is_plain"] is True
        assert flags["is_original"] is False
        assert flags["is_remix"] is False
    
    def test_extract_remix_phrases(self):
        """Test extracting remix phrases."""
        phrases = _extract_remix_phrases("Track (Remixer Remix)")
        assert len(phrases) > 0
        assert any("remix" in p.lower() for p in phrases)
    
    def test_extract_remixer_names_from_title(self):
        """Test extracting remixer names."""
        names = _extract_remixer_names_from_title("Track (Remixer Remix)")
        assert len(names) > 0
        assert "Remixer" in names
    
    def test_extract_generic_parenthetical_phrases(self):
        """Test extracting generic parenthetical phrases."""
        phrases = _extract_generic_parenthetical_phrases("Track (Ivory Re-fire)")
        assert len(phrases) > 0
        assert any("ivory" in p.lower() or "re-fire" in p.lower() or "refire" in p.lower() for p in phrases)
    
    def test_extract_generic_phrases_filters_mix_types(self):
        """Test that generic phrases filter out standard mix types."""
        phrases = _extract_generic_parenthetical_phrases("Track (Original Mix)")
        # Should not include standard mix types
        assert not any("original mix" in p.lower() for p in phrases)


class TestMixBonus:
    """Test mix bonus calculation."""
    
    def test_mix_bonus_original_match(self):
        """Test bonus for original mix match."""
        input_mix = {"is_original": True}
        cand_mix = {"is_original": True}
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        assert bonus > 0
        assert "mix_match" in reason or reason == "mix_match"
    
    def test_mix_bonus_remix_match(self):
        """Test bonus for remix match."""
        input_mix = {"is_remix": True, "remixer_tokens": {"remixer"}}
        cand_mix = {"is_remix": True, "remixer_tokens": {"remixer"}}
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        assert bonus > 0
    
    def test_mix_bonus_remix_mismatch(self):
        """Test penalty for remix/original mismatch."""
        input_mix = {"is_remix": True, "remixer_tokens": {"remixer"}}
        cand_mix = {"is_original": True}
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        assert bonus < 0  # Should be penalized
    
    def test_mix_bonus_prefer_plain(self):
        """Test bonus when plain title is preferred."""
        input_mix = {"prefer_plain": True}
        cand_mix = {"is_plain": True}
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        assert bonus >= 0  # Should not be penalized


class TestMixOkForEarlyExit:
    """Test mix compatibility for early exit."""
    
    def test_mix_ok_original_requested(self):
        """Test early exit OK for original mix request."""
        input_mix = {"is_original": True}
        cand_mix = {"is_original": True}
        assert _mix_ok_for_early_exit(input_mix, cand_mix) is True
    
    def test_mix_ok_remix_requested(self):
        """Test early exit OK for remix request."""
        input_mix = {"is_remix": True, "remixer_tokens": {"remixer"}}
        cand_mix = {"is_remix": True, "remixer_tokens": {"remixer"}}
        assert _mix_ok_for_early_exit(input_mix, cand_mix) is True
    
    def test_mix_ok_remix_mismatch(self):
        """Test early exit rejection for remix/original mismatch."""
        input_mix = {"is_remix": True, "remixer_tokens": {"remixer"}}
        cand_mix = {"is_original": True}
        assert _mix_ok_for_early_exit(input_mix, cand_mix) is False
    
    def test_mix_ok_no_input_mix(self):
        """Test early exit OK when no mix intent."""
        assert _mix_ok_for_early_exit(None, {"is_remix": True}) is True


class TestPhraseMatching:
    """Test phrase matching functions."""
    
    def test_any_phrase_token_set_in_title(self):
        """Test phrase token set matching."""
        phrases = ["Ivory Re-fire"]
        title = "Track (Ivory Re-fire)"
        assert _any_phrase_token_set_in_title(phrases, title) is True
    
    def test_any_phrase_token_set_no_match(self):
        """Test phrase token set when no match."""
        phrases = ["Ivory Re-fire"]
        title = "Track (Original Mix)"
        assert _any_phrase_token_set_in_title(phrases, title) is False
    
    def test_any_phrase_token_set_empty(self):
        """Test phrase token set with empty inputs."""
        assert _any_phrase_token_set_in_title([], "Track") is False
        assert _any_phrase_token_set_in_title(["Phrase"], "") is False





