import { defineHastPlugin } from "satteri";

/**
 * Markdown tables and code blocks can be wider than a phone. They scroll sideways inside their own
 * box, and the box must be reachable from the keyboard (WCAG 2.1.1, axe's scrollable-region-focusable),
 * so a table gets a focusable wrapper and a code block is focusable itself.
 */
export const scrollWrap = defineHastPlugin({
  name: "scroll-wrap",
  element: {
    filter: ["table", "pre"],
    visit(node, ctx) {
      if (node.tagName === "table") {
        ctx.wrapNode(node, { type: "element", tagName: "div", properties: { className: ["scroll-x"], tabIndex: 0 }, children: [] });
      } else {
        ctx.setProperty(node, "tabIndex", 0);
      }
    },
  },
});
