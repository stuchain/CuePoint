import { defineHastPlugin } from "satteri";

/**
 * The guide writes a key in bold (**Ctrl+K**, **Esc**, **Left**). The files are never edited for the site,
 * so this draws those as the app's key caps: <span class="keys"><kbd>Ctrl</kbd>+<kbd>K</kbd></span>. The
 * text stays exactly as written (search, copy and screen readers get "Ctrl+K").
 *
 * Only an unambiguous key is drawn: a combination with a modifier, or a named key. A lone letter or
 * **Delete** is left bold, because the guide also uses those for a mark or a button.
 */
const MODIFIERS = new Set(["Ctrl", "Control", "Cmd", "Command", "Shift", "Alt", "Option", "Opt", "Fn"]);
const NAMED = new Set(["Esc", "Escape", "Enter", "Return", "Tab", "Space", "Up", "Down", "Left", "Right", "Home", "End", "PageUp", "PageDown", "Backspace"]);
const FUNCTION_KEY = /^F([1-9]|1[0-2])$/;
/** What may follow a modifier: another key name, a letter, a digit, a punctuation key, or a mouse click. */
const AFTER_MODIFIER = /^([A-Za-z0-9]|[-=,.;'/\\[\]`?]|Click|Delete|Del|Insert)$/;

export type KeyPart = { key: string } | { text: string };

/** The parts of a key or a combination, or null when the text is not one. */
export function keyParts(text: string): KeyPart[] | null {
  const t = text.trim();
  if (t !== text || t === "") return null;
  if (NAMED.has(t) || FUNCTION_KEY.test(t)) return [{ key: t }];
  // split on "+" between keys; a trailing "+" key ("Ctrl++") is not used by the guide and is not a match
  const keys = t.split("+");
  if (keys.length < 2 || keys.some((k) => k === "")) return null;
  const last = keys[keys.length - 1]!;
  const mods = keys.slice(0, -1);
  if (!mods.every((m) => MODIFIERS.has(m))) return null;
  if (!(MODIFIERS.has(last) || NAMED.has(last) || FUNCTION_KEY.test(last) || AFTER_MODIFIER.test(last))) return null;
  const parts: KeyPart[] = [];
  keys.forEach((k, i) => {
    if (i > 0) parts.push({ text: "+" });
    parts.push(k === "Click" ? { text: k } : { key: k });
  });
  return parts;
}

export const kbdKeys = defineHastPlugin({
  name: "kbd-keys",
  element: {
    filter: ["strong"],
    visit(node, ctx) {
      if (node.children.some((c) => c.type !== "text")) return;
      const parts = keyParts(ctx.textContent(node));
      if (!parts) return;
      ctx.replaceNode(node, {
        type: "element",
        tagName: "span",
        properties: { className: ["keys"] },
        children: parts.map((p) =>
          "key" in p
            ? { type: "element", tagName: "kbd", properties: {}, children: [{ type: "text", value: p.key }] }
            : { type: "text", value: p.text },
        ),
      });
    },
  },
});
