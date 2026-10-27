/** The short form of a report id, for the screen and for a person to read out. */
export function shortReportId(id: string): string {
  return id.slice(0, 8);
}
