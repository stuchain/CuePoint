/**
 * A small allow-list renderer for release notes (DIST-07).
 *
 * The notes are Markdown written for a release and arrive over the network, so they are
 * untrusted text. This reads only what a release note needs: headings, bullet and numbered
 * lists, paragraphs, **bold**, *emphasis*, `code` and links. It builds React elements, never an
 * HTML string, so anything else (a `<script>`, an `<img onerror>`, an image, a table) is shown
 * as the text it is. A link becomes a link only for an `https:` address, and a click is handed to
 * `updates.openLink`, where main allows GitHub and CuePoint's own site; the page never navigates.
 */
import type { ReactNode } from "react";

import { NoteLink } from "./NoteLink";
import { MAX_ADDRESS, MAX_BLOCKS, MAX_INLINE_DEPTH, MAX_MARKS, MAX_NOTES_LENGTH, MAX_SPAN } from "./releaseNotesLimits";

// Every mark's text is bounded, so no input makes the matching slower than linear.
const S = `{1,${MAX_SPAN}}`;
const INLINE = new RegExp(
  [
    `(\`[^\`\\n]${S}\`)`,
    `(\\*\\*[^*\\n]${S}?\\*\\*)`,
    `(\\[[^\\]\\n]${S}\\]\\((?:[^()\\s]|\\([^()\\s]*\\)){1,${MAX_ADDRESS}}\\))`,
    `(\\*[^*\\s][^*\\n]{0,${MAX_SPAN}}?\\*)`,
    `((?<![A-Za-z0-9])_[^_\\n]${S}_(?![A-Za-z0-9]))`,
  ].join("|"),
  "g",
);

/** The address when it is a well-formed `https:` one, else null. */
function httpsAddress(value: string): string | null {
  if (!/^https:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/** Marks still allowed in the note being drawn; set by `renderReleaseNotes`, which is synchronous. */
let marksLeft = MAX_MARKS;

function inline(text: string, depth: number): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    last = at + match[0].length;
    if (marksLeft <= 0) {
      out.push(match[0]);
      continue;
    }
    marksLeft -= 1;
    const [whole, code, bold, link, star, under] = match;
    const nested = depth < MAX_INLINE_DEPTH;
    if (code) {
      out.push(<code key={key++}>{code.slice(1, -1)}</code>);
    } else if (bold) {
      const body = bold.slice(2, -2);
      out.push(<strong key={key++}>{nested ? inline(body, depth + 1) : body}</strong>);
    } else if (link) {
      const split = link.indexOf("](");
      const label = link.slice(1, split);
      const href = httpsAddress(link.slice(split + 2, -1));
      const body = nested ? inline(label, depth + 1) : label;
      // Any other address is not a link: the words it was given are shown.
      out.push(href ? <NoteLink key={key++} href={href}>{body}</NoteLink> : <span key={key++}>{body}</span>);
    } else if (star || under) {
      const body = (star ?? under ?? whole).slice(1, -1);
      out.push(<em key={key++}>{nested ? inline(body, depth + 1) : body}</em>);
    }
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: "heading"; level: 3 | 4 | 5; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

const HEADING = /^\s{0,3}(#{1,3})\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;

function blocks(source: string): Block[] {
  const result: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) result.push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  for (const raw of source.split(/\r?\n/)) {
    if (result.length >= MAX_BLOCKS) break;
    const line = raw.replace(/\t/g, "    ");
    if (line.trim() === "") {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      // The dialog's title is the h2, so the notes' own headings sit below it.
      const level = (heading[1]!.length + 2) as 3 | 4 | 5;
      result.push({ kind: "heading", level, text: heading[2]! });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      flush();
      const ordered = numbered !== null;
      const previous = result[result.length - 1];
      if (previous?.kind === "list" && previous.ordered === ordered) previous.items.push(item[1]!);
      else result.push({ kind: "list", ordered, items: [item[1]!] });
      continue;
    }
    paragraph.push(line.trim());
  }
  flush();
  return result;
}

/** The notes as React elements; empty text gives nothing. */
export function renderReleaseNotes(markdown: string): ReactNode {
  const capped = markdown.slice(0, MAX_NOTES_LENGTH);
  marksLeft = MAX_MARKS;
  return blocks(capped).map((block, index) => {
    if (block.kind === "heading") {
      const Tag = `h${block.level}` as "h3" | "h4" | "h5";
      return <Tag key={index}>{inline(block.text, 0)}</Tag>;
    }
    if (block.kind === "paragraph") return <p key={index}>{inline(block.text, 0)}</p>;
    const List = block.ordered ? "ol" : "ul";
    return (
      <List key={index}>
        {block.items.slice(0, MAX_BLOCKS).map((text, itemIndex) => (
          <li key={itemIndex}>{inline(text, 0)}</li>
        ))}
      </List>
    );
  });
}
