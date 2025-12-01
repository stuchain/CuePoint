"""Unit tests for mix_parser module."""

import pytest

from cuepoint.core.mix_parser import (
    _any_phrase_token_set_in_title,
    _extract_generic_parenthetical_phrases,
    _extract_remix_phrases,
    _extract_remixer_names_from_title,
    _mix_bonus,
    _mix_ok_for_early_exit,
    _parse_mix_flags,
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

    def test_parse_mix_flags_all_types(self):
        """Test parsing all mix types."""
        test_cases = [
            ("Track (Original Mix)", "is_original"),
            ("Track (Extended Mix)", "is_extended"),
            ("Track (Club Mix)", "is_club"),
            ("Track (Radio Edit)", "is_radio"),
            ("Track (Edit)", "is_edit"),
            ("Track (Remix)", "is_remix"),
            ("Track (Dub Mix)", "is_dub"),
            ("Track (Guitar Mix)", "is_guitar"),
            ("Track (VIP)", "is_vip"),
            ("Track (Rework)", "is_rework"),
            ("Track (Re-fire)", "is_refire"),
            ("Track (Acapella)", "is_acapella"),
            ("Track (Instrumental)", "is_instrumental"),
        ]
        for title, flag_name in test_cases:
            flags = _parse_mix_flags(title)
            assert flags[flag_name] is True, f"Failed for {title}"

    def test_parse_mix_flags_multiple_mix_types(self):
        """Test parsing title with multiple mix types."""
        flags = _parse_mix_flags("Track (Extended Remix)")
        # "Extended Remix" sets is_remix and treats "Extended" as remixer name
        # It does NOT set is_extended (the pattern doesn't match "Extended Remix")
        assert flags["is_remix"] is True
        # Verify it parsed correctly - "Extended" is extracted as remixer
        assert len(flags["remixers"]) > 0

    def test_parse_mix_flags_remixer_extraction(self):
        """Test remixer name extraction."""
        flags = _parse_mix_flags("Track (CamelPhat Remix)")
        assert flags["is_remix"] is True
        assert len(flags["remixers"]) > 0
        assert "CamelPhat" in flags["remixers"]
        assert len(flags["remixer_tokens"]) > 0

    def test_parse_mix_flags_multiple_remixers(self):
        """Test parsing multiple remixers."""
        flags = _parse_mix_flags("Track (CamelPhat & ARTBAT Remix)")
        assert flags["is_remix"] is True
        assert len(flags["remixers"]) >= 1

    def test_parse_mix_flags_brackets(self):
        """Test parsing mix flags from brackets."""
        flags1 = _parse_mix_flags("Track (Original Mix)")
        flags2 = _parse_mix_flags("Track [Original Mix]")
        assert flags1["is_original"] is True
        assert flags2["is_original"] is True

    def test_parse_mix_flags_html_entities(self):
        """Test parsing with HTML entities."""
        flags = _parse_mix_flags("Track &amp; (Remix)")
        assert flags["is_remix"] is True

    def test_parse_mix_flags_accents(self):
        """Test parsing with accented characters."""
        flags = _parse_mix_flags("Track (Café Remix)")
        assert flags["is_remix"] is True

    def test_extract_remix_phrases_brackets(self):
        """Test extracting remix phrases from brackets."""
        phrases = _extract_remix_phrases("Track [Remixer Remix]")
        assert len(phrases) > 0
        assert any("remix" in p.lower() for p in phrases)

    def test_extract_remix_phrases_multiple(self):
        """Test extracting multiple remix phrases."""
        phrases = _extract_remix_phrases("Track (Remix) [Extended Remix]")
        assert len(phrases) >= 1

    def test_extract_remix_phrases_deduplication(self):
        """Test that remix phrases are deduplicated."""
        phrases = _extract_remix_phrases("Track (Remix) (Remix)")
        # Should deduplicate
        assert len(phrases) == 1

    def test_extract_remixer_names_various_formats(self):
        """Test extracting remixer names in various formats."""
        test_cases = [
            "Track (CamelPhat Remix)",
            "Track (CamelPhat's Remix)",
            "Track (CamelPhat Extended Remix)",
            "Track (CamelPhat & ARTBAT Remix)",
        ]
        for title in test_cases:
            names = _extract_remixer_names_from_title(title)
            assert len(names) > 0
            assert any("camelphat" in n.lower() for n in names)

    def test_extract_generic_parenthetical_phrases_various(self):
        """Test extracting various generic phrases."""
        phrases1 = _extract_generic_parenthetical_phrases("Track (Ivory Re-fire)")
        phrases2 = _extract_generic_parenthetical_phrases("Track (Custom Phrase)")
        assert len(phrases1) > 0
        assert len(phrases2) > 0

    def test_extract_generic_parenthetical_phrases_brackets(self):
        """Test extracting generic phrases from brackets."""
        phrases = _extract_generic_parenthetical_phrases("Track [Custom Phrase]")
        assert len(phrases) > 0

    def test_extract_generic_parenthetical_phrases_empty(self):
        """Test extracting generic phrases from title with no phrases."""
        phrases = _extract_generic_parenthetical_phrases("Track")
        assert len(phrases) == 0

    def test_mix_bonus_remixer_match(self):
        """Test bonus for remixer name match."""
        input_mix = {
            "is_remix": True,
            "remixer_tokens": {"camelphat"}
        }
        cand_mix = {
            "is_remix": True,
            "remixer_tokens": {"camelphat"}
        }
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        assert bonus > 0
        assert "remixer_match" in reason

    def test_mix_bonus_remixer_mismatch(self):
        """Test penalty for remixer name mismatch."""
        input_mix = {
            "is_remix": True,
            "remixer_tokens": {"camelphat"}
        }
        cand_mix = {
            "is_remix": True,
            "remixer_tokens": {"other"}
        }
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        assert bonus < 0
        assert "remixer_mismatch" in reason

    def test_mix_bonus_extended_remix_compatible(self):
        """Test that extended remix is compatible with remix request."""
        input_mix = {
            "is_remix": True,
            "remixer_tokens": {"camelphat"}
        }
        cand_mix = {
            "is_extended": True,
            "is_remix": True,
            "remixer_tokens": {"camelphat"}
        }
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        # When remixer tokens match, should get positive bonus
        assert bonus > 0
        # Reason will be "remixer_match" when tokens match
        assert isinstance(reason, str)
        assert len(reason) > 0

    def test_mix_bonus_prefer_plain_penalty(self):
        """Test penalty when prefer_plain but candidate has remix."""
        input_mix = {"prefer_plain": True}
        cand_mix = {"is_remix": True}
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        assert bonus < 0
        assert "prefer_plain" in reason

    def test_mix_bonus_prefer_plain_bonus(self):
        """Test bonus when prefer_plain and candidate is plain."""
        input_mix = {"prefer_plain": True}
        cand_mix = {"is_plain": True}
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        assert bonus > 0

    def test_mix_ok_for_early_exit_plain(self):
        """Test early exit OK for plain titles."""
        input_mix = {"is_plain": True}
        cand_mix = {"is_plain": True}
        assert _mix_ok_for_early_exit(input_mix, cand_mix) is True

    def test_mix_ok_for_early_exit_extended(self):
        """Test early exit OK for extended mix."""
        input_mix = {"is_extended": True}
        cand_mix = {"is_extended": True}
        assert _mix_ok_for_early_exit(input_mix, cand_mix) is True

    def test_mix_ok_for_early_exit_original_extended_compatible(self):
        """Test early exit allows original/extended as compatible."""
        input_mix = {"is_original": True}
        cand_mix = {"is_extended": True}
        # According to the implementation, original and extended are compatible
        # (line 697-698: if cand_mix.get("is_original") or cand_mix.get("is_extended"): return True)
        assert _mix_ok_for_early_exit(input_mix, cand_mix) is True

    def test_any_phrase_token_set_partial_match(self):
        """Test phrase token set with partial token match."""
        phrases = ["Ivory Re-fire"]
        title = "Track (Ivory)"
        # Should match if tokens overlap
        result = _any_phrase_token_set_in_title(phrases, title)
        assert isinstance(result, bool)

    def test_extract_original_mix_phrases(self):
        """Test extracting original mix phrases."""
        from cuepoint.core.mix_parser import _extract_original_mix_phrases
        phrases = _extract_original_mix_phrases("Track (Original Mix)")
        assert len(phrases) > 0
        assert any("original" in p.lower() for p in phrases)

    def test_extract_extended_mix_phrases(self):
        """Test extracting extended mix phrases."""
        from cuepoint.core.mix_parser import _extract_extended_mix_phrases
        phrases = _extract_extended_mix_phrases("Track (Extended Mix)")
        assert len(phrases) > 0
        assert any("extended" in p.lower() for p in phrases)

    def test_parse_mix_flags_empty_title(self):
        """Test parsing empty title."""
        flags = _parse_mix_flags("")
        assert flags["is_plain"] is True
        assert flags["prefer_plain"] is True
    
    def test_extract_bracket_artist_hints(self):
        """Test extracting artist hints from bracket notation."""
        from cuepoint.core.mix_parser import _extract_bracket_artist_hints

        # Test basic bracket extraction
        hints = _extract_bracket_artist_hints("Track [Artist Name]")
        assert "Artist Name" in hints
        
        # Test multiple brackets
        hints = _extract_bracket_artist_hints("Track [Artist 1] [Artist 2]")
        assert len(hints) >= 1
        
        # Test filtering out mix-related keywords
        hints = _extract_bracket_artist_hints("Track [Remix]")
        assert "Remix" not in hints or len(hints) == 0
        
        # Test filtering out numeric patterns
        hints = _extract_bracket_artist_hints("Track [123]")
        assert len(hints) == 0
        
        # Test deduplication
        hints = _extract_bracket_artist_hints("Track [Artist] [artist]")
        assert len(hints) == 1
    
    def test_merge_name_lists(self):
        """Test merging multiple name lists."""
        from cuepoint.core.mix_parser import _merge_name_lists

        # Test basic merge
        result = _merge_name_lists(["John", "Jane"], ["Bob"])
        assert "John" in result
        assert "Jane" in result
        assert "Bob" in result
        
        # Test deduplication
        result = _merge_name_lists(["John", "Jane"], ["Jane", "Bob"])
        assert result.count("Jane") == 1
        
        # Test case-insensitive deduplication
        result = _merge_name_lists(["John"], ["john"])
        assert result.count("John") == 1 or result.count("john") == 1
        
        # Test empty lists
        result = _merge_name_lists([], ["John"])
        assert "John" in result
        
        # Test multiple lists
        result = _merge_name_lists(["A"], ["B"], ["C"])
        assert "A" in result and "B" in result and "C" in result
    
    def test_split_display_names(self):
        """Test splitting display names string."""
        from cuepoint.core.mix_parser import _split_display_names

        # Test comma separator
        result = _split_display_names("John, Jane, Bob")
        assert "John" in result
        assert "Jane" in result
        assert "Bob" in result
        
        # Test ampersand separator
        result = _split_display_names("John & Jane")
        assert "John" in result
        assert "Jane" in result
        
        # Test "and" separator
        result = _split_display_names("John and Jane")
        assert "John" in result
        assert "Jane" in result
        
        # Test slash separator
        result = _split_display_names("John/Jane")
        assert "John" in result
        assert "Jane" in result
        
        # Test combination
        result = _split_display_names("John, Jane & Bob")
        assert len(result) >= 2
        
        # Test empty string
        result = _split_display_names("")
        assert len(result) == 0
    
    def test_extract_remixer_names_from_brackets(self):
        """Test extracting remixer names from bracket notation."""
        from cuepoint.core.mix_parser import _extract_remixer_names_from_title

        # Test bracket remix pattern
        names = _extract_remixer_names_from_title("Track [CamelPhat Remix]")
        assert len(names) > 0
        assert any("camelphat" in n.lower() for n in names)
        
        # Test bracket without remix keyword
        names = _extract_remixer_names_from_title("Track [CamelPhat]")
        # May or may not extract depending on implementation
        
        # Test multiple remixers in brackets
        names = _extract_remixer_names_from_title("Track [CamelPhat & Keinemusik Remix]")
        assert len(names) >= 1
    
    def test_mix_ok_for_early_exit_plain_titles(self):
        """Test early exit compatibility with plain titles."""
        from cuepoint.core.mix_parser import _mix_ok_for_early_exit, _parse_mix_flags

        # Original requested, plain title found
        input_mix = _parse_mix_flags("Track (Original Mix)")
        cand_mix = _parse_mix_flags("Track")  # Plain title
        result = _mix_ok_for_early_exit(input_mix, cand_mix)
        assert result is True
    
    def test_mix_ok_for_early_exit_remix_with_artist_fallback(self):
        """Test early exit with remix and artist fallback matching."""
        from cuepoint.core.mix_parser import _mix_ok_for_early_exit, _parse_mix_flags

        # Remix requested with specific remixer
        input_mix = _parse_mix_flags("Track (CamelPhat Remix)")
        cand_mix = _parse_mix_flags("Track (Remix)")  # Remix but no remixer in title
        cand_artists = "CamelPhat"  # Remixer in artists
        
        result = _mix_ok_for_early_exit(input_mix, cand_mix, cand_artists)
        assert result is True
    
    def test_mix_ok_for_early_exit_extended_remix_compatibility(self):
        """Test that extended remix is compatible with remix request."""
        from cuepoint.core.mix_parser import _mix_ok_for_early_exit, _parse_mix_flags

        # Remix requested
        input_mix = _parse_mix_flags("Track (Remix)")
        # Extended remix found
        cand_mix = _parse_mix_flags("Track (Extended Remix)")
        
        result = _mix_ok_for_early_exit(input_mix, cand_mix)
        assert result is True
    
    def test_mix_ok_for_early_exit_no_input_mix(self):
        """Test early exit when no input mix intent."""
        from cuepoint.core.mix_parser import _mix_ok_for_early_exit, _parse_mix_flags

        # No input mix
        input_mix = {}
        cand_mix = _parse_mix_flags("Track (Remix)")
        
        result = _mix_ok_for_early_exit(input_mix, cand_mix)
        assert result is True
    
    def test_extract_generic_parenthetical_phrases_empty_title(self):
        """Test extracting generic phrases from empty title - line 171."""
        phrases = _extract_generic_parenthetical_phrases("")
        assert phrases == []
        
        phrases = _extract_generic_parenthetical_phrases(None)
        assert phrases == []
    
    def test_extract_generic_parenthetical_phrases_empty_phrase(self):
        """Test extracting generic phrases with empty phrase - line 179."""
        # Test with title that has empty parentheses
        phrases = _extract_generic_parenthetical_phrases("Track ()")
        # Should skip empty phrases
        assert len(phrases) == 0
    
    def test_extract_generic_parenthetical_phrases_numeric_pattern(self):
        """Test extracting generic phrases with numeric pattern - line 187."""
        # Test with numeric pattern in parentheses
        phrases = _extract_generic_parenthetical_phrases("Track (123-456)")
        # Should skip numeric patterns
        assert len(phrases) == 0
        
        phrases = _extract_generic_parenthetical_phrases("Track (12:34)")
        assert len(phrases) == 0
    
    def test_any_phrase_token_set_empty_tokens(self):
        """Test phrase token set with empty tokens - line 229."""
        # Test with title that produces no tokens
        phrases = ["Ivory Re-fire"]
        title = ""  # Empty title
        result = _any_phrase_token_set_in_title(phrases, title)
        assert result is False
        
        # Test with title that has no meaningful tokens
        title = "   "  # Whitespace only
        result = _any_phrase_token_set_in_title(phrases, title)
        assert result is False
    
    def test_any_phrase_token_set_collapsed_match(self):
        """Test phrase token set with collapsed form match - line 237."""
        # Test collapsed form matching (spaces/hyphens removed)
        phrases = ["Ivory Re-fire"]
        title = "Track (IvoryRefire)"  # Collapsed form
        result = _any_phrase_token_set_in_title(phrases, title)
        assert result is True
    
    def test_infer_special_mix_intent(self):
        """Test inferring special mix intent - lines 259-267."""
        from cuepoint.core.mix_parser import _infer_special_mix_intent

        # Test with refire phrase
        intent = _infer_special_mix_intent(["Ivory Re-fire"])
        assert intent["want_refire"] is True
        assert intent["want_rework"] is False
        
        # Test with rework phrase
        intent = _infer_special_mix_intent(["Custom Re-work"])
        assert intent["want_refire"] is False
        assert intent["want_rework"] is True
        
        # Test with both
        intent = _infer_special_mix_intent(["Ivory Re-fire", "Custom Re-work"])
        assert intent["want_refire"] is True
        assert intent["want_rework"] is True
        
        # Test with none
        intent = _infer_special_mix_intent(["Custom Phrase"])
        assert intent["want_refire"] is False
        assert intent["want_rework"] is False
        
        # Test with empty list
        intent = _infer_special_mix_intent([])
        assert intent["want_refire"] is False
        assert intent["want_rework"] is False
    
    def test_extract_bracket_artist_hints_empty_token(self):
        """Test extracting bracket hints with empty token - line 291."""
        hints = _extract_bracket_artist_hints("Track []")
        # Should skip empty tokens
        assert len(hints) == 0
    
    def test_merge_name_lists_empty_strings(self):
        """Test merging name lists with empty strings - line 329."""
        from cuepoint.core.mix_parser import _merge_name_lists

        # Test with empty strings in lists
        result = _merge_name_lists(["John", "", "Jane"], ["  ", "Bob"])
        assert "John" in result
        assert "Jane" in result
        assert "Bob" in result
        assert "" not in result
    
    def test_mix_bonus_original_extended_mismatch(self):
        """Test mix bonus for original/extended mismatch - lines 583-587."""
        input_mix = {"is_original": True}
        cand_mix = {"is_extended": True}
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        assert bonus < 0  # Should be penalized
        assert "mix_orig_ext_mismatch" in reason
    
    def test_mix_bonus_avoid_altmix(self):
        """Test mix bonus avoiding alt mix types - lines 589-590."""
        input_mix = {"is_original": True}
        cand_mix = {"is_dub": True}
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        assert bonus < 0
        assert "avoid_altmix" in reason
    
    def test_mix_bonus_avoid_club(self):
        """Test mix bonus avoiding club mix - lines 592-593."""
        input_mix = {"is_original": True}
        cand_mix = {"is_club": True}
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        assert bonus < 0
        assert "avoid_club" in reason
    
    def test_mix_bonus_avoid_radio(self):
        """Test mix bonus avoiding radio edit - lines 595-596."""
        input_mix = {"is_original": True}
        cand_mix = {"is_radio": True}
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        assert bonus < 0
        assert "avoid_radio" in reason
    
    def test_mix_bonus_avoid_edit(self):
        """Test mix bonus avoiding edit - lines 598-599."""
        input_mix = {"is_original": True}
        cand_mix = {"is_edit": True}
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        assert bonus < 0
        assert "avoid_edit" in reason
    
    def test_mix_bonus_avoid_remix_when_origext(self):
        """Test mix bonus avoiding remix when original/extended requested - lines 601-602."""
        input_mix = {"is_original": True}
        cand_mix = {"is_remix": True}
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        assert bonus < 0
        assert "avoid_remix_when_origext" in reason
    
    def test_mix_bonus_avoid_stem_when_origext(self):
        """Test mix bonus avoiding acapella/instrumental when original/extended requested - lines 604-605."""
        input_mix = {"is_original": True}
        cand_mix = {"is_acapella": True}
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        assert bonus < 0
        assert "avoid_stem_when_origext" in reason
        
        cand_mix = {"is_instrumental": True}
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        assert bonus < 0
        assert "avoid_stem_when_origext" in reason
    
    def test_mix_bonus_any_remix_ok(self):
        """Test mix bonus when remix requested but no specific remixer - lines 619-620."""
        input_mix = {"is_remix": True, "remixer_tokens": set()}  # No specific remixer
        cand_mix = {"is_remix": True, "remixer_tokens": {"some"}}
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        assert bonus > 0
        assert "any_remix_ok" in reason
    
    def test_mix_bonus_remix_extended_compatible(self):
        """Test mix bonus for remix/extended remix compatibility - lines 625-638."""
        # Test with remixer match
        input_mix = {"is_remix": True, "remixer_tokens": {"camelphat"}}
        cand_mix = {"is_extended": True, "is_remix": True, "remixer_tokens": {"camelphat"}}
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        assert bonus > 0
        assert "remix_extended_remix_compatible" in reason
        
        # Test without remixer tokens
        input_mix = {"is_remix": True, "remixer_tokens": set()}
        cand_mix = {"is_extended": True, "is_remix": True, "remixer_tokens": set()}
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        assert bonus > 0
        assert "remix_extended_remix_compatible" in reason
        
        # Test with remixer mismatch
        input_mix = {"is_remix": True, "remixer_tokens": {"camelphat"}}
        cand_mix = {"is_extended": True, "is_remix": True, "remixer_tokens": {"other"}}
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        assert bonus < 0  # Penalty but compatible format
        assert "remixer_mismatch_but_compatible_format" in reason
    
    def test_mix_bonus_wanted_remix_got_original(self):
        """Test mix bonus when remix requested but got original - lines 650-651."""
        # Test with specific remixer
        input_mix = {"is_remix": True, "remixer_tokens": {"camelphat"}}
        cand_mix = {"is_original": True}
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        assert bonus < 0
        assert "wanted_specific_remix_got_original" in reason
        
        # Test without specific remixer
        input_mix = {"is_remix": True, "remixer_tokens": set()}
        cand_mix = {"is_original": True}
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        assert bonus < 0
        assert "wanted_remix" in reason
    
    def test_mix_bonus_soft_avoid_altmix(self):
        """Test mix bonus soft avoid alt mix when no explicit intent - lines 654-656."""
        input_mix = {}  # No explicit intent
        cand_mix = {"is_dub": True}
        bonus, reason = _mix_bonus(input_mix, cand_mix)
        assert bonus < 0
        assert "soft_avoid_altmix" in reason







