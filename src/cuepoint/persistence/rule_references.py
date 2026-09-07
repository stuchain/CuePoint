#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What a membership rule names, and whether it still exists (ORG-05, DEC-060).

A tag rule and a Collection rule carry an id rather than a name, because both
can be renamed and a saved rule that quietly changed meaning when someone
corrected a spelling would be worse than one that stopped working. The price of
an id is that it can name a row that is gone, and this module is where that is
noticed.

Two refusals live here, and both are refusals rather than empty answers:

**A rule naming a deleted tag or Collection is broken, not empty.** Deleting a
Collection that a Smart Collection filters on would otherwise turn it into a
Smart Collection that matches nothing, which reads exactly like a Smart
Collection whose rules are too narrow. ORG-06 turns
:class:`BrokenRuleError` into a visible state on the row; here it is a message
naming the clause.

**A rule may not name a Smart Collection** (DEC-060). A Smart Collection is a
question, not a set of tracks, and a rule that filtered on another rule's
current answer would need recursion, cycle detection and a bound on how long an
answer may take to compute. Refusing it costs one lookup and buys all three.
Membership in a *Collection* — a real list of rows — is a fact about a track,
and that is exactly what a rule is allowed to ask about.

Why here rather than in the compiler: whether a clause makes sense is a
question about the clause, and ``filter_sql`` answers it without a database.
Whether the row it names is still there is a question about the database, and
answering it needs a connection. Keeping the two apart is what lets the
compiler stay a pure function with a test suite that opens nothing.
"""

from __future__ import annotations

import sqlite3
from typing import Any, Dict, Sequence, Tuple

from cuepoint.models.filter_rule import (
    OP_ANY_OF,
    OP_IS_EMPTY,
    TYPE_TAG,
    FieldSpec,
    FilterRule,
    FilterRuleError,
    RuleSet,
    field_spec,
)
from cuepoint.persistence.id_chunks import chunked, unique_ids

#: The kind of ``collections`` row a rule may not name (DEC-060).
SMART = "smart"


class BrokenRuleError(FilterRuleError):
    """A rule that named something which is no longer there.

    A subclass rather than a flag, so ORG-06 can tell "this Smart Collection is
    broken and should say so in the tree" apart from "this request was
    malformed" — while every handler that already maps a
    :class:`~cuepoint.models.filter_rule.FilterRuleError` to one "that request
    does not make sense" response keeps working untouched.
    """


def rule_ids(rule: FilterRule) -> Tuple[int, ...]:
    """The ids one membership rule names, in the order it names them.

    Empty for ``is_empty``, which names nothing: "untagged" is a question about
    the absence of rows rather than about any particular tag.
    """
    if rule.operator == OP_IS_EMPTY:
        return ()
    if rule.operator == OP_ANY_OF:
        return tuple(int(value) for value in rule.value)
    return (int(rule.value),)


def _clause(spec: FieldSpec, rule: FilterRule) -> str:
    """How a refusal names the clause it refused.

    A user can have six filters on screen, and "the filter is broken" tells
    them to check all six.
    """
    return f"{spec.label} {rule.operator!r}"


def _lookup(
    connection: sqlite3.Connection, sql: str, ids: Sequence[int]
) -> Dict[int, Any]:
    """Read the rows for ``ids``, chunked, keyed by id.

    Chunked because a rule may name a lot of them: ``tag any_of`` takes a list,
    and a renderer sending six hundred tag chips must not meet SQLite's
    parameter limit as a crash.
    """
    found: Dict[int, Any] = {}
    for chunk in chunked(list(ids)):
        placeholders = ", ".join("?" for _ in chunk)
        for row in connection.execute(sql.format(ids=placeholders), chunk):
            found[int(row["id"])] = row
    return found


def _check_tags(
    connection: sqlite3.Connection,
    spec: FieldSpec,
    rule: FilterRule,
    ids: Sequence[int],
) -> None:
    found = _lookup(connection, "SELECT id FROM tags WHERE id IN ({ids})", ids)
    for identifier in ids:
        if identifier not in found:
            raise BrokenRuleError(
                f"{_clause(spec, rule)} names tag {identifier}, which no longer exists"
            )


def _check_collections(
    connection: sqlite3.Connection,
    spec: FieldSpec,
    rule: FilterRule,
    ids: Sequence[int],
) -> None:
    found = _lookup(
        connection,
        "SELECT id, kind, name FROM collections WHERE id IN ({ids})",
        ids,
    )
    for identifier in ids:
        row = found.get(identifier)
        if row is None:
            raise BrokenRuleError(
                f"{_clause(spec, rule)} names Collection {identifier}, which no "
                "longer exists"
            )
        if row["kind"] == SMART:
            raise FilterRuleError(
                f"{_clause(spec, rule)} names {row['name']!r}, which is a "
                "Smart Collection. A rule can filter on what a track is filed "
                "in, not on what another rule currently answers"
            )


def check_rule_references(connection: sqlite3.Connection, rules: RuleSet) -> None:
    """Refuse a rule set that names a tag or Collection it should not.

    Rules are checked in the order they were written, so a user with several
    filters is told about the first one that is wrong rather than about
    whichever the database happened to answer first.

    Args:
        connection: An open connection to the library.
        rules: The rule set. Validated here, so this is safe to call on its
            own; every caller validates the whole browse query first anyway.

    Raises:
        BrokenRuleError: If a rule names a tag or Collection that is gone.
        FilterRuleError: If a rule names a Smart Collection (DEC-060), or if
            the set is not one the model would have accepted.
    """
    for rule in rules.validated().rules:
        spec = field_spec(rule.field)
        if not spec.is_membership:
            continue
        ids = unique_ids(rule_ids(rule))
        if not ids:
            continue
        if spec.type == TYPE_TAG:
            _check_tags(connection, spec, rule, ids)
        else:
            _check_collections(connection, spec, rule, ids)


__all__: Sequence[str] = (
    "SMART",
    "BrokenRuleError",
    "check_rule_references",
    "rule_ids",
)
