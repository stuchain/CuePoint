import type { UiStrings } from "./en";

/**
 * Los textos de la interfaz en español (DEC-311): todo lo que dicen por sí mismas las páginas traducidas y el
 * marco común. Trato de tú. Las mismas claves que en.ts (el tipo lo exige), los mismos marcadores {name} y las
 * mismas marcas (**negrita**, [texto](clave)). Las palabras de docs/translation.md se quedan en inglés.
 */
const es: UiStrings = {
  language: {
    label: "Idioma",
    switchLabel: "Elige un idioma",
  },
  consent: {
    title: "Contar visitas",
    body: "Este sitio ha encontrado una cookie que no puso él mismo: {names}. Las visitas no se cuentan hasta que elijas.",
    yes: "Permitir contar",
    no: "No, gracias",
  },
  inEnglish: "en inglés",
  skipLink: "Saltar al contenido principal",
  menu: "Menú",
  mainNav: "Principal",
  footerNav: "Pie de página",
  breadcrumb: "Ruta de navegación",
  nav: {
    home: "Inicio",
    features: "Funciones",
    guide: "Guía",
    faq: "FAQ",
    download: "Descargar",
    blog: "Blog",
    compare: "Comparar",
    changelog: "Historial de cambios",
    contact: "Contacto",
    reportBug: "Informar de un error",
    privacy: "Privacidad",
    terms: "Términos",
  },
  footer: {
    product: "Producto",
    help: "Ayuda",
    legal: "Aviso legal",
    tagline: "Una app de escritorio gratuita que ordena tu biblioteca de Rekordbox.",
    legalLine: "© {year} {publisher}. {site} es software libre para DJs.",
  },
  appNote: "La app está en inglés. Las áreas como Clean, Library y Keys se nombran aquí exactamente como las nombra la app.",
  primaryAction: "Avísame del 1.0",
  downloadLabel: {
    neutral: "Descargar",
    windows: "Descargar para Windows",
    macos: "Descargar para Mac",
    linux: "Descargar para Linux",
  },
  downloadedTimes: {
    one: "Descargado {count} vez",
    other: "Descargado {count} veces",
  },
  unshipped: {
    compact: "Nota de la vista previa: aún no está en la app (llega con {step}).",
    title: "Nota de la vista previa: aún no está en la app.",
    body: "Esto describe algo que llega con {step}. Una versión pública falla hasta que se quita esta nota.",
  },
  appShot: {
    placeholderTag: "Marcador de captura",
    placeholderSize: "{width} por {height}, el tamaño propio de la app",
    placeholderCaption: "Marcador de captura: la imagen real está en camino. Mostrará: {alt}",
    placeholderLowerFirst: false,
  },
  sound: "Sonido",
  home: {
    seeHow: "Mira cómo funciona",
    howItWorks: "Cómo funciona",
    whatTitle: "Qué hace CuePoint",
    aboutName: "sobre {name}",
    allFeatures: "Todas las funciones de CuePoint",
    trustTitle: "En qué puedes confiar",
    seeCode: "Ver el código en GitHub",
    getTitle: "Consigue CuePoint",
    getTextRelease: "CuePoint es gratis para Windows, Mac y Linux.",
    getTextNone:
      "CuePoint 1.0 todavía no ha salido. Haz que GitHub te avise cuando salga, y será gratis para Windows, Mac y Linux.",
    frameAlt: {
      messy: "Una caja de discos en fundas grises sin nada escrito, y detrás una rueda Camelot vacía.",
      matched: "Los discos colgados en una cuadrícula, cada uno con la etiqueta de su key, como 8A u 11B.",
      ready: "La rueda Camelot iluminada, cada disco en el lugar de su key, y cada celda muestra su key.",
    },
  },
  features: {
    pageTitle: "Lo que CuePoint hace por tu biblioteca",
    lead: "CuePoint es una app de escritorio gratuita que toma la colección que exportas de Rekordbox, la cruza con Beatport y te ayuda a mantenerla ordenada. Cada parte tiene su propia página.",
    listTitle: "Las funciones",
    compareTitle: "Comparado con otras herramientas",
    compareIntro:
      "¿No estás seguro de que CuePoint sea la herramienta adecuada? Estas páginas lo ponen junto a otras, con cada dato de la otra herramienta enlazado a su propia página y con fecha.",
    compareRow: "CuePoint y {name}",
    getTitle: "Consigue CuePoint",
    howTitle: "Cómo ayuda CuePoint: {name}",
    notTitle: "Lo que no hace",
    nextTitle: "Sigue leyendo",
    guideNote: "Los pasos completos, en la guía de usuario.",
    allFeatures: "Todas las funciones de CuePoint",
    allFeaturesNote: "Cada parte, en una línea.",
    propAlt: {
      clean: "Un tocadiscos de píxeles con un disco encima.",
      keys: "Una rueda Camelot de píxeles con una columna en cada key, más alta donde hay más tracks.",
      waveforms: "La forma de onda de un track dibujada como un paisaje de columnas de píxeles, con un cabezal que la cruza.",
    },
  },
  compare: {
    pageTitle: "CuePoint comparado con otras herramientas de DJ",
    pageDescription:
      "CuePoint junto a Lexicon, Mixed In Key y OpenKeyScan: datos de cada herramienta enlazados a su propia página y con fecha, y lo que CuePoint no hace.",
    headTitle: "CuePoint comparado con otras herramientas",
    lead: "Los DJs ya usan buenas herramientas para cuidar una biblioteca. Estas páginas ponen CuePoint junto a tres de ellas, para que veas qué hace cada una y elijas la que te convenga.",
    listTitle: "Las comparaciones",
    rowName: "CuePoint y {name}",
    howTitle: "Cómo se escriben estas páginas",
    how1: "Cada dato sobre otra herramienta enlaza la página de esa herramienta donde se leyó, e indica la fecha en que la leímos.",
    how2: "Cada página dice lo que CuePoint no hace.",
    how3: "Las herramientas cambian. Estas páginas se revisaron por última vez el {date}. Si algo está desactualizado, [avísanos](contact) y lo corregimos.",
    sideTitle: "Lado a lado",
    caption: "CuePoint y {name}, tema por tema",
    topic: "Tema",
    source: "Fuente: {link}, leída el {date}.",
    chooseTitle: "Cuál te conviene",
    chooseOther: "Elige {name} si",
    chooseCuePoint: "Elige CuePoint si",
    notTitle: "Lo que CuePoint no hace",
    note: "Lo que decimos sobre {name} viene de las páginas públicas de {name} en las fechas indicadas, y las herramientas cambian. Mira [lo que hace la página Clean de CuePoint](clean) o [las otras comparaciones](compare).",
  },
  faq: {
    title: "Preguntas frecuentes | CuePoint",
    description:
      "Respuestas rápidas sobre CuePoint: si es gratis, qué hace con tu biblioteca de Rekordbox, qué envía, cómo se actualiza y cómo informar de un problema.",
    heading: "Preguntas frecuentes",
    lead: "Primero las respuestas cortas, con un enlace a la parte de la [guía de usuario](guide) que profundiza.",
    jumpTitle: "Las preguntas",
    moreAbout: "Más sobre: {question}",
  },
  download: {
    title: "Descargar CuePoint",
    titleWithVersion: "Descargar CuePoint {version}",
    descriptionRelease:
      "Descarga CuePoint {version}, gratis para Windows, macOS y Linux. Cada archivo con su tamaño y su checksum, y qué esperar la primera vez que lo abras.",
    descriptionNone:
      "CuePoint 1.0 todavía no ha salido. Mira en qué funcionará y recibe un aviso cuando esté lista la descarga gratuita para Windows, Mac y Linux.",
    lead: "Gratis, para Windows, macOS y Linux.",
    version: "Versión {version}",
    releaseNotes: "Notas de la versión",
    releaseNotesFor: "de {version}",
    notes: {
      windows: "El instalador para Windows de 64 bits. Windows puede avisarte la primera vez: [esto es lo que tienes que hacer](windows).",
      windowsArm:
        "Tu PC tiene un chip Arm. CuePoint no tiene versión para Arm, así que este es el instalador de 64 bits (x64), que Windows 11 en Arm ejecuta con su emulación integrada, por lo que puede ir más lento. [Qué esperar](windows).",
      macArm: "Para Macs con Apple silicon (M1 y posteriores). [¿Un Mac con Intel?](all) [Qué esperar](macos).",
      macArmGuess:
        "Tu navegador no dice qué chip tiene tu Mac, así que esta es la versión para Apple silicon (M1 y posteriores). [¿Un Mac con Intel?](all) [Qué esperar](macos).",
      macIntel: "Para Macs con chip Intel. [¿Un Mac con Apple silicon?](all) [Qué esperar](macos).",
      linux: "El AppImage para Linux de 64 bits. [Primero hazlo ejecutable](linux).",
      linuxArm: "La versión de CuePoint para Linux es para computadoras Intel y AMD de 64 bits. No hay versión para Arm.",
      unknown: "No pudimos saber qué sistema usas. Elige el tuyo en [la lista de abajo](all).",
      mobile: "CuePoint funciona en Windows, macOS y Linux. Abre esta página en tu computadora para descargarlo.",
    },
    allTitle: "Todas las descargas",
    allAsideBefore: "Todos los archivos de la versión {version}",
    allAsideWide: ", por si quieres el de otro sistema o el botón eligió el equivocado.",
    allAsidePhone: ". Elige tu sistema.",
    kinds: {
      "windows-x64": { title: "Windows", detail: "Instalador para Windows 10 o más reciente, de 64 bits" },
      "macos-arm64": { title: "Mac con Apple silicon", detail: "Imagen de disco para M1 y posteriores" },
      "macos-x64": { title: "Mac con Intel", detail: "Imagen de disco para Macs con chip Intel" },
      "linux-x64": { title: "Linux", detail: "AppImage para computadoras Intel y AMD de 64 bits" },
    },
    checksum: "Checksum SHA-256",
    downloadButton: "Descargar",
    downloadFor: "Descargar CuePoint para {title}",
    verifyTitle: "Cómo comprobar una descarga",
    verifyIntro: "Ejecuta uno de estos comandos con el archivo que descargaste y compara el resultado con su checksum SHA-256 de arriba.",
    codeWindows: "Comando de Windows",
    codeMac: "Comando de Mac",
    codeLinux: "Comando de Linux",
    codeMacComment: "# o -mac-x64.dmg para un Mac con Intel",
    notesLinks: "[Notas de la versión {version} en GitHub](notes), o [todas las versiones en el historial de cambios](changelog).",
    nextTitle: "Qué pasa después",
    nextAside:
      "CuePoint no está firmado con un certificado de desarrollador de pago, así que Windows y macOS desconfían la primera vez. Esto es lo que verás y lo que tienes que hacer.",
    windowsTitle: "Windows",
    windows: {
      s1: "Ejecuta el instalador que descargaste.",
      s2: "Tu navegador puede preguntar si quieres conservar el archivo. Elige conservarlo (en Edge, **Keep** y luego **Keep anyway**).",
      s3: "Windows SmartScreen puede decir **Windows protected your PC**. Elige **More info** y luego **Run anyway**.",
      updates:
        "Eso lo haces una sola vez. Después CuePoint encuentra las versiones nuevas por sí mismo y las descarga en segundo plano. Cuando una está lista, la barra de estado te lo dice: elige **Restart now** para instalarla y volver, o **Later** para instalarla la próxima vez que cierres.",
    },
    macTitle: "Mac",
    mac: {
      s1: "Abre la imagen de disco, arrastra CuePoint a **Applications** y ábrelo desde ahí.",
      s2: "Si tu Mac dice que CuePoint está dañado, o **\"CuePoint\" Not Opened** porque Apple no pudo verificarlo, es porque la app no está firmada. Ejecuta esto en Terminal y vuelve a abrir CuePoint:",
      terminalLabel: "Comando de Terminal",
      s3: "¿Sigue bloqueado tras un intento? Abre **System Settings**, luego **Privacy & Security**, baja y elige **Open Anyway** junto a CuePoint.",
      updates:
        "Eso lo haces una sola vez. Después CuePoint encuentra las versiones nuevas por sí mismo y las descarga en segundo plano. Cuando una está lista, la barra de estado te lo dice: elige **Restart now** para instalarla y volver, o **Later** para instalarla la próxima vez que cierres. Si CuePoint no puede reemplazarse donde está, por ejemplo cuando se ejecuta desde la imagen de disco, muestra un enlace **Download** en su lugar.",
    },
    linuxTitle: "Linux",
    linux: {
      s1: "Haz ejecutable el AppImage y luego ejecútalo:",
      terminalLabel: "Comando de Terminal",
      s2: "La versión para Linux es experimental. Viene sin el reproductor de música integrado.",
      updates:
        "CuePoint no instala actualizaciones en Linux. Te avisa cuando sale una versión nueva, con un enlace **Download** que abre la página de la versión. Descarga el nuevo AppImage y ejecútalo.",
    },
    updateByHand:
      "CuePoint todavía no se actualiza solo. Para tener una versión nueva, descarga el instalador nuevo e instálalo encima del anterior. Tu biblioteca se queda donde está.",
    comingTitle: "CuePoint 1.0 está en camino",
    comingLead:
      "CuePoint es gratis, y la primera versión completa todavía no ha salido. Cuando salga, la descarga para tu computadora estará aquí.",
    comingBody:
      "Eso abre la página de CuePoint en GitHub. Elige **Watch**, luego **Custom**, luego **Releases**, y GitHub te avisa cuando se publique 1.0.",
    requirementsTitle: "En qué funciona CuePoint",
    reqWindows: "**Windows:** Windows 10 o más reciente, de 64 bits (x64).",
    reqMac:
      "**Mac:** macOS 14 o más reciente con Apple silicon (M1 y posteriores), o macOS 15 o más reciente con chip Intel. Hay una descarga para cada uno.",
    reqLinux:
      "**Linux:** Intel o AMD de 64 bits, como AppImage. Esta versión es experimental y viene sin el reproductor de música integrado.",
    reqRekordbox: "CuePoint también necesita tu colección de Rekordbox, exportada desde Rekordbox como archivo XML.",
    testBuildsTitle: "¿Quieres probar una versión de prueba?",
    testBuilds:
      "Las versiones de prueba son versiones tempranas de 1.0 y pueden estar poco pulidas. Están en [GitHub Releases](releases) para quien quiera probar una.",
  },
};

export default es;
