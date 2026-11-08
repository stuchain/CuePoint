import type { FeaturePage, Overview } from "../../features";

/**
 * Las páginas de funciones en español (DEC-311). Los mismos hechos que el inglés, trato de tú. Los nombres de la
 * app (Clean, Library, Keys, Discover, Prepare, Statistics, Waveforms, Match, Health, Collection, Track details,
 * "Write tags to files", "No Beatport key") y las palabras de DJ (key, BPM, cue, Hot Cue, Beatgrid, Playlist, Set,
 * track, remix) se quedan en inglés. La estructura y los campos que no son texto los comprueba src/i18n/parity.test.ts.
 */

export const OVERVIEW = {
  title: "Funciones de CuePoint para DJs de Rekordbox",
  description:
    "Todo lo que CuePoint hace con tu biblioteca de Rekordbox: cruce con Beatport, corrección de keys y tags, música nueva, sets, formas de onda y exportación.",
} as const satisfies Overview;

export const FEATURE_PAGES: readonly FeaturePage[] = [
  {
    slug: "clean",
    name: "Clean",
    query: "corregir tags de key en Rekordbox",
    title: "Corrige los keys de Rekordbox con Beatport | CuePoint",
    description:
      "Cruza tus tracks de Rekordbox con Beatport y completa keys, tempos, géneros y sellos. Revisa coincidencias, duplicados y archivos perdidos.",
    heading: "Corrige los keys y los tags de tu biblioteca de Rekordbox",
    summary: "Cruza tracks con Beatport, corrige valores, encuentra duplicados y archivos perdidos.",
    problem: [
      "La mitad de tus tracks no tiene key, o tiene uno en el que no confías. El género está en blanco en unos y mal en otros. La misma canción está dos veces en la colección, y algunos archivos cambiaron de sitio cuando reorganizaste un disco.",
      "Arreglar eso a mano, track por track, es un fin de semana entero. La mayoría de los DJs no lo hace, y luego busca entre los tracks equivocados en pleno gig.",
    ],
    how: [
      {
        heading: "Cruza con Beatport y luego revisa",
        paragraphs: [
          "Elige una playlist, una Collection, tu selección o toda la biblioteca y pulsa Match. CuePoint busca cada track en Beatport y se queda con todos los candidatos que encontró, con una puntuación y el motivo por el que descartó los que no eligió.",
          "Acepta una coincidencia por su cuenta solo cuando el mejor candidato saca 95 o más y supera todas las comprobaciones. Todo lo demás te espera en Match, un track junto a su mejor resultado de Beatport, donde el teclado hace el trabajo: A corrige, R dice que no es este track, N salta.",
        ],
      },
      {
        heading: "Key, tempo, género, sello y año",
        paragraphs: [
          "Una coincidencia aceptada le da al track el key de Beatport. Su tempo, género, sello y año se te ofrecen uno al lado del otro, y marcas los que quieres aplicar. Tus propios valores van encima y los de Rekordbox quedan debajo, así que cualquier cambio se puede deshacer.",
          "El título, el artista, el remixer y el álbum no se cambian nunca.",
        ],
      },
      {
        heading: "Duplicados y archivos perdidos",
        paragraphs: [
          "Clean agrupa los tracks que pueden ser la misma grabación: el mismo archivo, el mismo track de Beatport, o el mismo artista, título y mix. También lista los archivos que faltan o no se pueden leer, y avisa una sola vez de un disco que no está conectado, en lugar de dar miles de archivos perdidos.",
          "Una pestaña Health cuenta todo lo que necesita tu atención, y cada cifra abre la Library justo con esos tracks.",
        ],
      },
    ],
    shot: "clean",
    doesNot: [
      "No borra nada. No se elimina, mueve ni renombra ningún track, archivo ni playlist. Para deshacerte de un duplicado, quítalo en Rekordbox y actualiza.",
      "No mueve los archivos perdidos. Eso lo hace Relocate de Rekordbox, y Clean te muestra qué archivos tienes que reubicar.",
      "No adivina. Un track que Beatport no tiene no recibe key de CuePoint, a menos que escribas uno tú.",
      "No calcula un key a partir del audio. Los valores vienen de Beatport.",
    ],
    guide: { page: "clean", label: "Lee la guía de Clean" },
    related: ["library", "export"],
  },
  {
    slug: "library",
    name: "The Library",
    query: "filtrar tracks de Rekordbox por key y BPM",
    title: "Filtra y ordena tu biblioteca de Rekordbox | CuePoint",
    description:
      "Busca y filtra toda tu colección de Rekordbox por key, tempo y género, elige tus columnas y mira todo lo que CuePoint sabe de un track.",
    heading: "Encuentra el track justo en toda tu colección de Rekordbox",
    summary: "Búsqueda, filtros y columnas sobre toda tu colección.",
    problem: [
      "Sabes que el siguiente track debería estar entre 124 y 130 BPM, en un key que combine con el que está sonando. Encontrarlo en una lista larga de Rekordbox es hacer scroll y entrecerrar los ojos.",
    ],
    how: [
      {
        heading: "Busca, filtra y ordena todo",
        paragraphs: [
          "Importa la colección que exportaste de Rekordbox y la página Library la muestra con tus playlists a la izquierda. Escribe para buscar títulos, artistas, álbumes y sellos, o añade filtros como BPM entre 124 y 130, el género es Techno, o un comentario que contenga una palabra. Los filtros se acumulan, y la barra dice cuántos tracks quedan.",
          "Elige tus columnas, haz clic en un encabezado para ordenar, y haz clic en un track para ver todo lo que CuePoint sabe de él en Track details, a la derecha.",
        ],
      },
      {
        heading: "La rueda Camelot",
        paragraphs: [
          "Un botón junto a la búsqueda, en todas las páginas, abre una rueda con los 24 keys. Ilumina el key del track que seleccionaste, o del que está sonando, y los keys que mezclan con él: el mismo número un paso en cualquier dirección, y el key relativo.",
          "Haz clic en un key y la Library muestra todos los tracks de ese key.",
        ],
      },
      {
        heading: "Keys de Beatport, o tuyos",
        paragraphs: [
          "El key de un track es el que escribiste tú o, si no, el key de su coincidencia aceptada de Beatport, mostrado en Camelot (8A). El key propio de Rekordbox no se usa nunca. Un track que no tiene ninguno de los dos no tiene key, y la Library dice “No Beatport key”.",
        ],
      },
    ],
    shot: "library",
    doesNot: [
      "Navegar no cambia nada. Los archivos solo cambian cuando eliges Write tags to files, después de una vista previa.",
      "No calcula un key a partir del audio. Un track sin coincidencia en Beatport y sin key tuyo no tiene key.",
      "No usa el key de Rekordbox, porque los keys de Rekordbox pueden estar mal.",
    ],
    guide: { page: "library", label: "Lee la guía de Library" },
    related: ["clean", "discover"],
    fromDecisions: ["DEC-133", "DEC-157", "DEC-160", "DEC-201"],
  },
  {
    slug: "keys",
    name: "Keys",
    query: "keys de mi playlist de Rekordbox",
    title: "Mira los keys de tus playlists de Rekordbox | CuePoint",
    description:
      "Cuenta los keys de una o varias playlists, Collections o Sets en la rueda Camelot y lista los tracks de los keys que elijas. Gratis para DJs de Rekordbox.",
    heading: "Mira qué keys hay en tus playlists",
    summary: "Los keys de una o varias playlists en la rueda Camelot, con recuentos.",
    problem: [
      "Antes de un gig quieres saber de qué está hecha la caja. ¿Es todo 8A y 9A, o no hay nada que encaje con una apertura en 3B? Rekordbox no cuenta los keys por ti.",
    ],
    how: [
      {
        heading: "Elige las playlists y lee la rueda",
        paragraphs: [
          "Keys es una página propia en la barra lateral. Elige toda la biblioteca, o marca varias playlists, Collections y Sets. CuePoint cuenta cada key sobre todo lo que elegiste y muestra los recuentos en la rueda Camelot, más oscuros donde hay más, y como lista en orden Camelot. Un track que está en varias fuentes se cuenta una vez.",
          "Los números están escritos en la página, no solo se muestran al pasar el cursor.",
        ],
      },
      {
        heading: "Y luego los tracks",
        paragraphs: [
          "Haz clic en uno o más keys para listar esos tracks debajo. Pide los keys que mezclan con 8A y la rueda los ilumina. Abre la selección en la Library, o guárdala como Smart Collection, con las playlists que marcaste incluidas.",
        ],
      },
      {
        heading: "Solo los keys en los que CuePoint confía",
        paragraphs: [
          "El recuento usa tu propio key de un track o, si no, el key de su coincidencia aceptada de Beatport. Los tracks que no tienen ninguno se cuentan en su propia línea, “No Beatport key”, para que veas cuánto de la playlist aún necesita cruzarse.",
        ],
      },
    ],
    shot: "keys",
    doesNot: [
      "No cambia tus playlists ni tus archivos.",
      "No cuenta los keys de Rekordbox. Un track sin key de Beatport y sin key tuyo aparece como un track sin key.",
      "No calcula un key a partir del audio.",
    ],
    guide: { page: "keys", label: "Lee la guía de Keys" },
    related: ["library", "statistics"],
    fromDecisions: ["DEC-200", "DEC-201", "DEC-206"],
  },
  {
    slug: "discover",
    name: "Discover",
    query: "encontrar música nueva de artistas y sellos en Beatport",
    title: "Encuentra música nueva de tus artistas y sellos | CuePoint",
    description:
      "Discover busca en Beatport tracks nuevos de los artistas y sellos que ya tienes en tu biblioteca, oculta lo que ya tienes y lleva una wantlist. Gratis.",
    heading: "Encuentra música nueva de los artistas y sellos que pinchas",
    summary: "Música nueva de Beatport para los artistas y sellos que ya están en tu biblioteca.",
    problem: [
      "Pinchas los mismos sellos durante años. Seguir lo que sacan ellos y tus artistas favoritos significa revisar Beatport página tras página.",
    ],
    how: [
      {
        heading: "Búsquedas que leen Beatport por ti",
        paragraphs: [
          "Inicia una búsqueda e indica qué quieres encontrar: charts de Beatport en los géneros que elijas hechos por artistas de tu biblioteca, y lanzamientos nuevos de tus sellos de los últimos días. Todos los artistas y sellos de tu biblioteca, solo los que elijas, o ninguno.",
          "Una búsqueda trabaja en segundo plano mientras sigues usando CuePoint, y cada una se guarda hasta que la borres, así que puedes abrir la del mes pasado.",
        ],
      },
      {
        heading: "Sin lo que ya tienes",
        paragraphs: [
          "Los tracks que tu biblioteca ya tiene se ocultan, con un recuento de cuántos son. Un track cuenta como tuyo cuando uno de tu biblioteca tiene una coincidencia aceptada con él en Clean.",
        ],
      },
      {
        heading: "Una wantlist, una playlist de Beatport y tracks parecidos",
        paragraphs: [
          "Añade lo que quieres a la wantlist en CuePoint, o envíalo a una playlist de tu cuenta de Beatport. Desde cualquier track puedes abrir la página de su artista o de su sello, y encontrar en tu propia biblioteca tracks parecidos a uno que te gusta.",
        ],
      },
    ],
    shot: "discover",
    doesNot: [
      "No compra, descarga ni reproduce tracks de Beatport. No tienen archivo en tu biblioteca, así que no se pueden reproducir en CuePoint.",
      "Necesita un token de Beatport. Beatport no entrega tokens desde la página de tu cuenta; primero le pides acceso a la API a Beatport, y la guía te lleva paso a paso.",
      "No sabe que un track es tuyo hasta que lo cruzas en Clean. Hasta entonces Discover lo muestra como nuevo.",
    ],
    guide: { page: "discover", label: "Lee la guía de Discover" },
    related: ["clean", "prepare"],
  },
  {
    slug: "prepare",
    name: "Prepare",
    query: "planificar un set de DJ antes del gig",
    title: "Planifica un set de DJ antes del gig | CuePoint",
    description:
      "Arma un set como orden de reproducción en capítulos con tiempos. CuePoint revisa cada transición, sugiere tracks para un hueco y crea una lista del set.",
    heading: "Planifica tu set antes de llegar a la cabina",
    summary: "Arma un Set en capítulos, con tiempos, comprobaciones de transiciones y una lista del set.",
    problem: [
      "Planificas un set en la cabeza, o en un papel, y en el gig descubres que dos tracks chocan de key o que el warm-up se alarga veinte minutos.",
    ],
    how: [
      {
        heading: "Un orden de reproducción en capítulos",
        paragraphs: [
          "Un Set es un orden de reproducción. Empieza uno vacío, o copia en él una Collection, una playlist de Rekordbox o tu selección. Divídelo en capítulos como warm-up, peak y cierre, y dale a un capítulo una duración objetivo y un rango de BPM.",
          "Cada entrada puede llevar una hora de entrada y de salida planificadas, así que el Set suma cuánto va a durar. Cuenta solo las entradas a las que les pusiste tiempo, y dice cuántas no contó.",
        ],
      },
      {
        heading: "Comprobaciones que se explican solas",
        paragraphs: [
          "CuePoint revisa cada transición y dice lo que encuentra: un salto de tempo fuera de la ventana que encaja (el medio tiempo y el doble tiempo cuentan como encaje), un choque de keys sin relación en la rueda Camelot, o un track sin BPM con el que comparar. También señala un archivo perdido y un capítulo que se pasa o se queda corto respecto a su objetivo.",
          "Un aviso nunca te frena. Marca como visto el que ya escuchaste y sabes que funciona.",
        ],
      },
      {
        heading: "Sugerencias y una lista del set",
        paragraphs: [
          "Elige un hueco y CuePoint sugiere tracks que encajan entre los dos que lo rodean. Reproduce el Set como cola, y luego guarda una lista del set como texto, CSV o M3U8, o exporta el Set a Rekordbox como una sola playlist.",
        ],
      },
    ],
    shot: "prepare",
    doesNot: [
      "No mezcla. Reproducir un Set reproduce tracks enteros, uno tras otro. Los tiempos planificados son tu plan, y nada empieza, se detiene ni hace crossfade en ellos.",
      "No pasa capítulos, tiempos ni notas a Rekordbox. Rekordbox no tiene dónde guardarlos, así que una exportación es una playlist normal en tu orden de reproducción.",
      "Un Set admite hasta 1,000 entradas.",
    ],
    guide: { page: "prepare", label: "Lee la guía de Prepare" },
    related: ["library", "waveforms"],
  },
  {
    slug: "statistics",
    name: "Statistics",
    query: "tracks más reproducidos en Rekordbox",
    title: "Tracks más reproducidos y nunca reproducidos | CuePoint",
    description:
      "Mira tus tracks más reproducidos, tus artistas y sellos top, los que nunca pinchaste y cómo se reparte tu biblioteca por género, key y tempo. Gratis.",
    heading: "Mira lo que tu biblioteca de Rekordbox tiene de verdad",
    summary: "Más reproducidos, nunca reproducidos y cómo se reparte la biblioteca.",
    problem: [
      "¿Qué tracks pinchas de verdad? ¿Cuáles llevan tres años en la biblioteca sin una sola reproducción? Rekordbox guarda los números y no los suma por ti.",
    ],
    how: [
      {
        heading: "Lo que pinchas",
        paragraphs: [
          "Statistics lista tus tracks más reproducidos como un top 10, 25, 50, 100 o 200, tus artistas y sellos principales según las reproducciones de sus tracks, y los tracks que nunca has reproducido. Los recuentos de reproducciones son los que guarda Rekordbox.",
          "CuePoint también recuerda los recuentos que lee en cada importación y cada actualización, para poder mostrar lo que reprodujiste desde una fecha. Ese historial empieza en la última importación anterior a que CuePoint empezara a guardar recuentos, y no se puede recuperar nada anterior.",
        ],
      },
      {
        heading: "Cómo es la biblioteca",
        paragraphs: [
          "Mira cómo se reparten tus tracks por género, key, tempo, año, fecha de alta, valoración y volumen. El resumen de keys cuenta los keys en los que CuePoint confía y los tracks que aún no tienen ninguno, y abre la página Keys con las mismas playlists. Una sección de salud cuenta los archivos perdidos, los tracks cruzados con Beatport y los tracks con la forma de onda analizada.",
          "Cada número lleva a algún sitio: una barra o una fila abre la Library justo con esos tracks.",
        ],
      },
    ],
    shot: "statistics",
    doesNot: [
      "No cuenta las reproducciones en el reproductor propio de CuePoint. Las reproducciones son las de Rekordbox.",
      "No busca nada fuera. Cada número sale de lo que tu biblioteca ya contiene.",
      "No puede mostrar reproducciones anteriores al inicio del historial.",
    ],
    guide: { page: "statistics", label: "Lee la guía de Statistics" },
    related: ["keys", "clean"],
    fromDecisions: ["DEC-136", "DEC-137", "DEC-138", "DEC-168", "DEC-206"],
  },
  {
    slug: "waveforms",
    name: "Waveforms y el reproductor",
    query: "forma de onda y volumen de mis tracks de DJ",
    title: "Waveforms y volumen de tus tracks de DJ | CuePoint",
    description:
      "CuePoint dibuja una forma de onda de cada track que encuentra, con tus cues y beat grid de Rekordbox, mide el volumen y reproduce música sin pausas. Gratis.",
    heading: "Mira la forma y el volumen de cada track antes de pincharlo",
    summary: "Una forma de onda y un número de volumen para cada track, y un reproductor para probarlos.",
    problem: [
      "Quieres ver dónde está el breakdown y cuánto dura el intro, sin reproducir el track. Y quieres saber si el siguiente va a sonar más fuerte cuando lo metas.",
    ],
    how: [
      {
        heading: "Una forma de onda para cada track",
        paragraphs: [
          "CuePoint calcula una forma de onda para cada track cuyo archivo encuentra, a partir del audio mismo, en segundo plano y con baja prioridad. La dibuja en la barra del reproductor (un clic salta a ese punto), en Track details, como columna de la Library y en la tira de transición de Prepare. Elige tres bandas de colores para graves, medios y agudos, o un solo color.",
          "Tus hot cues, memory cues, loops y beat grid de Rekordbox se dibujan encima.",
        ],
      },
      {
        heading: "Volumen en LUFS",
        paragraphs: [
          "La misma pasada mide cuán fuerte suena cada track en su totalidad, y su pico más alto. En la tira de transición de Prepare, las palabras entre dos tracks dicen cuánto más fuerte o más suave es el siguiente.",
        ],
      },
      {
        heading: "Un reproductor que hace lo que le pides",
        paragraphs: [
          "Haz doble clic en un track y la vista que estabas mirando se convierte en la cola. La reproducción es sin pausas, por el dispositivo de audio que elijas. No suena nada hasta que lo pides.",
        ],
      },
    ],
    shot: "waveforms",
    doesNot: [
      "No sube ni baja un track según su volumen, y no escribe el número en tus archivos ni en Rekordbox.",
      "No edita cues ni beat grids. Son de Rekordbox: mueve uno en Rekordbox y actualiza.",
      "No hace zoom ni scroll. Una forma de onda es el track entero de una vez.",
      "El primer análisis de una biblioteca grande tarda horas: unos 6,000 tracks de seis minutos por hora en una computadora de escritorio reciente. Se puede pausar, y continúa después de reiniciar.",
      "La versión para Linux viene sin el reproductor.",
    ],
    guide: { page: "waveforms", label: "Lee la guía de Waveforms" },
    related: ["prepare", "library"],
  },
  {
    slug: "export",
    name: "Export to Rekordbox",
    query: "exportar de vuelta a Rekordbox XML los keys editados",
    title: "Exporta tus cambios de vuelta a Rekordbox | CuePoint",
    description:
      "Escribe tus keys, tempos, géneros, sellos y playlists en un archivo XML nuevo de Rekordbox. Se conservan los cue points y beat grids, y el original no se toca.",
    heading: "Devuelve tus correcciones a Rekordbox, con seguridad",
    summary: "Un archivo XML nuevo de Rekordbox con tus valores, y los cues y beat grids intactos.",
    problem: [
      "Corregiste cientos de keys y armaste Collections. Solo sirven si vuelven a Rekordbox, sin perder los cue points que llevas años poniendo.",
    ],
    how: [
      {
        heading: "Una copia parcheada, no una reconstrucción",
        paragraphs: [
          "Export toma el archivo XML que importaste, lo copia y cambia solo los valores que cambiaste en CuePoint. Los hot cues, memory cues, beat grids y todo lo demás que escribió Rekordbox pasan exactamente como estaban.",
        ],
      },
      {
        heading: "Lee la vista previa y luego exporta",
        paragraphs: [
          "Una vista previa dice qué se va a escribir antes de que se escriba nada: dónde va el archivo, a cuántos tracks se les ponen tus valores, campo por campo, y cada playlist. También te avisa si el archivo que importaste ha cambiado desde entonces. El botón dice lo que va a hacer, por ejemplo “Export 3,880 tracks and 4 playlists”.",
          "Escribe tu key, tempo, género, sello, año y valoración, y las Collections que marques como playlists en una carpeta llamada CuePoint. Un Set que marques es una playlist en su orden de reproducción, en su propia ruta de carpeta.",
        ],
      },
      {
        heading: "Ábrelo en Rekordbox",
        paragraphs: [
          "Rekordbox muestra el archivo exportado como una segunda biblioteca, “rekordbox xml”, junto a la tuya. Indícale a Rekordbox el archivo en sus preferencias y arrastra a tu colección las playlists o los tracks que quieras. Puedes escribir los keys como lo hace Rekordbox, o en Camelot (8A).",
        ],
      },
    ],
    shot: "export",
    doesNot: [
      "Nunca escribe sobre el archivo que importaste, y lo rechaza como destino. La exportación siempre es un archivo nuevo que eliges tú.",
      "No escribe en la base de datos de Rekordbox.",
      "No exporta tags, notas ni favoritos. El XML de Rekordbox no tiene dónde ponerlos.",
      "No incluye tus archivos de audio en la exportación. Para poner valores en los archivos mismos, usa Write tags to files, después de una vista previa.",
    ],
    guide: { page: "rekordbox-export", label: "Lee la guía de exportación" },
    related: ["clean", "library"],
  },
];
