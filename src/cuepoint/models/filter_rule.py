#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The library filter model (LIBUI-02, DEC-043, DEC-016).

One rule model serves two features. Phase 4 holds a rule set in view state
while a user narrows the Library table; Phase 6 saves the same structure as a
Smart Collection. Two vocabularies for the same job would drift, and the drift
would show up as a filter that finds tracks a Smart Collection with the same
rules does not.

The shape
---------
A rule set is ``{"match": "all", "rules": [{field, operator, value}, …]}``.
DEC-016 makes v1 flat and AND-only, so ``match`` may only be ``"all"`` today —
but it is on the wire from the start, so Phase 6 can add ``"any"`` without
changing a public shape or migrating stored rule sets.

What this module owns, and what it does not
-------------------------------------------
The vocabulary and the validation live here, with the model: which fields can
be filtered, what type each one is, which operators that type allows, and what
a value has to look like. Turning a valid rule into SQL is the persistence
layer's job (``persistence/filter_sql.py``), because that is where the table
and its columns are known.

Rejection, never omission
-------------------------
An unknown field, an operator the field does not allow, or a value that will
not coerce raises :class:`FilterRuleError` naming the offending clause. It is
never a dropped clause: a filter that silently ignores one of its own rules
answers a different question than the one asked, and shows the user a list of
tracks that looks right.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

#: Field types. The type decides which operators are allowed and how a value is
#: coerced; it is not the SQLite storage class.
TYPE_TEXT = "text"
TYPE_NUMBER = "number"
TYPE_DATE = "date"

FIELD_TYPES = (TYPE_TEXT, TYPE_NUMBER, TYPE_DATE)

#: The only ``match`` value v1 accepts (DEC-016).
MATCH_ALL = "all"

#: Declared, refused, and reserved for Phase 6 rather than invented later.
MATCH_ANY = "any"

MATCH_MODES = (MATCH_ALL, MATCH_ANY)


class FilterRuleError(ValueError):
    """A rule set that cannot be honoured as written.

    A ``ValueError`` so an API layer can map it, alongside
    ``BrowseQueryError``, to one "that request does not make sense" response.
    The message names the clause, because a user has to be able to find which
    of six filters was refused.
    """


# Operator names are what crosses the wire and what Phase 6 stores, so they are
# stable identifiers rather than display text. The renderer labels them: a date
# field shows "before" for `before`, and a number field shows "≤" for `lte`.
OP_IS = "is"
OP_IS_NOT = "is_not"
OP_CONTAINS = "contains"
OP_NOT_CONTAINS = "not_contains"
OP_STARTS_WITH = "starts_with"
OP_ENDS_WITH = "ends_with"
OP_ANY_OF = "any_of"
OP_LT = "lt"
OP_LTE = "lte"
OP_GT = "gt"
OP_GTE = "gte"
OP_BETWEEN = "between"
OP_BEFORE = "before"
OP_AFTER = "after"
OP_IS_EMPTY = "is_empty"
OP_IS_NOT_EMPTY = "is_not_empty"

#: Operators each field type allows. Dates get ``before``/``after`` rather than
#: ``lt``/``gt``: one name per meaning per type, so a clause reads as what it
#: asks and no operator has two spellings.
OPERATORS_BY_TYPE: Dict[str, Tuple[str, ...]] = {
    TYPE_TEXT: (
        OP_IS,
        OP_IS_NOT,
        OP_CONTAINS,
        OP_NOT_CONTAINS,
        OP_STARTS_WITH,
        OP_ENDS_WITH,
        OP_ANY_OF,
        OP_IS_EMPTY,
        OP_IS_NOT_EMPTY,
    ),
    TYPE_NUMBER: (
        OP_IS,
        OP_IS_NOT,
        OP_LT,
        OP_LTE,
        OP_GT,
        OP_GTE,
        OP_BETWEEN,
        OP_ANY_OF,
        OP_IS_EMPTY,
        OP_IS_NOT_EMPTY,
    ),
    TYPE_DATE: (
        OP_IS,
        OP_IS_NOT,
        OP_BEFORE,
        OP_AFTER,
        OP_BETWEEN,
        OP_IS_EMPTY,
        OP_IS_NOT_EMPTY,
    ),
}

#: Operators that take no value at all.
VALUELESS_OPERATORS = (OP_IS_EMPTY, OP_IS_NOT_EMPTY)

#: Operators whose value is a list.
LIST_OPERATORS = (OP_ANY_OF, OP_BETWEEN)


@dataclass(frozen=True)
class FieldSpec:
    """One filterable field.

    Attributes:
        name: What crosses the wire, and the ``tracks`` column it filters.
        type: One of :data:`FIELD_TYPES`.
        label: What a person calls it.
        facetable: Whether "which values exist, and how many tracks each" is a
            useful question. True for the small, repeating vocabularies a DJ
            actually filters by; false for free text like a comment, where
            every value is unique and a facet list would be as long as the
            library.
        integer: Numbers that are whole. Rating is stars, play count is plays;
            neither is ever 3.5, and coercing "4.0" to 4 keeps a filter built
            from a facet value matching the rows that facet counted.
    """

    name: str
    type: str
    label: str
    facetable: bool = False
    integer: bool = False

    @property
    def operators(self) -> Tuple[str, ...]:
        """Operators this field allows."""
        return OPERATORS_BY_TYPE[self.type]


#: Every filterable field. The column list is deliberately narrower than
#: ``tracks``: identity columns (``id``, ``rekordbox_track_id``,
#: ``normalized_path``) and bookkeeping (``created_at``, ``updated_at``) are
#: not things a user filters a library by, and exposing them would make them a
#: public contract for no one's benefit.
FIELDS: Tuple[FieldSpec, ...] = (
    FieldSpec("title", TYPE_TEXT, "Title"),
    FieldSpec("artist", TYPE_TEXT, "Artist", facetable=True),
    FieldSpec("remixer", TYPE_TEXT, "Remixer", facetable=True),
    FieldSpec("album", TYPE_TEXT, "Album", facetable=True),
    FieldSpec("label", TYPE_TEXT, "Label", facetable=True),
    FieldSpec("genre", TYPE_TEXT, "Genre", facetable=True),
    FieldSpec("key", TYPE_TEXT, "Key", facetable=True),
    FieldSpec("colour", TYPE_TEXT, "Colour", facetable=True),
    FieldSpec("comment", TYPE_TEXT, "Comment"),
    FieldSpec("file_path", TYPE_TEXT, "File path"),
    FieldSpec("bpm", TYPE_NUMBER, "BPM"),
    FieldSpec("year", TYPE_NUMBER, "Year", facetable=True, integer=True),
    FieldSpec("rating", TYPE_NUMBER, "Rating", facetable=True, integer=True),
    FieldSpec("play_count", TYPE_NUMBER, "Play count", integer=True),
    FieldSpec("bitrate", TYPE_NUMBER, "Bitrate", facetable=True, integer=True),
    FieldSpec("duration_seconds", TYPE_NUMBER, "Length", integer=True),
    FieldSpec("date_added", TYPE_DATE, "Date added"),
)

_FIELDS_BY_NAME: Dict[str, FieldSpec] = {spec.name: spec for spec in FIELDS}

#: Fields a facet can be computed for.
FACETABLE_FIELDS: Tuple[str, ...] = tuple(
    spec.name for spec in FIELDS if spec.facetable
)


def field_spec(name: str) -> FieldSpec:
    """Return the spec for a field name.

    Raises:
        FilterRuleError: If no such field is filterable.
    """
    spec = _FIELDS_BY_NAME.get(str(name).strip())
    if spec is None:
        known = ", ".join(sorted(_FIELDS_BY_NAME))
        raise FilterRuleError(f"Cannot filter by {name!r}. Filterable fields: {known}")
    return spec


def _coerce_number(value: Any, spec: FieldSpec, operator: str) -> Any:
    """Coerce one value for a number field, or say why it cannot be.

    Numbers arrive as text from a query string and as numbers from a facet, and
    both have to mean the same thing.
    """
    if isinstance(value, bool):
        # bool is an int in Python, and "rating is True" is not a question.
        raise FilterRuleError(
            f"{spec.label} needs a number, not {value!r} ({operator})"
        )
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise FilterRuleError(
            f"{spec.label} needs a number, not {value!r} ({operator})"
        ) from None
    if number != number or number in (float("inf"), float("-inf")):
        raise FilterRuleError(f"{spec.label} needs a real number, not {value!r}")
    if spec.integer:
        if number != int(number):
            raise FilterRuleError(f"{spec.label} is a whole number; {value!r} is not")
        return int(number)
    return number


def _coerce_text(value: Any, spec: FieldSpec, operator: str) -> str:
    """Coerce one value for a text or date field."""
    if value is None or isinstance(value, (list, tuple, dict, bool)):
        raise FilterRuleError(f"{spec.label} needs a value, not {value!r} ({operator})")
    text = str(value)
    if not text.strip() and operator != OP_IS:
        # "is" with an empty string is a legitimate question — Rekordbox writes
        # both null and "" for a missing value — but "contains nothing" matches
        # everything, which is never what a user meant to ask.
        raise FilterRuleError(
            f"{spec.label} {operator!r} needs something to match against"
        )
    return text


@dataclass(frozen=True)
class FilterRule:
    """One clause: a field, an operator, and a value.

    Frozen, because a rule set is passed through a service, a repository and a
    statement builder, and none of them should be able to edit the question
    they were asked.
    """

    field: str
    operator: str
    value: Any = None

    @property
    def spec(self) -> FieldSpec:
        """The field this rule filters."""
        return field_spec(self.field)

    def validated(self) -> "FilterRule":
        """Return a normalized copy, or raise.

        Raises:
            FilterRuleError: If the field is not filterable, the operator is
                not one that field allows, or the value cannot be coerced.
        """
        spec = field_spec(self.field)
        operator = str(self.operator or "").strip().lower()

        if operator not in spec.operators:
            allowed = ", ".join(spec.operators)
            raise FilterRuleError(
                f"{spec.label} cannot be filtered with {self.operator!r}. "
                f"Allowed for a {spec.type} field: {allowed}"
            )

        value = self._validated_value(spec, operator)
        return FilterRule(field=spec.name, operator=operator, value=value)

    def _validated_value(self, spec: FieldSpec, operator: str) -> Any:
        if operator in VALUELESS_OPERATORS:
            # A value here means the caller believes it does something.
            if self.value not in (None, "", [], ()):
                raise FilterRuleError(
                    f"{spec.label} {operator!r} takes no value, got {self.value!r}"
                )
            return None

        if operator in LIST_OPERATORS:
            return self._validated_list(spec, operator)

        if spec.type == TYPE_NUMBER:
            return _coerce_number(self.value, spec, operator)
        return _coerce_text(self.value, spec, operator)

    def _validated_list(self, spec: FieldSpec, operator: str) -> Tuple[Any, ...]:
        if isinstance(self.value, (str, bytes)) or not isinstance(
            self.value, (list, tuple)
        ):
            raise FilterRuleError(
                f"{spec.label} {operator!r} needs a list of values, got {self.value!r}"
            )
        values = list(self.value)

        if operator == OP_BETWEEN:
            if len(values) != 2:
                raise FilterRuleError(
                    f"{spec.label} 'between' needs exactly two values, got "
                    f"{len(values)}"
                )
            if spec.type == TYPE_NUMBER:
                low, high = (_coerce_number(v, spec, operator) for v in values)
            else:
                low, high = (_coerce_text(v, spec, operator) for v in values)
            # A range typed backwards is a slip, not a request for nothing.
            # Ordering it is what the user meant and what every other tool does.
            return (low, high) if low <= high else (high, low)

        if not values:
            raise FilterRuleError(f"{spec.label} 'any of' needs at least one value")
        if spec.type == TYPE_NUMBER:
            return tuple(_coerce_number(v, spec, operator) for v in values)
        return tuple(_coerce_text(v, spec, operator) for v in values)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API. A public shape; extend rather than rename."""
        payload: Dict[str, Any] = {"field": self.field, "operator": self.operator}
        if self.operator not in VALUELESS_OPERATORS:
            value = self.value
            payload["value"] = list(value) if isinstance(value, tuple) else value
        return payload

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "FilterRule":
        """Build a rule from a decoded JSON object, unvalidated.

        Raises:
            FilterRuleError: If the payload is not an object with a field and
                an operator. Structure is checked here; meaning in
                :meth:`validated`.
        """
        if not isinstance(payload, Mapping):
            raise FilterRuleError(f"A filter rule must be an object, got {payload!r}")
        missing = [key for key in ("field", "operator") if not payload.get(key)]
        if missing:
            raise FilterRuleError(
                f"A filter rule needs {' and '.join(missing)}: {dict(payload)!r}"
            )
        return cls(
            field=str(payload["field"]),
            operator=str(payload["operator"]),
            value=payload.get("value"),
        )


@dataclass(frozen=True)
class RuleSet:
    """A flat, AND-only set of rules (DEC-016).

    ``match`` exists so Phase 6 can add ``"any"`` without changing this shape.
    It is validated against :data:`MATCH_MODES` and refused for anything but
    ``"all"`` today, with a message that says so rather than silently
    AND-ing an OR.
    """

    rules: Tuple[FilterRule, ...] = ()
    match: str = MATCH_ALL

    def __bool__(self) -> bool:
        """True when there is anything to filter by."""
        return bool(self.rules)

    def validated(self) -> "RuleSet":
        """Return a normalized copy, or raise.

        Raises:
            FilterRuleError: If ``match`` is not supported, or any rule is
                invalid. The first invalid rule stops it, and its message names
                the field, so a user is told which clause is wrong rather than
                that "the filter" is.
        """
        match = str(self.match or MATCH_ALL).strip().lower()
        if match == MATCH_ANY:
            raise FilterRuleError(
                "Matching any rule instead of all of them arrives with Smart "
                "Collections; today every rule has to match"
            )
        if match not in MATCH_MODES:
            raise FilterRuleError(
                f"match must be {' or '.join(repr(m) for m in MATCH_MODES)}, "
                f"not {self.match!r}"
            )
        return RuleSet(
            rules=tuple(rule.validated() for rule in self.rules), match=match
        )

    def without_field(self, field: str) -> "RuleSet":
        """Return a copy with every rule on ``field`` removed.

        What a facet is computed against: a genre facet that honoured the genre
        the user already chose would report that one genre and a count, and the
        list they need in order to choose a second would be empty.
        """
        name = str(field).strip()
        return RuleSet(
            rules=tuple(rule for rule in self.rules if rule.field != name),
            match=self.match,
        )

    def fields(self) -> Tuple[str, ...]:
        """Every field this set filters, in order, without repeats."""
        seen: List[str] = []
        for rule in self.rules:
            if rule.field not in seen:
                seen.append(rule.field)
        return tuple(seen)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API. A public shape; extend rather than rename."""
        return {"match": self.match, "rules": [rule.to_dict() for rule in self.rules]}

    @classmethod
    def from_dict(cls, payload: Optional[Mapping[str, Any]]) -> "RuleSet":
        """Build a rule set from a decoded JSON object.

        ``None`` and ``{}`` both mean "no filters", because a renderer that has
        never opened the filter bar and one that has cleared it are asking the
        same question.

        Raises:
            FilterRuleError: If the payload is not an object, or ``rules`` is
                not a list of rule objects.
        """
        if payload is None:
            return cls()
        if not isinstance(payload, Mapping):
            raise FilterRuleError(f"A filter must be an object, got {payload!r}")

        raw_rules = payload.get("rules", [])
        if raw_rules is None:
            raw_rules = []
        if isinstance(raw_rules, (str, bytes)) or not isinstance(
            raw_rules, (list, tuple)
        ):
            raise FilterRuleError(f"rules must be a list, got {raw_rules!r}")

        return cls(
            rules=tuple(FilterRule.from_dict(item) for item in raw_rules),
            match=str(payload.get("match") or MATCH_ALL),
        )


@dataclass(frozen=True)
class FacetValue:
    """One value a facetable field takes, and how many tracks have it.

    ``value`` is ``None`` for the tracks that have no value at all — null or
    blank, which Rekordbox writes interchangeably. It is counted rather than
    dropped, because "how many of my tracks have no genre" is one of the more
    useful things a library can tell you, and it is what the ``is_empty``
    operator filters by.
    """

    value: Optional[str]
    count: int

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API."""
        return {"value": self.value, "count": self.count}


@dataclass(frozen=True)
class Facet:
    """Every value of one field, with counts.

    Attributes:
        field: The field these values belong to.
        values: Most common first; the "no value" bucket last, whatever its
            count, because it is not a value.
        truncated: True when the field has more distinct values than were
            returned. A library can hold thousands of labels, and a filter list
            has to stay a list.
        total_values: How many distinct values exist, the returned page
            included.
    """

    field: str
    values: Tuple[FacetValue, ...] = ()
    truncated: bool = False
    total_values: int = 0

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API."""
        return {
            "field": self.field,
            "values": [value.to_dict() for value in self.values],
            "truncated": self.truncated,
            "total_values": self.total_values,
        }


@dataclass(frozen=True)
class FacetRange:
    """The span of a numeric field, and how many tracks have no value.

    What a range control needs to draw itself: where to put its ends, and
    whether to offer "no value" as a separate choice.
    """

    field: str
    minimum: Optional[float] = None
    maximum: Optional[float] = None
    missing: int = 0

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API."""
        return {
            "field": self.field,
            "min": self.minimum,
            "max": self.maximum,
            "missing": self.missing,
        }


def describe_fields() -> List[Dict[str, Any]]:
    """The filter vocabulary, as the renderer needs it (LIBUI-08).

    Sent rather than duplicated in TypeScript: the renderer must not be able to
    build a clause the engine will refuse, and the only way to guarantee that
    is for the list of what is buildable to come from the same place that
    refuses.
    """
    return [
        {
            "name": spec.name,
            "type": spec.type,
            "label": spec.label,
            "facetable": spec.facetable,
            "integer": spec.integer,
            "operators": list(spec.operators),
        }
        for spec in FIELDS
    ]


def valueless(operator: str) -> bool:
    """True when an operator takes no value."""
    return operator in VALUELESS_OPERATORS


__all__: Sequence[str] = (
    "Facet",
    "FacetRange",
    "FacetValue",
    "FieldSpec",
    "FilterRule",
    "FilterRuleError",
    "RuleSet",
    "FACETABLE_FIELDS",
    "FIELDS",
    "FIELD_TYPES",
    "MATCH_ALL",
    "MATCH_ANY",
    "OPERATORS_BY_TYPE",
    "TYPE_DATE",
    "TYPE_NUMBER",
    "TYPE_TEXT",
    "describe_fields",
    "field_spec",
    "valueless",
)
