import type { UiStrings } from "./en";

/**
 * Os textos da interface em português do Brasil (DEC-311): tudo o que as páginas traduzidas e a moldura
 * comum dizem por conta própria. Tratamento por "você". As mesmas chaves de en.ts (o tipo garante isso), os
 * mesmos marcadores {nome} e as mesmas marcações (**negrito**, [texto](chave)). As palavras de
 * docs/translation.md ficam em inglês.
 */
const ptBr: UiStrings = {
  language: {
    label: "Idioma",
    switchLabel: "Escolher um idioma",
  },
  consent: {
    title: "Contagem de visitas",
    body: "Este site encontrou um cookie que ele mesmo não criou: {names}. A contagem de visitas só começa depois que você escolher.",
    yes: "Permitir contagem",
    no: "Não, obrigado",
  },
  inEnglish: "em inglês",
  skipLink: "Pular para o conteúdo principal",
  menu: "Menu",
  mainNav: "Principal",
  footerNav: "Rodapé",
  breadcrumb: "Caminho de navegação",
  nav: {
    home: "Início",
    features: "Recursos",
    guide: "Guia",
    faq: "FAQ",
    download: "Download",
    blog: "Blog",
    compare: "Comparar",
    changelog: "Histórico de mudanças",
    contact: "Contato",
    reportBug: "Relatar um bug",
    privacy: "Privacidade",
    terms: "Termos",
  },
  footer: {
    product: "Produto",
    help: "Ajuda",
    legal: "Legal",
    tagline: "Um app gratuito para desktop que arruma a sua biblioteca do Rekordbox.",
    legalLine: "© {year} {publisher}. {site} é um software gratuito para DJs.",
  },
  appNote: "O app em si está em inglês. Áreas como Clean, Library e Keys aparecem aqui exatamente com os nomes que o app usa.",
  primaryAction: "Ser avisado do 1.0",
  primaryActionShort: "Ser avisado",
  downloadLabel: {
    neutral: "Download",
    windows: "Baixar para Windows",
    macos: "Baixar para Mac",
    linux: "Baixar para Linux",
  },
  downloadedTimes: {
    one: "Baixado {count} vez",
    other: "Baixado {count} vezes",
  },
  unshipped: {
    compact: "Nota da prévia: ainda não está no app (chega com {step}).",
    title: "Nota da prévia: ainda não está no app.",
    body: "Isto descreve algo que chega com {step}. Uma build pública falha enquanto esta nota não for removida.",
  },
  appShot: {
    placeholderTag: "Espaço reservado para captura de tela",
    placeholderSize: "{width} por {height}, o tamanho do próprio app",
    placeholderCaption: "Espaço reservado para captura de tela: a imagem real está a caminho. Ela vai mostrar: {alt}",
    placeholderLowerFirst: false,
  },
  sound: "Som",
  home: {
    seeHow: "Veja como funciona",
    howItWorks: "Como funciona",
    whatTitle: "O que o CuePoint faz",
    aboutName: "sobre {name}",
    allFeatures: "Todos os recursos do CuePoint",
    trustTitle: "Com o que você pode contar",
    seeCode: "Ver o código no GitHub",
    getTitle: "Pegue o CuePoint",
    getTextRelease: "O CuePoint é gratuito para Windows, Mac e Linux.",
    getTextNone:
      "O CuePoint 1.0 ainda não saiu. Peça para ser avisado no GitHub quando sair, e ele será gratuito para Windows, Mac e Linux.",
    frameAlt: {
      messy: "Uma caixa de discos em capas cinza sem nada escrito e, atrás dela, uma roda Camelot vazia.",
      matched: "Os discos pendurados em uma grade, cada um com a sua key, como 8A ou 11B.",
      ready: "A roda Camelot acesa, cada disco no lugar da sua key, e cada célula mostrando a sua key.",
    },
  },
  features: {
    pageTitle: "O que o CuePoint faz pela sua biblioteca",
    lead: "O CuePoint é um app gratuito para desktop que pega a coleção que você exporta do Rekordbox, cruza com o Beatport e ajuda você a mantê-la em ordem. Cada parte tem a sua própria página.",
    listTitle: "Os recursos",
    compareTitle: "Comparado com outras ferramentas",
    compareIntro:
      "Não tem certeza se o CuePoint é a ferramenta certa? Estas páginas colocam ele ao lado de outras, com cada fato sobre a outra ferramenta ligado à página dela e com data.",
    compareRow: "CuePoint e {name}",
    getTitle: "Pegue o CuePoint",
    howTitle: "Como o CuePoint ajuda: {name}",
    notTitle: "O que ele não faz",
    nextTitle: "Continue por aqui",
    guideNote: "Os passos completos, no guia do usuário.",
    allFeatures: "Todos os recursos do CuePoint",
    allFeaturesNote: "Cada parte, em uma linha.",
    propAlt: {
      clean: "Uma pick-up em pixels com um disco em cima.",
      keys: "Uma roda Camelot em pixels com uma coluna em cada key, mais alta onde há mais tracks.",
      waveforms: "A waveform de um track desenhada como uma paisagem de colunas de pixels, com um cursor de reprodução cruzando por cima.",
    },
  },
  compare: {
    pageTitle: "CuePoint comparado com outras ferramentas de DJ",
    pageDescription:
      "O CuePoint ao lado de Lexicon, Mixed In Key e OpenKeyScan: fatos sobre cada ferramenta, ligados à página dela e com data, e o que o CuePoint não faz.",
    headTitle: "CuePoint comparado com outras ferramentas",
    lead: "Os DJs já usam boas ferramentas para cuidar de uma biblioteca. Estas páginas colocam o CuePoint ao lado de três delas, para você ver o que cada uma faz e escolher a que combina com você.",
    listTitle: "As comparações",
    rowName: "CuePoint e {name}",
    howTitle: "Como estas páginas são escritas",
    how1: "Cada fato sobre outra ferramenta liga à página dela em que foi lido e diz a data em que lemos.",
    how2: "Cada página diz o que o CuePoint não faz.",
    how3: "As ferramentas mudam. Estas páginas foram conferidas pela última vez em {date}. Se algo estiver desatualizado, [avise a gente](contact) e nós corrigimos.",
    sideTitle: "Lado a lado",
    caption: "CuePoint e {name}, assunto por assunto",
    topic: "Assunto",
    source: "Fonte: {link}, lida em {date}.",
    chooseTitle: "Qual combina com você",
    chooseOther: "Escolha {name} se",
    chooseCuePoint: "Escolha o CuePoint se",
    notTitle: "O que o CuePoint não faz",
    note: "O que dizemos sobre {name} vem das páginas públicas do próprio {name} nas datas indicadas, e as ferramentas mudam. Veja [o que a página Clean do CuePoint faz](clean) ou [as outras comparações](compare).",
  },
  faq: {
    title: "Perguntas frequentes | CuePoint",
    description:
      "Respostas rápidas sobre o CuePoint: se é gratuito, o que ele faz na sua biblioteca do Rekordbox, o que ele envia, como se atualiza e como relatar um problema.",
    heading: "Perguntas frequentes",
    lead: "Primeiro a resposta curta, com um link para a parte do [guia do usuário](guide) que explica melhor.",
    jumpTitle: "As perguntas",
    moreAbout: "Mais sobre: {question}",
  },
  download: {
    title: "Baixar o CuePoint",
    titleWithVersion: "Baixar o CuePoint {version}",
    descriptionRelease:
      "Baixe o CuePoint {version}, gratuito para Windows, macOS e Linux. Cada arquivo com tamanho e checksum, e o que esperar na primeira vez que você o abrir.",
    descriptionNone:
      "O CuePoint 1.0 ainda não saiu. Veja onde ele vai rodar e peça para ser avisado quando o download gratuito para Windows, Mac e Linux estiver pronto.",
    lead: "Gratuito, para Windows, macOS e Linux.",
    version: "Versão {version}",
    releaseNotes: "Notas da versão",
    releaseNotesFor: "da {version}",
    notes: {
      windows: "O instalador para Windows de 64 bits. O Windows pode avisar você na primeira vez: [veja o que fazer](windows).",
      windowsArm:
        "O seu PC tem um chip Arm. O CuePoint não tem versão para Arm, então este é o instalador de 64 bits (x64), que o Windows 11 em Arm roda pela emulação embutida, e por isso pode ficar mais lento. [O que esperar](windows).",
      macArm: "Para Macs com Apple silicon (M1 e posteriores). [Mac Intel?](all) [O que esperar](macos).",
      macArmGuess:
        "O seu navegador não informa qual chip o seu Mac tem, então esta é a versão para Apple silicon (M1 e posteriores). [Mac Intel?](all) [O que esperar](macos).",
      macIntel: "Para Macs com chip Intel. [Mac com Apple silicon?](all) [O que esperar](macos).",
      linux: "O AppImage para Linux de 64 bits. [Primeiro, torne-o executável](linux).",
      linuxArm: "A build do CuePoint para Linux é para computadores Intel e AMD de 64 bits. Não existe versão para Arm.",
      unknown: "Não conseguimos saber qual sistema você usa. Escolha o seu na [lista abaixo](all).",
      mobile: "O CuePoint roda no Windows, no macOS e no Linux. Abra esta página no seu computador para baixá-lo.",
    },
    allTitle: "Todos os downloads",
    allAsideBefore: "Todos os arquivos da versão {version}",
    allAsideWide: ", se você quiser o de outro sistema ou se o botão escolheu o errado.",
    allAsidePhone: ". Escolha o seu sistema.",
    kinds: {
      "windows-x64": { title: "Windows", detail: "Instalador para Windows 10 ou mais novo, de 64 bits" },
      "macos-arm64": { title: "Mac com Apple silicon", detail: "Imagem de disco para M1 e posteriores" },
      "macos-x64": { title: "Mac, Intel", detail: "Imagem de disco para Macs com chip Intel" },
      "linux-x64": { title: "Linux", detail: "AppImage para computadores Intel e AMD de 64 bits" },
    },
    checksum: "Checksum SHA-256",
    downloadButton: "Baixar",
    downloadFor: "Baixar CuePoint para {title}",
    verifyTitle: "Como conferir um download",
    verifyIntro: "Rode um destes comandos no arquivo que você baixou e compare o resultado com o checksum SHA-256 dele, acima.",
    codeWindows: "Comando do Windows",
    codeMac: "Comando do Mac",
    codeLinux: "Comando do Linux",
    codeMacComment: "# ou -mac-x64.dmg para um Mac Intel",
    notesLinks: "[Notas da versão {version} no GitHub](notes), ou [todas as versões no histórico de mudanças](changelog).",
    nextTitle: "O que acontece depois",
    nextAside:
      "O CuePoint não é assinado com um certificado de desenvolvedor pago, então o Windows e o macOS ficam desconfiados na primeira vez. Aqui está o que você vai ver e o que fazer.",
    windowsTitle: "Windows",
    windows: {
      s1: "Execute o instalador que você baixou.",
      s2: "O seu navegador pode perguntar se deve manter o arquivo. Escolha manter (no Edge, **Keep** e depois **Keep anyway**).",
      s3: "O Windows SmartScreen pode mostrar **Windows protected your PC**. Escolha **More info** e depois **Run anyway**.",
      updates:
        "Você só faz isso uma vez. Depois disso, o CuePoint encontra as versões novas sozinho e as baixa em segundo plano. Quando uma estiver pronta, a barra de status avisa: escolha **Restart now** para instalá-la e voltar, ou **Later** para instalá-la na próxima vez que você fechar o app.",
    },
    macTitle: "Mac",
    mac: {
      s1: "Abra a imagem de disco, arraste o CuePoint para **Applications** e abra-o de lá.",
      s2: "Se o seu Mac disser que o CuePoint está danificado, ou mostrar **\"CuePoint\" Not Opened** porque a Apple não conseguiu verificá-lo, é porque o app não é assinado. Rode isto no Terminal e abra o CuePoint de novo:",
      terminalLabel: "Comando do Terminal",
      s3: "Ainda bloqueado depois de uma tentativa? Abra **System Settings**, depois **Privacy & Security**, role para baixo e escolha **Open Anyway** ao lado do CuePoint.",
      updates:
        "Você só faz isso uma vez. Depois disso, o CuePoint encontra as versões novas sozinho e as baixa em segundo plano. Quando uma estiver pronta, a barra de status avisa: escolha **Restart now** para instalá-la e voltar, ou **Later** para instalá-la na próxima vez que você fechar o app. Se o CuePoint não conseguir se substituir onde está, por exemplo quando roda a partir da imagem de disco, ele mostra um link **Download** no lugar.",
    },
    linuxTitle: "Linux",
    linux: {
      s1: "Torne o AppImage executável e depois rode:",
      terminalLabel: "Comando do Terminal",
      s2: "A build para Linux é experimental. Ela vem sem o player de música embutido.",
      updates:
        "O CuePoint não instala atualizações no Linux. Ele avisa quando sai uma versão nova, com um link **Download** que abre a página da versão. Baixe o novo AppImage e rode.",
    },
    updateByHand:
      "O CuePoint ainda não se atualiza sozinho. Para ter uma versão nova, baixe o novo instalador e instale por cima da antiga. A sua biblioteca continua onde está.",
    comingTitle: "O CuePoint 1.0 está chegando",
    comingLead:
      "O CuePoint é gratuito, e a primeira versão completa ainda não saiu. Quando sair, o download para o seu computador vai estar aqui.",
    comingBody:
      "Isso abre a página do CuePoint no GitHub. Escolha **Watch**, depois **Custom**, depois **Releases**, e o GitHub avisa você quando o 1.0 for publicado.",
    requirementsTitle: "Onde o CuePoint roda",
    reqWindows: "**Windows:** Windows 10 ou mais novo, de 64 bits (x64).",
    reqMac:
      "**Mac:** macOS 14 ou mais novo em Apple silicon (M1 e posteriores), ou macOS 15 ou mais novo em chip Intel. Há um download para cada um.",
    reqLinux:
      "**Linux:** Intel ou AMD de 64 bits, como AppImage. Esta build é experimental e vem sem o player de música embutido.",
    reqRekordbox: "O CuePoint também precisa da sua coleção do Rekordbox, exportada do Rekordbox como um arquivo XML.",
    testBuildsTitle: "Quer testar uma build de teste?",
    testBuilds:
      "As builds de teste são versões iniciais do 1.0 e podem ser meio brutas. Elas estão no [GitHub Releases](releases) para quem quiser testar uma.",
  },
};

export default ptBr;
