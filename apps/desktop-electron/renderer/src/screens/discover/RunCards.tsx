/**
 * A dig's results as rows of cards (Results tab).
 *
 * Instead of one long list, what a dig found is grouped by where it came from:
 * the charts your artists made (or the genres' charts, when no artist was
 * chosen), a card per artist with their charts and new releases, a card per
 * label with its new releases. Which cards there are, and which row each is in,
 * is the engine's (`DiscoverRunGroups`); this draws them.
 *
 * - A card is a button: it opens that card's tracks. Its tick is a separate,
 *   labelled checkbox beside it, so ticking never opens anything.
 * - Ticked cards raise a bar: "Ticked: Argy, Afterlife · 20 tracks · 3 already
 *   in your library", with Add to wantlist and Add to playlist. A track on two
 *   ticked cards is counted once, and tracks the library already owns are left
 *   out (and said so).
 * - "Everything" opens the whole dig as the single list it always was.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  DiscoverChartsMode,
  DiscoverGroupCard,
  DiscoverGroupRef,
  DiscoverGroupRow,
  DiscoverGroupSummary,
  DiscoverRunGroups,
} from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { Hint } from "../../components/Hint";
import { Notice } from "../../components/Notice";
import { opensDialog } from "../../format/words";
import { LinkButton } from "../../components/LinkButton";
import { PixelIcon } from "../../components/PixelIcon";
import { countNoun, formatCount } from "../../format/counts";
import { GroupArt } from "./GroupArt";
import { PushDialog, type PushTarget } from "./PushDialog";
import { beatportUsable, unusableReason } from "./beatportState";
import { refusalText } from "./discoverFormat";
import { NO_ENGINE, type DiscoverTools } from "./discoverTools";
import {
  ROW_LIMIT,
  ROW_NOTES,
  cardCounts,
  cardId,
  cardName,
  cardRef,
  rowCount,
  rowTitle,
  tickedCards,
  tickedLine,
  wantlistLine,
} from "./groupCards";
import { reportUnexpected } from "../../reporting/reporting";
import { userMessage } from "../../api/userMessage";
import "./discoverCards.css";

interface RunCardsProps {
  runId: number;
  groups: DiscoverRunGroups;
  tools: DiscoverTools;
  /** Changes when the dig's cards may have changed. */
  version: number;
  onOpen: (card: DiscoverGroupCard) => void;
  onEverything: () => void;
  /** Ticked cards and open rows live in the page, so they survive opening a card. */
  ticked: ReadonlySet<string>;
  onTicked: (next: ReadonlySet<string>) => void;
  expanded: ReadonlySet<string>;
  onExpanded: (next: ReadonlySet<string>) => void;
}

function CardTile({
  runId,
  card,
  mode,
  ticked,
  onTick,
  onOpen,
}: {
  runId: number;
  card: DiscoverGroupCard;
  mode: DiscoverChartsMode | null;
  ticked: boolean;
  onTick: () => void;
  onOpen: () => void;
}) {
  return (
    <li className={`discover-card discover-card--${card.kind}${ticked ? " discover-card--ticked" : ""}`}>
      <button type="button" className="discover-card__open" aria-label={cardName(card, mode)} onClick={onOpen}>
        <GroupArt runId={runId} kind={card.kind} cardKey={card.key} name={card.name} hasArt={card.has_art} />
        <span className="discover-card__title">{card.name}</span>
        {card.kind === "chart" && card.curator && !card.name.includes(card.curator) && (
          <span className="discover-card__curator">by {card.curator}</span>
        )}
        <span className="discover-card__counts">{cardCounts(card, mode)}</span>
      </button>
      <label className="discover-card__tick">
        <input type="checkbox" aria-label={`Tick ${card.name}`} checked={ticked} onChange={onTick} />
      </label>
    </li>
  );
}

function CardRow({
  runId,
  row,
  mode,
  ticked,
  all,
  onAll,
  onTick,
  onOpen,
}: {
  runId: number;
  row: DiscoverGroupRow;
  mode: DiscoverChartsMode | null;
  ticked: ReadonlySet<string>;
  all: boolean;
  onAll: () => void;
  onTick: (card: DiscoverGroupCard) => void;
  onOpen: (card: DiscoverGroupCard) => void;
}) {
  const overflow = row.cards.length > ROW_LIMIT;
  const shown = all || !overflow ? row.cards : row.cards.slice(0, ROW_LIMIT);
  const note = ROW_NOTES[row.id];
  return (
    <section className="discover-cards__row" aria-label={rowTitle(row.id, mode)}>
      <header className="discover-cards__row-head">
        <h3 className="discover-cards__row-title">{rowTitle(row.id, mode)}</h3>
        <span className="discover-note">
          {formatCount(rowCount(row.id, row.cards, mode))}
          {note ? ` · ${note}` : ""}
        </span>
        {overflow && (
          <LinkButton className="discover-cards__see-all" aria-expanded={all} onClick={onAll}>
            {all ? "Show fewer" : "See all"}
            <PixelIcon name={all ? "chevron-down" : "chevron-right"} />
          </LinkButton>
        )}
      </header>
      <ul className="discover-cards__grid">
        {shown.map((card) => (
          <CardTile
            key={cardId(card)}
            runId={runId}
            card={card}
            mode={mode}
            ticked={ticked.has(cardId(card))}
            onTick={() => onTick(card)}
            onOpen={() => onOpen(card)}
          />
        ))}
      </ul>
    </section>
  );
}

export function RunCards({
  runId,
  groups,
  tools,
  version,
  onOpen,
  onEverything,
  ticked,
  onTicked,
  expanded,
  onExpanded,
}: RunCardsProps) {
  const mode = groups.charts_mode;
  const [summary, setSummary] = useState<DiscoverGroupSummary | null>(null);
  const [pushOpen, setPushOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const { notify } = tools;

  // A card that is no longer there cannot stay ticked.
  const present = useMemo(
    () => new Set(groups.rows.flatMap((row) => row.cards.map((card) => cardId(card)))),
    [groups],
  );
  useEffect(() => {
    const kept = [...ticked].filter((id) => present.has(id));
    if (kept.length !== ticked.size) onTicked(new Set(kept));
  }, [present, ticked, onTicked]);

  const chosen = useMemo(() => tickedCards(groups.rows, ticked), [groups.rows, ticked]);
  // The ticked cards as a stable value: a new array of the same cards is not a new question.
  const refsText = JSON.stringify(chosen.map(cardRef));
  const refs = useMemo(() => JSON.parse(refsText) as DiscoverGroupRef[], [refsText]);

  // How many distinct tracks the ticked cards hold, and how many are owned: the engine's count.
  useEffect(() => {
    const bridge = window.cuepoint?.getDiscoveryGroupSummary;
    if (refs.length === 0 || !bridge) {
      setSummary(null);
      return;
    }
    let current = true;
    void bridge({ run_id: runId, groups: refs })
      .then((answer) => {
        if (current && !answer.refusal) setSummary(answer.value);
      })
      .catch((cause: unknown) => reportUnexpected(cause));
    return () => {
      current = false;
    };
  }, [runId, refs, version]);

  const tick = useCallback(
    (card: DiscoverGroupCard) => {
      const next = new Set(ticked);
      const id = cardId(card);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onTicked(next);
    },
    [ticked, onTicked],
  );

  const toggleRow = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onExpanded(next);
  };

  const addToWantlist = async () => {
    const bridge = window.cuepoint?.addToWantlist;
    if (!bridge) {
      notify(NO_ENGINE, "warning");
      return;
    }
    setWorking(true);
    try {
      const answer = await bridge({ run_id: runId, groups: refs });
      if (answer.refusal) notify(refusalText(answer.refusal), "warning");
      else notify(wantlistLine(answer.value.message, summary?.owned ?? 0), "success");
    } catch (cause) {
      reportUnexpected(cause);
      notify(userMessage(cause), "warning");
    } finally {
      setWorking(false);
    }
  };

  const push = async (target: PushTarget, includeOwned: boolean) => {
    const refused = await tools.push({
      name: target.name,
      include_owned: includeOwned,
      run_id: runId,
      groups: refs,
      ...("playlistId" in target ? { playlist_id: target.playlistId } : {}),
    });
    if (!refused) setPushOpen(false);
    return refused;
  };

  const pushable = beatportUsable(tools.beatportState);

  return (
    <div className="discover-cards">
      <div className="discover-cards__top">
        <Button variant="secondary" onClick={onEverything}>
          {`Everything · ${countNoun(groups.tracks, "track")}`}
        </Button>
        <span className="discover-note">Duplicates are merged.</span>
      </div>

      {groups.notes.map((note) => (
        <Notice key={note} kind="warning">
          {note}
        </Notice>
      ))}

      {groups.rows.map((row) => (
        <CardRow
          key={row.id}
          runId={runId}
          row={row}
          mode={mode}
          ticked={ticked}
          all={expanded.has(row.id)}
          onAll={() => toggleRow(row.id)}
          onTick={tick}
          onOpen={onOpen}
        />
      ))}

      {chosen.length > 0 && (
        <div className="discover-cards__bar" role="group" aria-label="Ticked cards">
          <span className="discover-cards__bar-text" role="status">
            {tickedLine(chosen, summary)}
          </span>
          <div className="discover-cards__bar-actions">
            <Button variant="secondary" loading={working} onClick={() => void addToWantlist()}>
              Add to wantlist
            </Button>
            <Hint text={pushable ? undefined : (unusableReason(tools.beatportState) ?? undefined)}>
              <Button variant="primary"
                disabled={!pushable || tools.pushing}
                onClick={() => setPushOpen(true)}
              >
                {opensDialog("Add to playlist")}
              </Button>
            </Hint>
          </div>
        </div>
      )}

      <PushDialog
        open={pushOpen}
        allowExisting
        what={(includeOwned) => {
          // The owned ones are skipped unless they are asked for: say what will go.
          const all = summary?.tracks ?? 0;
          const going = includeOwned ? all : Math.max(0, all - (summary?.owned ?? 0));
          return `the ${countNoun(going, "track")} on the ticked ${chosen.length === 1 ? "card" : "cards"}`;
        }}
        defaultName={tools.options.defaults.playlist_name}
        maxNameLength={tools.options.limits.max_playlist_name_length}
        onPush={push}
        onClose={() => setPushOpen(false)}
      />
    </div>
  );
}
