#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Compiling filter rules to SQL (LIBUI-02, DEC-043).

The model (``models/filter_rule.py``) decides what a rule may say; this module
decides what it means against the ``tracks`` table. The split is the same one
LIBUI-01 drew between ``track_query`` and the repository, and it is what lets
Phase 6 reuse the vocabulary without inheriting Phase 4's table.

Three properties hold for every operator here:

**Column names come from the registry, never from the caller.** A field name is
resolved to a :class:`~cuepoint.models.filter_rule.FieldSpec` first, and only
its ``name`` — which the registry declared, not the request — is written into
the SQL. Values are always bound parameters.

**LIKE wildcards in a value are escaped.** Searching for ``100%`` must find the
track called "100% Pure", not every track. The same escape character the text
search uses is used here, for the same reason.

**Empty means "no value at all".** Rekordbox writes a missing text field as
either a missing attribute or an empty string, and a user asking for tracks
with no genre means both. For numbers there is no empty string, so empty means
null — and only null, because a rating of zero is a rating (DEC-034).
"""

from __future__ import annotations

from typing import Any, List, Sequence, Tuple

from cuepoint.models.filter_rule import (
    OP_AFTER,
    OP_ANY_OF,
    OP_BEFORE,
    OP_BETWEEN,
    OP_CONTAINS,
    OP_ENDS_WITH,
    OP_GT,
    OP_GTE,
    OP_IS,
    OP_IS_EMPTY,
    OP_IS_NOT,
    OP_IS_NOT_EMPTY,
    OP_LT,
    OP_LTE,
    OP_NOT_CONTAINS,
    OP_STARTS_WITH,
    TYPE_NUMBER,
    FieldSpec,
    FilterRule,
    FilterRuleError,
    RuleSet,
)

#: Same escape character as the text search, so one convention covers every
#: LIKE in the library.
LIKE_ESCAPE = "!"

_ESCAPE_CLAUSE = f"ESCAPE '{LIKE_ESCAPE}'"


def escape_like(value: str) -> str:
    """Neutralize LIKE wildcards in a user-supplied value."""
    out = value.replace(LIKE_ESCAPE, LIKE_ESCAPE * 2)
    out = out.replace("%", f"{LIKE_ESCAPE}%")
    return out.replace("_", f"{LIKE_ESCAPE}_")


def _column(spec: FieldSpec) -> str:
    """The qualified column for a field.

    Qualified because the browse query puts a playlist-scope CTE in scope, and
    an unqualified column in a subquery is a bug waiting for a column name to
    collide.
    """
    return f"tracks.{spec.name}"


def _empty_test(spec: FieldSpec, *, negated: bool) -> str:
    """ "Has no value" for this field's type.

    Text: null or blank, because Rekordbox uses both for the same thing.
    Number: null only. Zero plays is a real answer, and so is a zero rating.
    """
    column = _column(spec)
    if spec.type == TYPE_NUMBER:
        return f"{column} IS NOT NULL" if negated else f"{column} IS NULL"
    if negated:
        return f"({column} IS NOT NULL AND {column} <> '')"
    return f"({column} IS NULL OR {column} = '')"


def _like(
    spec: FieldSpec, pattern: str, *, negated: bool
) -> Tuple[str, Tuple[Any, ...]]:
    """A LIKE test that is false, not null, for a track with no value.

    SQL three-valued logic is the trap here: ``genre NOT LIKE '%house%'`` is
    null — and therefore not true — for a track whose genre is null, so
    "does not contain house" would hide every track with no genre at all. That
    is not what the words mean, so the null case is spelled out.
    """
    column = _column(spec)
    if negated:
        return (
            f"({column} IS NULL OR {column} NOT LIKE ? {_ESCAPE_CLAUSE})",
            (pattern,),
        )
    return (f"{column} LIKE ? {_ESCAPE_CLAUSE}", (pattern,))


def _comparison(
    spec: FieldSpec, operator: str, value: Any
) -> Tuple[str, Tuple[Any, ...]]:
    """``<``, ``<=``, ``>``, ``>=`` and their date spellings."""
    symbol = {
        OP_LT: "<",
        OP_LTE: "<=",
        OP_GT: ">",
        OP_GTE: ">=",
        OP_BEFORE: "<",
        OP_AFTER: ">",
    }[operator]
    # A null is not less than anything. Stating it costs nothing and makes the
    # clause read the way a reader expects rather than relying on SQL's rules.
    return (
        f"({_column(spec)} IS NOT NULL AND {_column(spec)} {symbol} ?)",
        (value,),
    )


def compile_rule(rule: FilterRule) -> Tuple[str, Tuple[Any, ...]]:
    """Compile one **validated** rule to ``(sql, params)``.

    Args:
        rule: A rule that has been through
            :meth:`~cuepoint.models.filter_rule.FilterRule.validated`. Passing
            an unvalidated one is a programming error, and is refused rather
            than compiled with whatever the value happens to be.

    Raises:
        FilterRuleError: If the rule is not one the model would have accepted.
    """
    # Re-validating is cheap and makes this function safe on its own. Every
    # caller here validates the whole set first; a future caller might not, and
    # the cost of being wrong is an unescaped value in a LIKE pattern.
    checked = rule.validated()
    spec = checked.spec
    operator = checked.operator
    value = checked.value
    column = _column(spec)

    if operator == OP_IS_EMPTY:
        return _empty_test(spec, negated=False), ()
    if operator == OP_IS_NOT_EMPTY:
        return _empty_test(spec, negated=True), ()

    if operator == OP_IS:
        if spec.type == TYPE_NUMBER:
            return f"{column} = ?", (value,)
        # COLLATE NOCASE, because a user typing "house" means the genre
        # "House". The same reason the default sort collates that way.
        return f"{column} = ? COLLATE NOCASE", (value,)

    if operator == OP_IS_NOT:
        if spec.type == TYPE_NUMBER:
            return f"({column} IS NULL OR {column} <> ?)", (value,)
        return (
            f"({column} IS NULL OR {column} <> ? COLLATE NOCASE)",
            (value,),
        )

    if operator == OP_CONTAINS:
        return _like(spec, f"%{escape_like(value)}%", negated=False)
    if operator == OP_NOT_CONTAINS:
        return _like(spec, f"%{escape_like(value)}%", negated=True)
    if operator == OP_STARTS_WITH:
        return _like(spec, f"{escape_like(value)}%", negated=False)
    if operator == OP_ENDS_WITH:
        return _like(spec, f"%{escape_like(value)}", negated=False)

    if operator in (OP_LT, OP_LTE, OP_GT, OP_GTE, OP_BEFORE, OP_AFTER):
        return _comparison(spec, operator, value)

    if operator == OP_BETWEEN:
        low, high = value
        # Inclusive at both ends: "BPM between 122 and 126" includes both, which
        # is what a range control's handles show and what a user reads.
        return (
            f"({column} IS NOT NULL AND {column} >= ? AND {column} <= ?)",
            (low, high),
        )

    if operator == OP_ANY_OF:
        placeholders = ", ".join("?" for _ in value)
        if spec.type == TYPE_NUMBER:
            return f"{column} IN ({placeholders})", tuple(value)
        # `IN` uses the column's collation, which is BINARY here, so the
        # case-insensitive comparison is spelled out per value instead.
        parts = " OR ".join(f"{column} = ? COLLATE NOCASE" for _ in value)
        return f"({parts})", tuple(value)

    # Unreachable while the model and this module agree; a loud failure rather
    # than a clause that quietly matches everything if they ever stop agreeing.
    raise FilterRuleError(
        f"{spec.label} cannot be filtered with {operator!r} — the filter model "
        "allows it but the query builder does not implement it"
    )


def compile_rule_set(rules: RuleSet) -> Tuple[str, Tuple[Any, ...]]:
    """Compile a rule set to ``(sql, params)``.

    Returns ``("", ())`` for an empty set, so a caller can drop it into a WHERE
    clause without asking whether there was anything to add.

    Raises:
        FilterRuleError: If the set or any rule in it is invalid.
    """
    checked = rules.validated()
    if not checked.rules:
        return "", ()

    clauses: List[str] = []
    params: List[Any] = []
    for rule in checked.rules:
        sql, rule_params = compile_rule(rule)
        clauses.append(sql)
        params.extend(rule_params)

    # AND only, per DEC-016. `validated()` has already refused "any", so this
    # is the only join there is; when Phase 6 adds "any", it changes here and
    # in the model, and nowhere else.
    joined = " AND ".join(clauses)
    return (f"({joined})" if len(clauses) > 1 else joined), tuple(params)


__all__: Sequence[str] = (
    "LIKE_ESCAPE",
    "compile_rule",
    "compile_rule_set",
    "escape_like",
)
