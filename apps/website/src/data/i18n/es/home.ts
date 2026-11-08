import { APP_SHOTS as EN_APP_SHOTS, TRUST as EN_TRUST, type Hero, type AppShotDef, type AppShotId, type Feature, type OpeningStep, type TrustClaim } from "../../home";
import { featureHref } from "../../features";

/**
 * La página de inicio en español (DEC-311). Los mismos hechos que el inglés, trato de tú, y las palabras de
 * docs/translation.md se quedan en inglés. La estructura y los campos que no son texto los comprueba src/i18n/parity.test.ts.
 */

export const OPENING_STEPS: readonly OpeningStep[] = [
  {
    id: "messy",
    title: "Una biblioteca desordenada",
    text: "Años de tracks, y los keys, los tempos y los géneros no coinciden. Algunos faltan y otros están mal.",
  },
  {
    id: "matched",
    title: "Cruzada con Beatport",
    text: "CuePoint busca cada track en Beatport y trae su key, y te ofrece su tempo y su género. Acepta las coincidencias de las que está seguro y deja el resto para que las revises tú.",
  },
  {
    id: "ready",
    title: "Ordenada y lista para la cabina",
    text: "Tus tracks se alinean en la rueda Camelot, ordenados por key, y vuelven a Rekordbox como un archivo nuevo. Tus propias correcciones tienen prioridad.",
  },
];

type ShotText = Pick<AppShotDef, "label" | "alt">;
const shot = (id: AppShotId, text: ShotText): AppShotDef => ({ ...EN_APP_SHOTS[id], ...text });

export const APP_SHOTS: Readonly<Record<AppShotId, AppShotDef>> = {
  window: shot("window", {
    label: "La ventana de CuePoint",
    alt: "La ventana de CuePoint con una biblioteca de tracks, con la rueda Camelot abierta en el key del track que suena, iluminada con los keys que mezclan con él.",
  }),
  clean: shot("clean", {
    label: "Clean",
    alt: "El área Match de la página Clean: los tracks que una coincidencia con Beatport dejó por revisar, cada uno junto a lo que Beatport le asignó.",
  }),
  "clean-compare": shot("clean-compare", {
    label: "Clean: de uno en uno",
    alt: "El panel “Check the match” de Clean: un track de la biblioteca junto a los candidatos que encontró Beatport, con “Use this match” y “None of these”.",
  }),
  library: shot("library", {
    label: "Library",
    alt: "La página Library: la tabla de tracks con las colecciones y playlists al lado, y un track seleccionado con sus acciones sobre la tabla.",
  }),
  keys: shot("keys", {
    label: "Keys",
    alt: "La página Keys: los keys de tres playlists contados en la rueda Camelot, con el key que reúne más tracks seleccionado.",
  }),
  discover: shot("discover", {
    label: "Discover",
    alt: "La página Discover tras una búsqueda: tracks nuevos encontrados en un chart de Beatport de un artista de la biblioteca, con sus artistas y sellos.",
  }),
  prepare: shot("prepare", {
    label: "Prepare",
    alt: "La página Prepare: un set como orden de reproducción en capítulos, con las comprobaciones entre tracks y la tira de transición abierta en una de ellas.",
  }),
  statistics: shot("statistics", {
    label: "Statistics",
    alt: "El Overview de la página Statistics: cómo se reparte toda la biblioteca por género, sello y artista, con el recuento en cada barra.",
  }),
  waveforms: shot("waveforms", {
    label: "Waveforms y el reproductor",
    alt: "La barra del reproductor con la forma de onda de un track en pausa, y Track details mostrando la forma de onda del track completo con sus cue points listados debajo.",
  }),
  export: shot("export", {
    label: "Exportar a Rekordbox",
    alt: "La ventana Export to Rekordbox: cuántos tracks y playlists tendrá el nuevo archivo de Rekordbox y qué contiene, antes de que se escriba nada.",
  }),
};

const more = (slug: string) => ({ label: "Saber más", path: featureHref(slug) });

export const FEATURES: readonly Feature[] = [
  {
    id: "clean",
    name: "Clean",
    text: "Cruza una playlist o toda tu biblioteca con Beatport y revisa solo las coincidencias de las que CuePoint no está seguro.",
    learnMore: more("clean"),
  },
  {
    id: "library",
    name: "Library",
    text: "Busca en toda tu colección y fíltrala por key, tempo o género, con el key de Beatport en cada track cruzado.",
    learnMore: more("library"),
  },
  {
    id: "discover",
    name: "Discover",
    text: "Encuentra música nueva en Beatport a partir de los artistas y sellos que ya están en tu biblioteca.",
    learnMore: more("discover"),
  },
  {
    id: "prepare",
    name: "Prepare",
    text: "Planifica un set como orden de reproducción, y CuePoint te avisa si hay un choque de keys o un tempo que no encaja.",
    learnMore: more("prepare"),
  },
  {
    id: "export",
    name: "Exportar a Rekordbox",
    text: "Escribe tus keys, tempos y géneros en un archivo XML nuevo de Rekordbox, y el archivo que importaste no se modifica nunca.",
    learnMore: more("export"),
  },
];

type TrustText = Pick<TrustClaim, "id" | "title" | "text">;
const TRUST_TEXT: readonly TrustText[] = [
  { id: "free", title: "Gratis", text: "Se descarga y se usa gratis." },
  {
    id: "local",
    title: "Funciona en tu equipo",
    text: "Tu biblioteca se queda en tu equipo; CuePoint se conecta a internet para buscar tracks en Beatport cuando se lo pides, para preguntar a GitHub si hay una versión nueva y para enviar informes de errores sin los nombres de tu biblioteca, algo que puedes desactivar.",
  },
  {
    id: "yours",
    title: "Tu biblioteca sigue siendo tuya",
    text: "CuePoint nunca borra ni mueve tus archivos de música, y antes de escribir tags o exportar te muestra una vista previa: no pasa nada hasta que confirmes.",
  },
  { id: "open", title: "Open Source", text: "El código es público en GitHub, bajo la licencia Apache 2.0." },
  {
    id: "rekordbox",
    title: "Hecho para Rekordbox",
    text: "Lee la colección que exportas de Rekordbox como XML, y escribe de vuelta un archivo XML nuevo para que Rekordbox lo importe.",
  },
];

export const TRUST: readonly TrustClaim[] = TRUST_TEXT.map((t) => ({
  ...t,
  evidence: EN_TRUST.find((e) => e.id === t.id)!.evidence,
}));

export const HERO = {
  heading: "Tu biblioteca de Rekordbox, ordenada y lista para la cabina",
  lead: "CuePoint es una app de escritorio gratuita para DJs. Cruza tus tracks con Beatport, completa los keys y tempos que faltan o están mal, y devuelve el resultado a Rekordbox.",
  title: "CuePoint: ordena tu biblioteca de Rekordbox",
  description:
    "CuePoint, app gratuita para DJs: cruza tu biblioteca de Rekordbox con Beatport, corrige keys y tempos, mira tus keys en la rueda Camelot y planifica sets.",
} as const satisfies Hero;
