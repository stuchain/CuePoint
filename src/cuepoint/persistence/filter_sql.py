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

ORG-05 added CuePoint's own data to the same vocabulary, and it added one thing
to the shape above: a field is no longer always a column. Two kinds now exist.
A **column field** names an expression — ``tracks.genre``, ``meta.notes``, or
``COALESCE(meta.rating, tracks.rating)`` for the rating a user actually sees —
and every operator above works on it unchanged. A **membership field** names a
link table instead, and is answered by membership in a set of track ids
rather than by a comparison: a track has as many tags as it was given, so "has
this tag" is a question about rows, not about a value. There is one subquery
shape for both membership fields, which is the point of writing it once.

That shape also settles a question ORG-04 left open: a track filed in the same
Collection twice matches ``in_collection`` once, because a set has no
duplicates. A join would have returned it twice and the table would have shown
it twice.

The expressions that read ``meta.`` need the join that establishes that alias.
Which rule sets need it is :func:`requires_metadata`; writing it is
``track_query``'s job, because that is where the FROM clause is built.
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
    OP_HAS_TAG,
    OP_IN_COLLECTION,
    OP_IS,
    OP_IS_EMPTY,
    OP_IS_NOT,
    OP_IS_NOT_EMPTY,
    OP_LT,
    OP_LTE,
    OP_NOT_CONTAINS,
    OP_NOT_HAS_TAG,
    OP_NOT_IN_COLLECTION,
    OP_STARTS_WITH,
    TYPE_BOOL,
    TYPE_NUMBER,
    FieldSpec,
    LinkTable,
    FilterRule,
    FilterRuleError,
    RuleSet,
    field_spec,
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
    """The qualified expression a field is read from.

    The registry's answer, never the caller's: a field name is resolved to a
    :class:`~cuepoint.models.filter_rule.FieldSpec` first, and only what the
    registry declared is written into the SQL. It is qualified because the
    browse query puts a playlist-scope CTE and, for a CuePoint field, a joined
    table in scope, and an unqualified column is a bug waiting for a name to
    collide.
    """
    return spec.expression


def _link(spec: FieldSpec) -> LinkTable:
    """The link table for a membership field."""
    if spec.link is None:  # pragma: no cover - guarded by the caller's dispatch
        raise FilterRuleError(f"{spec.label} is not a membership field")
    return spec.link


def _membership(
    spec: FieldSpec, values: Sequence[Any], *, negated: bool
) -> Tuple[str, Tuple[Any, ...]]:
    """ "Is this track in that list", as SQL — the one membership shape.

    Written once for tags and Collections rather than once each, because what
    is easy to get wrong is the same in both: that this asks about a track
    rather than about its membership rows. A track filed twice in one
    Collection satisfies it once, because a set has no duplicates — a join
    would have returned that track twice and the table would have shown it
    twice. It is the shape the playlist scope already uses, for that reason.

    It is also the faster shape, which was not obvious. A correlated
    ``EXISTS`` probes the link table once per track in the library; gathering
    the ids first reads one run of an index and tests a set. Measured over
    50,000 tracks and 200,000 assignments, with the index migration 0010
    widens: "has this tag" 18.1 ms as ``EXISTS`` against **8.4 ms** as a set,
    "any of five tags" 51.5 ms against **23.8 ms**, and "in this Collection"
    11.1 ms against **1.4 ms**.

    ``NOT IN`` is safe here and would not be everywhere: it answers null — and
    therefore not true — if the subquery can produce a null, which would
    silently return no tracks at all. Both link tables declare their track
    column ``NOT NULL`` (migration 0009), and a test asserts that, because it
    is the kind of thing a later migration could relax without anyone
    connecting it to a filter that stopped matching.
    """
    link = _link(spec)
    placeholders = ", ".join("?" for _ in values)
    inner = (
        f"SELECT {link.track_column} FROM {link.table}"
        f" WHERE {link.value_column} IN ({placeholders})"
    )
    keyword = "NOT IN" if negated else "IN"
    return f"tracks.id {keyword} ({inner})", tuple(values)


def _no_membership(spec: FieldSpec) -> str:
    """ "This track is in none of them" — an untagged track, and nothing else."""
    link = _link(spec)
    return f"tracks.id NOT IN (SELECT {link.track_column} FROM {link.table})"


def _compile_membership(
    spec: FieldSpec, operator: str, value: Any
) -> Tuple[str, Tuple[Any, ...]]:
    """Compile a tag or Collection rule.

    Values are ids the model has already coerced to positive whole numbers, and
    they are bound, so nothing a caller sent reaches the SQL text here either.
    Whether the id names a row that still exists — and, for a Collection,
    whether it names one a rule is allowed to name — is a question about the
    database rather than about the clause, and it is answered before this in
    ``persistence/rule_references.py``.
    """
    if operator == OP_IS_EMPTY:
        return _no_membership(spec), ()
    if operator in (OP_HAS_TAG, OP_IN_COLLECTION):
        return _membership(spec, (value,), negated=False)
    if operator in (OP_NOT_HAS_TAG, OP_NOT_IN_COLLECTION):
        return _membership(spec, (value,), negated=True)
    if operator == OP_ANY_OF:
        return _membership(spec, tuple(value), negated=False)

    # Unreachable while the model and this module agree; see `compile_rule`.
    raise FilterRuleError(
        f"{spec.label} cannot be filtered with {operator!r} — the filter model "
        "allows it but the query builder does not implement it"
    )


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

    # Before anything reads a column: a membership field does not have one.
    if spec.is_membership:
        return _compile_membership(spec, operator, value)

    column = _column(spec)

    if operator == OP_IS_EMPTY:
        return _empty_test(spec, negated=False), ()
    if operator == OP_IS_NOT_EMPTY:
        return _empty_test(spec, negated=True), ()

    if operator == OP_IS:
        if spec.type in (TYPE_NUMBER, TYPE_BOOL):
            # A yes/no compares as the 0 or 1 SQLite stores; there is no case
            # in it, and a collation on an integer comparison would only read
            # as though there might be.
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


def requires_metadata(rules: RuleSet) -> bool:
    """True when a rule set reads CuePoint's metadata table.

    Asked so the join is written only when it is needed. It is a cheap join —
    ``track_metadata.track_id`` is the table's primary key, so it is one probe
    per row — but "cheap" over fifty thousand rows is still fifty thousand
    probes, and every browse query the Library page has ever run would pay
    them for nothing. A filter bar with no CuePoint clause in it produces the
    same SQL it produced before ORG-05.

    Takes a rule set whose fields are known; an unknown one raises, exactly as
    compiling it would.
    """
    return any(field_spec(rule.field).metadata for rule in rules.rules)


__all__: Sequence[str] = (
    "LIKE_ESCAPE",
    "compile_rule",
    "compile_rule_set",
    "escape_like",
    "requires_metadata",
)
