import { useMemo, useState } from "react";
import { Button, Modal } from "../components";
import {
  applyCandidateToResult,
  currentMatchFromResult,
  sortCandidates,
} from "../api/candidateUtils";
import type { MatchCandidate, TrackResult } from "../mocks/types";
import "./CandidateDialog.css";

export interface CandidateDialogProps {
  open: boolean;
  row: TrackResult | null;
  onClose: () => void;
  onSelectCandidate: (candidate: MatchCandidate) => void;
}

function candidateTitle(candidate: MatchCandidate): string {
  return candidate.candidate_title ?? candidate.beatport_title ?? "";
}

function candidateArtists(candidate: MatchCandidate): string {
  return candidate.candidate_artists ?? candidate.beatport_artists ?? "";
}

function candidateUrl(candidate: MatchCandidate): string {
  return candidate.candidate_url ?? candidate.beatport_url ?? "";
}

function candidateKey(candidate: MatchCandidate): string {
  return candidate.candidate_key_camelot ?? candidate.candidate_key ?? candidate.beatport_key ?? "";
}

function candidateScore(candidate: MatchCandidate): string {
  const raw = candidate.final_score ?? candidate.match_score ?? "";
  return raw === "" ? "" : String(raw);
}

function isCurrentMatch(candidate: MatchCandidate, current: MatchCandidate | null): boolean {
  if (!current) return false;
  const candidateLink = candidateUrl(candidate);
  const currentLink = candidateUrl(current);
  return Boolean(candidateLink && currentLink && candidateLink === currentLink);
}

export function CandidateDialog({ open, row, onClose, onSelectCandidate }: CandidateDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const candidates = useMemo(
    () => (row?.candidates ? sortCandidates(row.candidates) : []),
    [row],
  );
  const currentMatch = useMemo(() => (row ? currentMatchFromResult(row) : null), [row]);

  if (!open || !row) return null;

  const handleSelect = () => {
    if (selectedIndex == null) return;
    const candidate = candidates[selectedIndex];
    if (!candidate) return;
    onSelectCandidate(candidate);
    onClose();
  };

  return (
    <Modal
      open={open}
      title={`Candidates: ${row.title} — ${row.artist}`}
      onClose={onClose}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
      primaryAction={
        selectedIndex != null
          ? {
              label: "Select candidate",
              onClick: handleSelect,
            }
          : undefined
      }
    >
      <div className="candidate-dialog">
        <p className="candidate-dialog__summary">
          Found {candidates.length} candidate{candidates.length === 1 ? "" : "s"}. Double-click a row
          to select.
        </p>
        <div className="candidate-dialog__table-wrap">
          <table className="candidate-dialog__table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Title</th>
                <th>Artists</th>
                <th>Score</th>
                <th>Title sim</th>
                <th>Artist sim</th>
                <th>Key</th>
                <th>BPM</th>
                <th>Year</th>
                <th>Label</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate, index) => {
                const selected = selectedIndex === index;
                const current = isCurrentMatch(candidate, currentMatch);
                return (
                  <tr
                    key={`${candidateUrl(candidate) || candidateTitle(candidate)}-${index}`}
                    className={`candidate-dialog__row ${selected ? "candidate-dialog__row--selected" : ""} ${current ? "candidate-dialog__row--current" : ""}`}
                    onClick={() => setSelectedIndex(index)}
                    onDoubleClick={() => {
                      onSelectCandidate(candidate);
                      onClose();
                    }}
                  >
                    <td>{index + 1}</td>
                    <td>{candidateTitle(candidate)}</td>
                    <td>{candidateArtists(candidate)}</td>
                    <td>{candidateScore(candidate)}</td>
                    <td>{candidate.title_sim ?? ""}</td>
                    <td>{candidate.artist_sim ?? ""}</td>
                    <td>{candidateKey(candidate)}</td>
                    <td>{candidate.candidate_bpm ?? candidate.beatport_bpm ?? ""}</td>
                    <td>{candidate.candidate_year ?? candidate.beatport_year ?? ""}</td>
                    <td>{candidate.candidate_label ?? candidate.beatport_label ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {selectedIndex != null && candidates[selectedIndex] && (
          <div className="candidate-dialog__preview">
            <Button variant="secondary" onClick={handleSelect}>
              Use {candidateTitle(candidates[selectedIndex])}
            </Button>
            {candidateUrl(candidates[selectedIndex]) && (
              <a
                className="candidate-dialog__link"
                href={candidateUrl(candidates[selectedIndex])}
                target="_blank"
                rel="noreferrer"
              >
                Open on Beatport
              </a>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

export { applyCandidateToResult };
