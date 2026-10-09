/** The most release-note text read; the rest of a very long note is dropped. */
export const MAX_NOTES_LENGTH = 20_000;
/** How deep emphasis may nest inside emphasis or a link. */
export const MAX_INLINE_DEPTH = 3;
/** The most blocks and list items drawn. */
export const MAX_BLOCKS = 400;
/** The longest piece of text inside one mark (`**…**`, `[…]`, `` `…` ``), which keeps matching linear. */
export const MAX_SPAN = 300;
/** The longest address in a link. */
export const MAX_ADDRESS = 2000;
/** The most marks (bold, emphasis, code, links) drawn in one note; past it the text is shown plain. */
export const MAX_MARKS = 500;
