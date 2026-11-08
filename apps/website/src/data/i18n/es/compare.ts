import { COMPARE_CHECKED, type CompareTool, type OtherFact, type Source } from "../../compare";

/**
 * Las páginas de comparación en español (DEC-311). Las direcciones, las fechas y el orden de las fuentes son los
 * del inglés (src/i18n/parity.test.ts lo comprueba); se traducen los textos y los nombres de los enlaces.
 * Las citas de las páginas de las otras herramientas se quedan en inglés, porque son citas literales.
 */

const at = (url: string, label: string): Source => ({ url, label });
const fact = (text: string, source: Source): OtherFact => ({ text, source, checked: COMPARE_CHECKED });

const LEXICON_HOME = at("https://www.lexicondj.com/", "la página de inicio de Lexicon");
const LEXICON_PRICING = at("https://www.lexicondj.com/pricing", "la página de precios de Lexicon");
const MIK_HOME = at("https://mixedinkey.com/", "la página de inicio de Mixed In Key");
const MIK_MORE = at("https://mixedinkey.com/learn-more/", "la página de Mixed In Key 11");
const MIK_REKORDBOX = at("https://mixedinkey.com/integration/rekordbox-integration/", "la página de Mixed In Key sobre Rekordbox");
const MIK_WORKFLOW = at(
  "https://mixedinkey.com/workflows/use-mixed-in-key-with-rekordbox/",
  "la guía de Mixed In Key para usarlo con Rekordbox",
);
const OKS_HOME = at("https://www.openkeyscan.com/", "la página de inicio de OpenKeyScan");
const REKORDCLOUD = at("https://rekord.cloud/", "la página de inicio de rekordcloud");

export const COMPARE_TOOLS: readonly CompareTool[] = [
  {
    slug: "lexicon",
    name: "Lexicon",
    maker: "rekordcloud",
    hosts: ["lexicondj.com", "rekord.cloud"],
    title: "CuePoint frente a Lexicon: comparativa | CuePoint",
    description:
      "CuePoint y Lexicon (de rekordcloud) frente a frente: qué hace cada uno con tu biblioteca de DJ, con qué apps de DJ funcionan y qué no hace CuePoint.",
    heading: "CuePoint y Lexicon (rekordcloud)",
    intro:
      "Los dos te ayudan a cuidar una biblioteca de DJ. Cada afirmación sobre Lexicon de abajo sale de sus propias páginas públicas, con la fecha en que las leímos. Lo que hace CuePoint sale de su guía de usuario.",
    summary: "Gestión de la Library entre varias apps de DJ, junto al cruce con Beatport que hace CuePoint para Rekordbox.",
    rows: [
      {
        topic: "Quién lo hace",
        other: fact(
          "La página de inicio de rekordcloud lista Lexicon, TrackHack, OpenKeyScan y SonoVault como sus productos. Si buscaste rekordcloud, Lexicon es su suite de gestión de bibliotecas para DJs.",
          REKORDCLOUD,
        ),
        cuepoint: "CuePoint es gratis y de código abierto, bajo la licencia Apache 2.0.",
      },
      {
        topic: "Qué es",
        other: fact("La página de inicio de Lexicon dice: “Organize, clean and upgrade your DJ library.”.", LEXICON_HOME),
        cuepoint:
          "CuePoint cruza tus tracks de Rekordbox con Beatport, completa keys y otros valores, encuentra duplicados y archivos perdidos, y devuelve el resultado a Rekordbox.",
      },
      {
        topic: "Qué apps de DJ",
        other: fact(
          "Lexicon lista Rekordbox, Serato, Traktor, VirtualDJ, Engine DJ y djay Pro, y convierte entre ellas las playlists, los cue points y los beatgrids.",
          LEXICON_HOME,
        ),
        cuepoint: "CuePoint funciona solo con Rekordbox. Lee la colección que exportas de Rekordbox como XML.",
      },
      {
        topic: "Duplicados y archivos perdidos",
        other: fact(
          "Lexicon encuentra tracks duplicados y tracks rotos o perdidos. Su página de precios lista Find Duplicates en el plan Ultimate.",
          LEXICON_PRICING,
        ),
        cuepoint: "Clean agrupa los posibles duplicados y lista los archivos perdidos, gratis. Nunca fusiona ni borra nada.",
      },
      {
        topic: "Tags y portadas que faltan",
        other: fact(
          "Lexicon encuentra tags y portadas de álbum que faltan. Su página de precios lista Find Missing Tags & Album Art en el plan Ultimate.",
          LEXICON_PRICING,
        ),
        cuepoint:
          "CuePoint busca cada track en Beatport y le da el key de Beatport, y ofrece su tempo, género, sello y año. Lee la portada de tus archivos y, en las coincidencias aceptadas, de Beatport.",
      },
      {
        topic: "Puntos de cue",
        other: fact("Lexicon tiene una herramienta Generate Cue Points que crea cues en bloque.", LEXICON_HOME),
        cuepoint: "CuePoint no crea cue points. Conserva los cues y beat grids que escribió Rekordbox exactamente como estaban.",
      },
      {
        topic: "Apps para el teléfono",
        other: fact("Lexicon tiene apps para iPhone y Android.", LEXICON_HOME),
        cuepoint: "CuePoint es solo una app de escritorio.",
      },
      {
        topic: "Equipos",
        other: fact("Lexicon dice que funciona en Windows y macOS.", LEXICON_HOME),
        // support-policy.md: Windows 10+ (x64), macOS 14+ on Apple Silicon (15+ on Intel, DEC-296), Linux experimental
        cuepoint:
          "CuePoint funciona en Windows y en Macs con Apple Silicon, y hay una versión experimental para Linux. La página de descarga dice qué hay disponible.",
      },
      {
        topic: "Precio",
        other: fact(
          "La página de precios de Lexicon muestra un plan Free con conversión de bibliotecas, Essential desde 10,49 USD al mes o 249 USD de por vida, y Ultimate desde 20,99 USD al mes o 499 USD de por vida.",
          LEXICON_PRICING,
        ),
        cuepoint: "CuePoint es gratis.",
      },
    ],
    cuepointDoesNot: [
      "No convierte una biblioteca entre apps de DJ. Funciona solo con Rekordbox.",
      "No crea cue points ni define beat grids.",
      "No tiene app para el teléfono ni almacenamiento en la nube.",
      "No vigila una carpeta en busca de tracks nuevos.",
    ],
    chooseOther:
      "Si usas más de una app de DJ, o quieres pasar una biblioteca de una a otra, Lexicon está hecho para eso y CuePoint no.",
    chooseCuePoint:
      "Si tocas con Rekordbox y quieres comprobar sus keys y otros valores con Beatport, con cada coincidencia revisable y sin borrar nada, CuePoint está hecho para eso. También puedes usar los dos.",
  },
  {
    slug: "mixed-in-key",
    name: "Mixed In Key",
    maker: "Mixed In Key",
    hosts: ["mixedinkey.com"],
    title: "CuePoint frente a Mixed In Key: comparativa | CuePoint",
    description:
      "CuePoint y Mixed In Key frente a frente: de dónde sale el key, qué escriben en Rekordbox, la energy, los cue points y lo que CuePoint no tiene.",
    heading: "CuePoint y Mixed In Key",
    intro:
      "Los dos pueden darle a tus tracks un key con el que mezclar. Cada afirmación sobre Mixed In Key de abajo sale de sus propias páginas públicas, con la fecha en que las leímos. Lo que hace CuePoint sale de su guía de usuario.",
    summary: "Análisis de key y energy a partir del audio, junto a keys sacados de coincidencias con Beatport.",
    rows: [
      {
        topic: "Qué es",
        other: fact(
          "La página de inicio de Mixed In Key describe Mixed In Key así: “Discover the key and BPM of any track to create harmonically perfect DJ sets.”.",
          MIK_HOME,
        ),
        cuepoint:
          "CuePoint cruza tus tracks con Beatport y completa lo que falta o está mal, y luego lo devuelve a Rekordbox.",
      },
      {
        topic: "De dónde sale el key",
        other: fact(
          "Mixed In Key 11 dice “Analyze your music collection”. Llama a su detección de keys “the world's most precise key-detection technology.”.",
          MIK_MORE,
        ),
        cuepoint:
          "CuePoint no calcula un key a partir del audio. El key de un track es el que escribiste tú, o el key de su coincidencia aceptada de Beatport. Un track que Beatport no tiene no tiene key hasta que le pongas uno.",
      },
      {
        topic: "Energy",
        other: fact(
          "La página de inicio de Mixed In Key dice que sus valoraciones Energy Level “show you how danceable each track is.”.",
          MIK_HOME,
        ),
        cuepoint: "CuePoint no tiene valoración de energy.",
      },
      {
        topic: "Puntos de cue",
        other: fact(
          "Mixed In Key 11 dice que “will give you up to 8 automatic Cue Points per track.”.",
          MIK_MORE,
        ),
        cuepoint: "CuePoint no crea cue points. Conserva los que tiene Rekordbox.",
      },
      {
        topic: "Cómo llegan sus resultados a Rekordbox",
        other: fact(
          "La página de Mixed In Key sobre Rekordbox dice que analices tus archivos en Mixed In Key, los añadas a Rekordbox y luego recargues sus tags, y que así se actualizan los resultados de Key y Energy.",
          MIK_REKORDBOX,
        ),
        cuepoint:
          "CuePoint escribe un archivo XML nuevo de Rekordbox para que lo abras en Rekordbox, con tus cues y beat grids intactos. También puede escribir tags en tus archivos, después de una vista previa. Rekordbox los muestra cuando eliges Reload Tag.",
      },
      {
        topic: "Puntos de cue en Rekordbox",
        other: fact(
          "La guía de Mixed In Key dice que los cue points no forman parte de recargar tags: “Cue Points require the Rekordbox XML import workflow.”.",
          MIK_WORKFLOW,
        ),
        cuepoint:
          "La exportación de CuePoint es una copia retocada del XML que importaste, así que los cues y beat grids que escribió Rekordbox pasan exactamente como estaban.",
      },
      {
        topic: "Dónde se ven los resultados en Rekordbox",
        other: fact(
          "Por defecto, los resultados de key de Mixed In Key van a la columna Key de Rekordbox y a su columna Comments. Puedes cambiarlo en sus ajustes de Update Tags.",
          MIK_REKORDBOX,
        ),
        cuepoint: "La exportación de CuePoint escribe el key en el campo de key del archivo XML nuevo, en la notación que elijas.",
      },
      {
        topic: "Notación Camelot",
        other: fact("La página de inicio de Mixed In Key lista una Camelot Wheel para mezclar armónicamente.", MIK_HOME),
        cuepoint:
          "CuePoint muestra el key de un track en notación Camelot, como 8A, y dice “No Beatport key” cuando un track no tiene ninguno. El key propio de Rekordbox se muestra como no usado.",
      },
      {
        topic: "Precio",
        other: fact(
          "Mixed In Key 11 se vende como compra única. Las páginas que leímos no muestran ninguna cifra; el precio está en su tienda.",
          MIK_MORE,
        ),
        cuepoint: "CuePoint es gratis.",
      },
    ],
    cuepointDoesNot: [
      "No calcula un key a partir del audio. No puede ponerle key a un track que Beatport no tiene.",
      "No valora la energy de un track.",
      "No crea cue points.",
      "No tiene herramientas para hacer música ni mashups.",
    ],
    chooseOther:
      "Si tus tracks no están en Beatport, o quieres un key calculado a partir del sonido mismo, además de valoraciones de energy y cue points automáticos, Mixed In Key hace eso y CuePoint no.",
    chooseCuePoint:
      "Si tus tracks están en Beatport y quieres comprobar con Rekordbox el key, tempo, género, sello y año de Beatport, con cada coincidencia revisable, CuePoint lo hace gratis. No son incompatibles, así que puedes usar ambos.",
  },
  {
    slug: "openkeyscan",
    name: "OpenKeyScan",
    maker: "rekordcloud",
    hosts: ["openkeyscan.com", "rekord.cloud"],
    title: "CuePoint frente a OpenKeyScan: comparativa | CuePoint",
    description:
      "CuePoint y OpenKeyScan de rekordcloud frente a frente: cómo saca cada uno el key, dónde funciona sin conexión, qué escribe y qué no hace CuePoint.",
    heading: "CuePoint y OpenKeyScan (rekordcloud)",
    intro:
      "Los dos pueden darle un key a un track. Cada afirmación sobre OpenKeyScan de abajo sale de sus propias páginas públicas o de las de su creador, con la fecha en que las leímos. Lo que hace CuePoint sale de su guía de usuario.",
    summary: "Un detector de keys gratuito que escucha el audio, junto a keys sacados de Beatport.",
    rows: [
      {
        topic: "Quién lo hace",
        other: fact(
          "La página de inicio de rekordcloud lista OpenKeyScan, junto con Lexicon, TrackHack y SonoVault, entre sus productos, y llama a OpenKeyScan una app de escritorio gratuita y de código abierto.",
          REKORDCLOUD,
        ),
        cuepoint: "CuePoint es gratis y de código abierto, bajo la licencia Apache 2.0.",
      },
      {
        topic: "Qué es",
        other: fact("La página de OpenKeyScan lo describe como “a free, open-source key detector.”.", OKS_HOME),
        cuepoint:
          "CuePoint es una app de escritorio gratuita y de código abierto que hace más que keys: cruza tracks con Beatport, encuentra duplicados y archivos perdidos, descubre música nueva y planifica sets.",
      },
      {
        topic: "De dónde sale el key",
        other: fact(
          "OpenKeyScan dice que convierte el audio en un espectrograma y usa una red neuronal para reconocer en él patrones armónicos.",
          OKS_HOME,
        ),
        cuepoint:
          "CuePoint no calcula un key a partir del audio. Toma el key de la coincidencia aceptada de Beatport, o de ti.",
      },
      {
        topic: "Sin conexión",
        other: fact("OpenKeyScan dice que funciona “completely offline on your machine.”.", OKS_HOME),
        cuepoint:
          "Tu biblioteca se queda en tu equipo. CuePoint se conecta a internet para leer Beatport (cruce, portadas, Discover) y, a menos que lo desactives, para enviar informes de errores.",
      },
      {
        topic: "Qué escribe",
        other: fact(
          "rekordcloud dice que OpenKeyScan “writes results directly into your files for Rekordbox, Serato and Traktor.”.",
          REKORDCLOUD,
        ),
        cuepoint:
          "CuePoint escribe en tus archivos solo cuando eliges Write tags to files, después de una vista previa, con un registro que permite restaurar cada archivo. Su exportación a Rekordbox es un archivo XML nuevo.",
      },
      {
        topic: "Precio",
        other: fact("OpenKeyScan dice que es “100% free, forever.”.", OKS_HOME),
        cuepoint: "CuePoint es gratis.",
      },
    ],
    cuepointDoesNot: [
      "No calcula un key a partir del audio. Un track que Beatport no tiene no recibe key de CuePoint.",
      "El cruce no funciona sin conexión. Buscar tracks en Beatport necesita conexión.",
      "Funciona solo con Rekordbox, no con Serato ni Traktor.",
    ],
    chooseOther:
      "Si quieres calcular un key a partir del sonido de un track y escribirlo en el archivo para Rekordbox, Serato y Traktor, OpenKeyScan está hecho para eso, y funciona sin conexión.",
    chooseCuePoint:
      "Si quieres comprobar con tu biblioteca de Rekordbox el key y los metadatos de Beatport, con todo revisable, CuePoint está hecho para eso. Para un track que Beatport no tiene, puedes escribir el key tú.",
  },
];
