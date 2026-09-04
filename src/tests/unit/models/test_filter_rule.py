#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for the filter rule model (LIBUI-02, DEC-043, DEC-016).

This file is about the vocabulary and its refusals; ``test_filter_sql.py`` is
about what a rule *means* against the database. The split matters because the
two fail differently: a rule the model wrongly accepts becomes SQL nobody
checked, and a rule the model wrongly refuses is a filter a user cannot build.

The property that carries the most weight is that a bad clause is **refused,
never dropped**. A filter that silently ignores one of its own rules answers a
different question than the one asked and shows a list of tracks that looks
right.
"""

from __future__ import annotations

import pytest

from cuepoint.models.filter_rule import (
    FACETABLE_FIELDS,
    FIELDS,
    MATCH_ALL,
    OPERATORS_BY_TYPE,
    TYPE_DATE,
    TYPE_NUMBER,
    TYPE_TEXT,
    FilterRule,
    FilterRuleError,
    RuleSet,
    describe_fields,
    describe_operators,
    field_spec,
    operator_arity,
    valueless,
)


def rule(field: str, operator: str, value=None) -> FilterRule:
    return FilterRule(field=field, operator=operator, value=value)


class TestRegistry:
    def test_every_field_has_a_known_type(self):
        assert {spec.type for spec in FIELDS} <= {TYPE_TEXT, TYPE_NUMBER, TYPE_DATE}

    def test_every_field_has_operators(self):
        for spec in FIELDS:
            assert spec.operators == OPERATORS_BY_TYPE[spec.type]
            assert spec.operators

    def test_field_names_are_unique(self):
        names = [spec.name for spec in FIELDS]
        assert len(names) == len(set(names))

    def test_identity_and_bookkeeping_columns_are_not_filterable(self):
        # They are not questions a user asks of a library, and exposing them
        # would make them a public contract for no one's benefit.
        for name in ("id", "rekordbox_track_id", "normalized_path", "created_at"):
            with pytest.raises(FilterRuleError):
                field_spec(name)

    def test_unknown_field_names_what_is_filterable(self):
        with pytest.raises(FilterRuleError, match="genre"):
            field_spec("vibe")

    def test_facetable_fields_are_a_subset(self):
        assert set(FACETABLE_FIELDS) <= {spec.name for spec in FIELDS}

    def test_free_text_is_not_facetable(self):
        # Every comment is unique; a facet list would be as long as the library.
        assert not field_spec("comment").facetable
        assert not field_spec("title").facetable

    def test_describe_fields_carries_what_the_renderer_needs(self):
        described = {entry["name"]: entry for entry in describe_fields()}
        assert described["bpm"]["type"] == TYPE_NUMBER
        assert described["bpm"]["label"] == "BPM"
        assert "between" in described["bpm"]["operators"]
        assert described["genre"]["facetable"] is True
        assert described["rating"]["integer"] is True

    def test_describe_fields_covers_every_field(self):
        assert len(describe_fields()) == len(FIELDS)


class TestArity:
    """How many values an operator takes, which the renderer builds from."""

    @pytest.mark.parametrize(
        "operator,arity",
        [
            ("is", "single"),
            ("contains", "single"),
            ("gte", "single"),
            ("before", "single"),
            ("between", "pair"),
            ("any_of", "list"),
            ("is_empty", "none"),
            ("is_not_empty", "none"),
        ],
    )
    def test_operator_arity(self, operator, arity):
        assert operator_arity(operator) == arity

    def test_every_operator_is_described(self):
        described = describe_operators()
        for operators in OPERATORS_BY_TYPE.values():
            for operator in operators:
                assert operator in described
                assert described[operator]["arity"] in {
                    "none",
                    "single",
                    "pair",
                    "list",
                }

    def test_it_describes_nothing_that_is_not_an_operator(self):
        allowed = {op for ops in OPERATORS_BY_TYPE.values() for op in ops}
        assert set(describe_operators()) == allowed


class TestOperatorsPerType:
    @pytest.mark.parametrize(
        "field,operator",
        [
            ("genre", "lt"),
            ("genre", "between"),
            ("bpm", "contains"),
            ("bpm", "starts_with"),
            ("date_added", "contains"),
            ("date_added", "lt"),
            ("rating", "before"),
        ],
    )
    def test_operators_are_refused_for_the_wrong_type(self, field, operator):
        with pytest.raises(FilterRuleError, match="cannot be filtered"):
            rule(field, operator, 1).validated()

    def test_the_refusal_lists_what_is_allowed(self):
        with pytest.raises(FilterRuleError, match="contains"):
            rule("genre", "lt", "x").validated()

    def test_an_unknown_operator_is_refused(self):
        with pytest.raises(FilterRuleError):
            rule("genre", "sounds_like", "house").validated()

    def test_operator_case_is_normalized(self):
        assert rule("genre", "CONTAINS", "house").validated().operator == "contains"

    def test_dates_use_before_and_after_not_lt_and_gt(self):
        # One name per meaning per type: two spellings of one comparison is a
        # vocabulary that drifts.
        assert rule("date_added", "before", "2020-01-01").validated()
        with pytest.raises(FilterRuleError):
            rule("date_added", "lt", "2020-01-01").validated()


class TestValues:
    def test_numbers_accept_text_from_a_query_string(self):
        assert rule("bpm", "gte", "128").validated().value == 128.0

    def test_numbers_refuse_words(self):
        with pytest.raises(FilterRuleError, match="needs a number"):
            rule("bpm", "gte", "fast").validated()

    def test_numbers_refuse_booleans(self):
        with pytest.raises(FilterRuleError, match="needs a number"):
            rule("bpm", "is", True).validated()

    def test_numbers_refuse_infinity(self):
        with pytest.raises(FilterRuleError, match="real number"):
            rule("bpm", "gte", float("inf")).validated()

    def test_whole_number_fields_refuse_fractions(self):
        with pytest.raises(FilterRuleError, match="whole number"):
            rule("rating", "is", 3.5).validated()

    def test_whole_number_fields_accept_a_round_float(self):
        # A facet returns 4.0 for a rating; a filter built from it must match.
        assert rule("rating", "is", 4.0).validated().value == 4

    def test_bpm_keeps_its_fraction(self):
        assert rule("bpm", "is", "122.5").validated().value == 122.5

    def test_text_accepts_a_number(self):
        assert rule("genre", "is", 2020).validated().value == "2020"

    def test_text_refuses_a_list_where_one_value_is_expected(self):
        with pytest.raises(FilterRuleError, match="needs a value"):
            rule("genre", "contains", ["house"]).validated()

    def test_contains_refuses_a_blank(self):
        # "contains nothing" matches every track, which nobody means to ask.
        with pytest.raises(FilterRuleError, match="something to match"):
            rule("genre", "contains", "   ").validated()

    def test_is_accepts_a_blank_because_blank_is_a_real_value(self):
        # Rekordbox writes both null and "" for a missing value.
        assert rule("genre", "is", "").validated().value == ""


class TestValuelessOperators:
    @pytest.mark.parametrize("operator", ["is_empty", "is_not_empty"])
    def test_they_take_no_value(self, operator):
        assert rule("genre", operator).validated().value is None
        assert valueless(operator)

    def test_a_value_is_refused_rather_than_ignored(self):
        with pytest.raises(FilterRuleError, match="takes no value"):
            rule("genre", "is_empty", "House").validated()

    def test_an_empty_value_is_accepted_as_absent(self):
        assert rule("genre", "is_empty", "").validated().value is None

    def test_they_are_dropped_from_the_serialized_shape(self):
        assert rule("genre", "is_empty").validated().to_dict() == {
            "field": "genre",
            "operator": "is_empty",
        }


class TestListOperators:
    def test_any_of_needs_a_list(self):
        with pytest.raises(FilterRuleError, match="list of values"):
            rule("genre", "any_of", "House").validated()

    def test_any_of_needs_at_least_one_value(self):
        with pytest.raises(FilterRuleError, match="at least one"):
            rule("genre", "any_of", []).validated()

    def test_any_of_coerces_every_value(self):
        assert rule("rating", "any_of", ["4", 5]).validated().value == (4, 5)

    def test_any_of_refuses_when_one_value_is_bad(self):
        with pytest.raises(FilterRuleError, match="needs a number"):
            rule("rating", "any_of", [4, "great"]).validated()

    def test_between_needs_exactly_two(self):
        with pytest.raises(FilterRuleError, match="exactly two"):
            rule("bpm", "between", [120]).validated()
        with pytest.raises(FilterRuleError, match="exactly two"):
            rule("bpm", "between", [120, 128, 130]).validated()

    def test_between_orders_a_backwards_range(self):
        # A range typed backwards is a slip, not a request for no tracks.
        assert rule("bpm", "between", [128, 120]).validated().value == (120.0, 128.0)

    def test_between_works_on_dates(self):
        assert rule(
            "date_added", "between", ["2020-01-01", "2019-01-01"]
        ).validated().value == ("2019-01-01", "2020-01-01")


class TestRuleSet:
    def test_an_empty_set_is_falsy(self):
        assert not RuleSet()
        assert RuleSet(rules=(rule("genre", "is", "House"),))

    def test_it_validates_every_rule(self):
        validated = RuleSet(
            rules=(rule("genre", "IS", "House"), rule("bpm", "gte", "120"))
        ).validated()
        assert [r.operator for r in validated.rules] == ["is", "gte"]
        assert validated.rules[1].value == 120.0

    def test_one_bad_rule_refuses_the_whole_set(self):
        # Never a dropped clause: a filter that ignores one of its own rules
        # answers a different question than the one asked.
        with pytest.raises(FilterRuleError, match="BPM"):
            RuleSet(
                rules=(rule("genre", "is", "House"), rule("bpm", "gte", "fast"))
            ).validated()

    def test_match_any_is_refused_with_an_explanation(self):
        with pytest.raises(FilterRuleError, match="Smart Collections"):
            RuleSet(rules=(rule("genre", "is", "House"),), match="any").validated()

    def test_an_unknown_match_mode_is_refused(self):
        with pytest.raises(FilterRuleError, match="match must be"):
            RuleSet(match="sometimes").validated()

    def test_match_defaults_to_all(self):
        assert RuleSet().validated().match == MATCH_ALL

    def test_without_field_removes_every_rule_on_it(self):
        rules = RuleSet(
            rules=(
                rule("genre", "is", "House"),
                rule("genre", "is_not", "Tech House"),
                rule("bpm", "gte", 120),
            )
        )
        assert rules.without_field("genre").fields() == ("bpm",)

    def test_without_field_leaves_the_original_alone(self):
        rules = RuleSet(rules=(rule("genre", "is", "House"),))
        rules.without_field("genre")
        assert rules.fields() == ("genre",)

    def test_fields_lists_each_field_once_in_order(self):
        rules = RuleSet(
            rules=(
                rule("bpm", "gte", 120),
                rule("genre", "is", "House"),
                rule("bpm", "lte", 128),
            )
        )
        assert rules.fields() == ("bpm", "genre")


class TestWireShape:
    def test_a_rule_set_round_trips(self):
        payload = {
            "match": "all",
            "rules": [
                {"field": "genre", "operator": "is", "value": "House"},
                {"field": "bpm", "operator": "between", "value": [120, 128]},
                {"field": "rating", "operator": "is_empty"},
            ],
        }
        parsed = RuleSet.from_dict(payload).validated()
        assert parsed.to_dict() == {
            "match": "all",
            "rules": [
                {"field": "genre", "operator": "is", "value": "House"},
                {"field": "bpm", "operator": "between", "value": [120.0, 128.0]},
                {"field": "rating", "operator": "is_empty"},
            ],
        }

    def test_none_and_empty_both_mean_no_filter(self):
        assert not RuleSet.from_dict(None)
        assert not RuleSet.from_dict({})
        assert not RuleSet.from_dict({"rules": None})

    def test_a_rule_needs_a_field_and_an_operator(self):
        with pytest.raises(FilterRuleError, match="field"):
            RuleSet.from_dict({"rules": [{"operator": "is", "value": "House"}]})
        with pytest.raises(FilterRuleError, match="operator"):
            RuleSet.from_dict({"rules": [{"field": "genre", "value": "House"}]})

    def test_rules_must_be_a_list(self):
        with pytest.raises(FilterRuleError, match="must be a list"):
            RuleSet.from_dict({"rules": "genre is House"})

    def test_a_rule_must_be_an_object(self):
        with pytest.raises(FilterRuleError, match="must be an object"):
            RuleSet.from_dict({"rules": ["genre is House"]})

    def test_the_filter_itself_must_be_an_object(self):
        with pytest.raises(FilterRuleError, match="must be an object"):
            RuleSet.from_dict([{"field": "genre"}])


class TestImmutability:
    def test_a_rule_cannot_be_edited_in_place(self):
        validated = rule("genre", "is", "House").validated()
        with pytest.raises(Exception):
            validated.value = "Techno"

    def test_validating_returns_a_new_rule(self):
        original = rule("genre", "IS", " House ")
        assert original.validated() is not original
        assert original.operator == "IS"
