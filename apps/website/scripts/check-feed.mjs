/**
 * Checks that a feed is RSS 2.0 (SITE-10): `<rss version="2.0">`, a channel with title, link and
 * description, and every item with title, link, guid and a parseable pubDate. Pure: takes the XML text
 * and returns a list of problem strings, empty when the feed is valid.
 */
import { XMLParser } from "fast-xml-parser";

const text = (v) => (typeof v === "object" && v !== null ? v["#text"] : v);
const filled = (v) => {
  const t = text(v);
  return (typeof t === "string" || typeof t === "number") && String(t).trim() !== "";
};

export function validateRss(xml) {
  const problems = [];
  let doc;
  try {
    doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false }).parse(xml);
  } catch (error) {
    return [`the feed is not well-formed XML: ${error.message}`];
  }
  const rss = doc?.rss;
  if (!rss) return ["the document has no <rss> root element"];
  if (rss["@_version"] !== "2.0") problems.push(`<rss> version is "${rss["@_version"]}", expected "2.0"`);
  const channel = rss.channel;
  if (!channel || typeof channel !== "object") return [...problems, "the feed has no <channel>"];
  for (const field of ["title", "link", "description"]) {
    if (!filled(channel[field])) problems.push(`<channel> lacks <${field}>`);
  }
  const items = channel.item === undefined ? [] : Array.isArray(channel.item) ? channel.item : [channel.item];
  items.forEach((item, i) => {
    const label = `item ${i + 1}`;
    for (const field of ["title", "link", "guid", "pubDate"]) {
      if (!filled(item?.[field])) problems.push(`${label} lacks <${field}>`);
    }
    if (filled(item?.pubDate) && Number.isNaN(Date.parse(String(text(item.pubDate))))) {
      problems.push(`${label} has a pubDate that is not a date: "${text(item.pubDate)}"`);
    }
    if (filled(item?.link) && !/^https:\/\//.test(String(text(item.link)))) problems.push(`${label} link is not https`);
  });
  return problems;
}
