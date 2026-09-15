#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What a tag write writes: one definition of the options, held strictly (CLEAN-10).

- **One definition**: Sync Tags and the tag write job share the same function,
  so their defaults cannot drift apart.
- **Today's defaults** carry over, and artwork is off unless asked for.
- **The job refuses what Sync Tags coerces**: ``"false"`` never turns a field on.
"""

from __future__ import annotations

import pytest

from cuepoint.engine import sync_tags_api
from cuepoint.services import tag_write_options
from cuepoint.services.tag_write_options import (
    KEY_FORMATS,
    MAX_COMMENT_LENGTH,
    TagWriteOptions,
    normalize_sync_options,
)

DEFAULTS = {
    "key_format": "normal",
    "write_key": True,
    "write_year": True,
    "write_bpm": False,
    "write_label": True,
    "write_genre": False,
    "write_comment": True,
    "comment_text": "ok",
}


@pytest.mark.unit
class TestOneDefinition:
    def test_sync_tags_uses_the_moved_function_itself(self):
        assert sync_tags_api.normalize_sync_options is normalize_sync_options
        assert not hasattr(sync_tags_api, "_normalize_sync_options")

    def test_todays_defaults(self):
        assert normalize_sync_options(None) == DEFAULTS
        assert normalize_sync_options({}) == DEFAULTS

    def test_sync_tags_stays_as_tolerant_as_it_was(self):
        # Sync Tags' behaviour is unchanged by the move, lenience included.
        assert normalize_sync_options(
            {"key_format": "WHATEVER", "comment_text": "  ", "write_genre": "false"}
        ) == {**DEFAULTS, "write_genre": True}


@pytest.mark.unit
class TestFromARequest:
    def test_nothing_named_is_todays_defaults_without_artwork(self):
        for raw in (None, {}):
            options = TagWriteOptions.from_request(raw)
            assert options.to_dict() == {**DEFAULTS, "embed_missing_artwork": False}

    def test_the_fields_in_order(self):
        options = TagWriteOptions.from_request(
            {"write_bpm": True, "write_genre": True, "write_comment": False}
        )
        assert options.fields == ("key", "year", "label", "bpm", "genre")

    @pytest.mark.parametrize("key_format", KEY_FORMATS)
    def test_each_key_format(self, key_format):
        assert TagWriteOptions.from_request({"key_format": key_format}).key_format == (
            key_format
        )

    def test_a_key_format_in_capitals_is_the_same_format(self):
        assert TagWriteOptions.from_request({"key_format": " Camelot "}).key_format == (
            "camelot"
        )

    def test_a_blank_comment_says_ok_as_it_does_today(self):
        assert TagWriteOptions.from_request({"comment_text": " "}).comment_text == "ok"

    def test_artwork_alone_is_a_write(self):
        options = TagWriteOptions.from_request(
            {
                "write_key": False,
                "write_year": False,
                "write_label": False,
                "write_comment": False,
                "embed_missing_artwork": True,
            }
        )
        assert options.fields == ()
        assert options.embed_missing_artwork

    def test_it_round_trips_through_its_dict(self):
        options = TagWriteOptions.from_request(
            {"key_format": "short", "write_bpm": True, "embed_missing_artwork": True}
        )
        assert TagWriteOptions.from_request(options.to_dict()) == options

    @pytest.mark.parametrize(
        "raw, message",
        [
            ({"write_genre": "false"}, "write_genre must be true or false"),
            ({"write_key": 1}, "write_key must be true or false"),
            ({"embed_missing_artwork": "yes"}, "embed_missing_artwork"),
            ({"key_format": "open_key"}, "key_format must be one of"),
            ({"key_format": 8}, "key_format must be text"),
            ({"comment_text": 5}, "comment_text must be text"),
            ({"write_rating": True}, "Unknown option write_rating"),
            ({"comment_text": "x" * (MAX_COMMENT_LENGTH + 1)}, "at most"),
            (
                {
                    "write_key": False,
                    "write_year": False,
                    "write_label": False,
                    "write_comment": False,
                },
                "at least one field",
            ),
        ],
    )
    def test_anything_that_is_not_exactly_an_option_is_refused(self, raw, message):
        with pytest.raises(ValueError, match=message):
            TagWriteOptions.from_request(raw)

    @pytest.mark.parametrize("raw", ["options", ["write_key"], 3])
    def test_options_are_an_object(self, raw):
        with pytest.raises(ValueError, match="object"):
            TagWriteOptions.from_request(raw)

    def test_a_comment_at_the_limit_is_kept(self):
        text = "x" * MAX_COMMENT_LENGTH
        assert TagWriteOptions.from_request({"comment_text": text}).comment_text == text


@pytest.mark.unit
class TestBuiltDirectly:
    def test_the_model_holds_its_own_rules(self):
        base = dict(DEFAULTS)
        with pytest.raises(ValueError, match="key_format"):
            TagWriteOptions(**{**base, "key_format": "open"})
        with pytest.raises(ValueError, match="write_bpm"):
            TagWriteOptions(**{**base, "write_bpm": "no"})
        with pytest.raises(ValueError, match="comment_text"):
            TagWriteOptions(**{**base, "comment_text": ""})

    def test_the_toggles_name_every_tag_field(self):
        from cuepoint.data.tag_fields import TAG_FIELDS

        assert tuple(name for name, _ in tag_write_options.FIELD_TOGGLES) == TAG_FIELDS
