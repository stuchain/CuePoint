import type { FeaturePage, Overview } from "../../features";

/**
 * As páginas de recursos em português do Brasil (DEC-311). Os mesmos fatos do inglês, tratamento por "você".
 * Os nomes do app (Clean, Library, Keys, Discover, Prepare, Statistics, Waveforms, Match, Health, Track details,
 * "Write tags to files", "No Beatport key", Relocate) e as palavras de DJ (key, BPM, Hot Cue, Beatgrid,
 * Playlist, Set, Track, Label, Remix) ficam em inglês. A estrutura e os campos que não são texto são
 * conferidos por src/i18n/parity.test.ts.
 */

export const OVERVIEW = {
  title: "Recursos do CuePoint para DJs de Rekordbox",
  description:
    "Tudo o que o CuePoint faz com a sua biblioteca do Rekordbox: cruzar com o Beatport, corrigir keys, achar música nova, planejar sets, waveforms e exportar.",
} as const satisfies Overview;

export const FEATURE_PAGES: readonly FeaturePage[] = [
  {
    slug: "clean",
    name: "Clean",
    query: "corrigir tags de key do Rekordbox",
    title: "Corrija as keys do Rekordbox com o Beatport | CuePoint",
    description:
      "Cruze tracks do Rekordbox com o Beatport e preencha keys, BPM, gêneros e labels que faltam ou estão errados. Revise, ache duplicatas e arquivos ausentes.",
    heading: "Corrija as keys e as tags da sua biblioteca do Rekordbox",
    summary: "Cruze tracks com o Beatport, corrija valores, ache duplicatas e arquivos ausentes.",
    problem: [
      "Metade dos seus tracks está sem key, ou com uma key em que você não confia. O gênero está em branco em alguns e errado em outros. A mesma música aparece duas vezes na coleção, e alguns arquivos mudaram de lugar quando você reorganizou um HD.",
      "Consertar isso na mão, um track por vez, toma um fim de semana. A maioria dos DJs não faz, e depois fica garimpando os tracks errados na hora do show.",
    ],
    how: [
      {
        heading: "Cruze com o Beatport e depois revise",
        paragraphs: [
          "Escolha uma playlist, uma Collection, a sua seleção ou a biblioteca inteira e clique em Match. O CuePoint procura cada track no Beatport e guarda todos os candidatos que encontrou, com uma pontuação e o motivo pelo qual recusou os que não escolheu.",
          "Ele só aceita um resultado sozinho quando o melhor candidato tem 95 pontos ou mais e passa em todas as verificações. Todo o resto espera por você em Match, um track ao lado do melhor resultado dele no Beatport, onde o teclado faz o trabalho: A corrige, R diz que não é esse track, N pula.",
        ],
      },
      {
        heading: "Key, BPM, gênero, label e ano",
        paragraphs: [
          "Um resultado aceito dá ao track a key do Beatport. O BPM, o gênero, o label e o ano são oferecidos lado a lado, e você marca os que quer aplicar. Os seus valores ficam por cima e os do Rekordbox continuam por baixo, então qualquer mudança pode ser desfeita.",
          "Título, artista, remixer e álbum nunca são alterados.",
        ],
      },
      {
        heading: "Duplicatas e arquivos ausentes",
        paragraphs: [
          "O Clean agrupa tracks que podem ser a mesma gravação: o mesmo arquivo, o mesmo track do Beatport, ou o mesmo artista, título e mix. Ele também lista os arquivos que estão ausentes ou ilegíveis, e avisa uma vez de um HD que não está conectado, em vez de mostrar milhares de arquivos ausentes.",
          "Uma aba Health conta tudo o que precisa de você, e cada contagem abre a Library só com esses tracks.",
        ],
      },
    ],
    shot: "clean",
    doesNot: [
      "Ele não apaga nada. Nenhum track, arquivo ou playlist é removido, movido ou renomeado. Para se livrar de uma duplicata, remova-a no Rekordbox e atualize.",
      "Ele não move arquivos ausentes. Isso é com o Relocate do Rekordbox, e o Clean mostra quais arquivos precisam do Relocate.",
      "Ele não chuta. Um track que o Beatport não tem não recebe key do CuePoint, a menos que você digite uma.",
      "Ele não descobre a key a partir do áudio. Os valores vêm do Beatport.",
    ],
    guide: { page: "clean", label: "Leia o guia da página Clean" },
    related: ["library", "export"],
  },
  {
    slug: "library",
    name: "A Library",
    query: "filtrar tracks do Rekordbox por key e BPM",
    title: "Filtre e ordene sua biblioteca do Rekordbox | CuePoint",
    description:
      "Pesquise e filtre a sua coleção inteira do Rekordbox por key, BPM e gênero, escolha as colunas e veja tudo o que o CuePoint sabe sobre um track.",
    heading: "Ache o track certo na sua coleção inteira do Rekordbox",
    summary: "Busca, filtros e colunas sobre a sua coleção inteira.",
    problem: [
      "Você sabe que o próximo track precisa ter de 124 a 130 BPM, em uma key que combine com a do que está tocando. Achar isso em uma lista longa do Rekordbox é rolar a tela e apertar os olhos.",
    ],
    how: [
      {
        heading: "Pesquise, filtre e ordene tudo",
        paragraphs: [
          "Importe a coleção que você exportou do Rekordbox e a página Library mostra tudo com as suas playlists à esquerda. Digite para pesquisar títulos, artistas, álbuns e labels, ou adicione filtros como BPM entre 124 e 130, gênero é Techno, ou um comentário que contenha uma palavra. Os filtros se somam, e a barra diz quantos tracks sobraram.",
          "Escolha as suas colunas, clique no cabeçalho de uma coluna para ordenar e clique em um track para ver tudo o que o CuePoint sabe sobre ele no Track details, à direita.",
        ],
      },
      {
        heading: "A roda Camelot",
        paragraphs: [
          "Um botão ao lado da busca, em todas as páginas, abre uma roda com as 24 keys. Ela acende a key do track que você selecionou, ou do que está tocando, e as keys que combinam com ela: o mesmo número um passo para cada lado, e a key relativa.",
          "Clique em uma key e a Library mostra todos os tracks nessa key.",
        ],
      },
      {
        heading: "Keys do Beatport, ou suas",
        paragraphs: [
          "A key de um track é a que você digitou ou, se não houver, a key do resultado aceito dele no Beatport, mostrada em Camelot (8A). A key do próprio Rekordbox nunca é usada. Um track sem nenhuma das duas não tem key, e a Library diz “No Beatport key”.",
        ],
      },
    ],
    shot: "library",
    doesNot: [
      "Navegar não muda nada. Os arquivos só mudam quando você escolhe “Write tags to files”, depois de uma prévia.",
      "Ele não descobre a key a partir do áudio. Um track sem resultado no Beatport e sem key sua não tem key.",
      "Ele não usa a key do Rekordbox, porque as keys do Rekordbox podem estar erradas.",
    ],
    guide: { page: "library", label: "Leia o guia da página Library" },
    related: ["clean", "discover"],
    fromDecisions: ["DEC-133", "DEC-157", "DEC-160", "DEC-201"],
  },
  {
    slug: "keys",
    name: "Keys",
    query: "keys na minha playlist do Rekordbox",
    title: "Veja as keys das suas playlists do Rekordbox | CuePoint",
    description:
      "Conte as keys de uma ou várias playlists, Collections ou Sets na roda Camelot e liste os tracks nas keys que escolher. Gratuito para DJs de Rekordbox.",
    heading: "Veja quais keys as suas playlists têm",
    summary: "As keys de uma ou várias playlists na roda Camelot, com contagens.",
    problem: [
      "Antes de um show, você quer saber do que a caixa é feita. É tudo 8A e 9A, ou não tem nada que sirva para abrir em 3B? O Rekordbox não conta as keys para você.",
    ],
    how: [
      {
        heading: "Escolha as playlists, leia a roda",
        paragraphs: [
          "Keys é uma página própria na barra lateral. Escolha a biblioteca inteira, ou marque várias playlists, Collections e Sets. O CuePoint conta cada key em tudo o que você escolheu e mostra as contagens na roda Camelot, mais escuras onde há mais, e como uma lista na ordem Camelot. Um track que está em várias fontes é contado uma vez.",
          "Os números estão escritos na página, e não só aparecem ao passar o mouse.",
        ],
      },
      {
        heading: "Depois, os tracks",
        paragraphs: [
          "Clique em uma ou mais keys para listar esses tracks logo abaixo. Peça as keys que combinam com 8A e a roda as acende. Abra a escolha na Library, ou salve como uma Smart Collection, levando junto as playlists que você marcou.",
        ],
      },
      {
        heading: "Só as keys em que o CuePoint confia",
        paragraphs: [
          "A contagem usa a sua própria key de um track ou, se não houver, a key do resultado aceito dele no Beatport. Os tracks sem nenhuma das duas são contados em uma linha à parte, “No Beatport key”, para você ver quanto da playlist ainda precisa ser cruzado.",
        ],
      },
    ],
    shot: "keys",
    doesNot: [
      "Ele não altera as suas playlists nem os seus arquivos.",
      "Ele não conta as keys do Rekordbox. Um track sem key do Beatport e sem key sua aparece como sem key.",
      "Ele não descobre a key a partir do áudio.",
    ],
    guide: { page: "keys", label: "Leia o guia da página Keys" },
    related: ["library", "statistics"],
    fromDecisions: ["DEC-200", "DEC-201", "DEC-206"],
  },
  {
    slug: "discover",
    name: "Discover",
    query: "achar música nova de artistas e labels no Beatport",
    title: "Ache música nova dos seus artistas e labels | CuePoint",
    description:
      "O Discover procura no Beatport tracks novos dos artistas e labels que já estão na sua biblioteca, esconde o que você já tem e guarda uma wantlist. Gratuito.",
    heading: "Ache música nova dos artistas e labels que você toca",
    summary: "Música nova do Beatport dos artistas e labels que já estão na sua biblioteca.",
    problem: [
      "Você toca os mesmos labels há anos. Acompanhar o que eles e os seus artistas favoritos lançam significa olhar o Beatport página após página.",
    ],
    how: [
      {
        heading: "Buscas que leem o Beatport por você",
        paragraphs: [
          "Comece uma busca e diga o que procurar: charts do Beatport nos gêneros que você escolher, feitos por artistas da sua biblioteca, e lançamentos novos dos seus labels nos últimos dias. Todos os artistas e labels da biblioteca, só os que você escolher, ou nenhum.",
          "Uma busca trabalha em segundo plano enquanto você continua usando o CuePoint, e cada busca fica guardada até você apagá-la, então dá para abrir a do mês passado.",
        ],
      },
      {
        heading: "Sem o que você já tem",
        paragraphs: [
          "Os tracks que a sua biblioteca já tem ficam escondidos, com a contagem de quantos são. Um track conta como seu quando um da sua biblioteca tem um resultado aceito para ele no Clean.",
        ],
      },
      {
        heading: "Uma wantlist, uma playlist do Beatport e tracks parecidos",
        paragraphs: [
          "Adicione o que você quer à wantlist no CuePoint, ou envie para uma playlist da sua conta do Beatport. De qualquer track você pode abrir a página do artista ou do label dele e achar, na sua própria biblioteca, tracks parecidos com um de que você gosta.",
        ],
      },
    ],
    shot: "discover",
    doesNot: [
      "Ele não compra, não baixa e não toca tracks do Beatport. Eles não têm arquivo na sua biblioteca, então não dá para tocá-los no CuePoint.",
      "Ele precisa de um token do Beatport. O Beatport não entrega tokens na página da sua conta; você pede acesso à API ao Beatport primeiro, e o guia leva você por esse passo a passo.",
      "Ele não sabe que um track é seu até você cruzá-lo no Clean. Até lá, o Discover o mostra como novo.",
    ],
    guide: { page: "discover", label: "Leia o guia da página Discover" },
    related: ["clean", "prepare"],
  },
  {
    slug: "prepare",
    name: "Prepare",
    query: "planejar um set de DJ antes do show",
    title: "Planeje um set de DJ antes do show | CuePoint",
    description:
      "Monte um set como sequência em capítulos, com horários planejados. O CuePoint confere cada transição, sugere tracks para um buraco e gera uma set list.",
    heading: "Planeje o seu set antes de chegar na cabine",
    summary: "Monte um Set em capítulos, com horários, verificações de transição e uma set list.",
    problem: [
      "Você planeja um set de cabeça, ou em um pedaço de papel, e só descobre no show que dois tracks batem de frente na key ou que o aquecimento está vinte minutos mais longo do que devia.",
    ],
    how: [
      {
        heading: "Uma sequência em capítulos",
        paragraphs: [
          "Um Set é uma sequência. Comece um vazio, ou copie para ele uma Collection, uma playlist do Rekordbox ou a sua seleção. Divida em capítulos, como aquecimento, pico e encerramento, e dê a um capítulo uma duração-alvo e uma faixa de BPM.",
          "Cada item pode ter um horário planejado de entrada e de saída, e assim o Set soma quanto tempo vai durar. Ele conta só os itens que você marcou com horário e diz quantos não contou.",
        ],
      },
      {
        heading: "Verificações que se explicam",
        paragraphs: [
          "O CuePoint confere cada transição e diz o que encontra: um salto de BPM fora da janela que encaixa (metade e dobro do BPM contam como encaixe), um choque de keys sem relação na roda Camelot, ou um track sem BPM para comparar. Ele também avisa de um arquivo ausente e de um capítulo que passa ou fica abaixo da duração-alvo.",
          "Um aviso nunca impede você. Marque como visto um aviso que você já ouviu e sabe que funciona.",
        ],
      },
      {
        heading: "Sugestões e uma set list",
        paragraphs: [
          "Escolha um buraco e o CuePoint sugere tracks que encaixam entre os dois que o cercam. Toque o Set como fila, depois salve uma set list como texto, CSV ou M3U8, ou exporte o Set para o Rekordbox como uma playlist.",
        ],
      },
    ],
    shot: "prepare",
    doesNot: [
      "Ele não faz mixagem. Tocar um Set toca os tracks inteiros, um depois do outro. Os horários planejados são o seu plano, e nada começa, para ou faz crossfade neles.",
      "Ele não coloca capítulos, horários nem notas no Rekordbox. O Rekordbox não tem onde guardar isso, então uma exportação é uma playlist comum na sua sequência.",
      "Um Set comporta até 1.000 itens.",
    ],
    guide: { page: "prepare", label: "Leia o guia da página Prepare" },
    related: ["library", "waveforms"],
  },
  {
    slug: "statistics",
    name: "Statistics",
    query: "tracks mais tocados no Rekordbox",
    title: "Tracks mais tocados e nunca tocados | CuePoint",
    description:
      "Veja seus tracks mais tocados, os artistas e labels do topo, os tracks que você nunca tocou e como a biblioteca se distribui por gênero, key e BPM. Gratuito.",
    heading: "Veja o que a sua biblioteca do Rekordbox realmente tem",
    summary: "Os mais tocados, os nunca tocados e como a biblioteca se distribui.",
    problem: [
      "Quais tracks você realmente toca? Quais estão na biblioteca há três anos sem ser tocados uma única vez? O Rekordbox guarda os números e não faz a soma para você.",
    ],
    how: [
      {
        heading: "O que você toca",
        paragraphs: [
          "O Statistics lista os seus tracks mais tocados como um top 10, 25, 50, 100 ou 200, os seus artistas e labels do topo pelos plays dos tracks deles, e os tracks que você nunca tocou. As contagens de plays são as do Rekordbox.",
          "O CuePoint também lembra as contagens que lê em cada importação e atualização, e assim pode mostrar o que você tocou desde uma data. Esse histórico começa na última importação antes de o CuePoint começar a guardar contagens, e nada anterior pode ser recuperado.",
        ],
      },
      {
        heading: "Como a biblioteca é por dentro",
        paragraphs: [
          "Veja como os seus tracks se distribuem por gênero, key, BPM, ano, data de adição, nota e loudness. O resumo de keys conta as keys em que o CuePoint confia e os tracks que ainda não têm nenhuma, e abre a página Keys com as mesmas playlists. Uma seção de saúde conta os arquivos ausentes, os tracks cruzados com o Beatport e os tracks com waveforms analisadas.",
          "Todo número leva a algum lugar: uma barra ou uma linha abre a Library só com esses tracks.",
        ],
      },
    ],
    shot: "statistics",
    doesNot: [
      "Ele não conta plays no player do próprio CuePoint. Os plays são os do Rekordbox.",
      "Ele não consulta nada. Todo número vem do que a sua biblioteca já tem.",
      "Ele não consegue mostrar plays de antes do início do histórico.",
    ],
    guide: { page: "statistics", label: "Leia o guia da página Statistics" },
    related: ["keys", "clean"],
    fromDecisions: ["DEC-136", "DEC-137", "DEC-138", "DEC-168", "DEC-206"],
  },
  {
    slug: "waveforms",
    name: "Waveforms e o player",
    query: "waveform e loudness dos meus tracks de DJ",
    title: "Waveforms e loudness dos seus tracks de DJ | CuePoint",
    description:
      "O CuePoint desenha uma waveform para cada track que encontra, com seus cues e Beatgrid do Rekordbox, mede o loudness e toca música sem pausas. Gratuito.",
    heading: "Veja o formato e o loudness de cada track antes de tocar",
    summary: "Uma waveform e um número de loudness para cada track, e um player para testar.",
    problem: [
      "Você quer ver onde está o breakdown e quanto dura a intro, sem tocar o track. E quer saber se o próximo vai soar mais alto quando você o colocar.",
    ],
    how: [
      {
        heading: "Uma waveform para cada track",
        paragraphs: [
          "O CuePoint calcula uma waveform para cada track cujo arquivo consegue encontrar, a partir do próprio áudio, em segundo plano e com baixa prioridade. Ele a desenha na barra do player (um clique move a reprodução), no Track details, como uma coluna da Library e na barra de transição do Prepare. Escolha três bandas de cor para graves, médios e agudos, ou uma cor só.",
          "Os seus Hot Cues, memory cues, loops e Beatgrid do Rekordbox são desenhados nela.",
        ],
      },
      {
        heading: "Loudness em LUFS",
        paragraphs: [
          "A mesma análise mede o quão alto é cada track ao longo dele todo, e o pico mais alto. Na barra de transição do Prepare, as palavras entre dois tracks dizem quanto mais alto ou mais baixo o próximo é.",
        ],
      },
      {
        heading: "Um player que faz o que você pede",
        paragraphs: [
          "Dê dois cliques em um track e a lista que você estava vendo vira a fila. A reprodução é sem pausas, pela saída de áudio que você escolher. Nada toca até você pedir.",
        ],
      },
    ],
    shot: "waveforms",
    doesNot: [
      "Ele não aumenta nem diminui o volume de um track pelo loudness, e não grava o número nos seus arquivos nem no Rekordbox.",
      "Ele não edita cues nem Beatgrids. Eles são do Rekordbox: mova um no Rekordbox e atualize.",
      "Ele não faz zoom nem rolagem. Uma waveform é o track inteiro de uma vez.",
      "A primeira análise de uma biblioteca grande leva horas: cerca de 6.000 tracks de seis minutos por hora em um desktop recente. Ela pode ser pausada e continua depois de reiniciar.",
      "A build para Linux vem sem o player.",
    ],
    guide: { page: "waveforms", label: "Leia o guia da página Waveforms" },
    related: ["prepare", "library"],
  },
  {
    slug: "export",
    name: "Exportar para o Rekordbox",
    query: "exportar keys editadas de volta para o XML do Rekordbox",
    title: "Exporte suas mudanças de volta ao Rekordbox | CuePoint",
    description:
      "Grave suas keys, BPM, gêneros, labels e playlists em um novo arquivo XML do Rekordbox. Cue points e Beatgrids são mantidos, e o original fica intacto.",
    heading: "Mande as suas correções de volta ao Rekordbox, com segurança",
    summary: "Um novo arquivo XML do Rekordbox com os seus valores, mantendo cues e Beatgrids.",
    problem: [
      "Você corrigiu centenas de keys e montou Collections. Elas só servem se voltarem para o Rekordbox, sem perder os cue points que você levou anos para marcar.",
    ],
    how: [
      {
        heading: "Uma cópia ajustada, não uma reconstrução",
        paragraphs: [
          "O Export pega o arquivo XML que você importou, copia e muda só os valores que você mudou no CuePoint. Hot Cues, memory cues, Beatgrids e tudo o mais que o Rekordbox gravou passam exatamente como estavam.",
        ],
      },
      {
        heading: "Leia a prévia e depois exporte",
        paragraphs: [
          "Uma prévia diz o que vai ser gravado antes de qualquer coisa ser gravada: para onde o arquivo vai, quantos tracks recebem os seus valores, campo por campo, e cada playlist. Ela também avisa se o arquivo que você importou mudou desde então. O botão diz o que vai fazer, por exemplo “Export 3,880 tracks and 4 playlists”.",
          "Ele grava a sua key, BPM, gênero, label, ano e nota, e as Collections que você marcar como playlists em uma pasta chamada CuePoint. Um Set que você marcar vira uma playlist na ordem dele, no caminho de pasta dele.",
        ],
      },
      {
        heading: "Abra no Rekordbox",
        paragraphs: [
          "O Rekordbox mostra o arquivo exportado como uma segunda biblioteca, “rekordbox xml”, ao lado da sua. Aponte o Rekordbox para o arquivo nas preferências e arraste para a sua coleção as playlists ou os tracks que quiser. Você pode gravar as keys como o Rekordbox faz, ou em Camelot (8A).",
        ],
      },
    ],
    shot: "export",
    doesNot: [
      "Ele nunca grava por cima do arquivo que você importou e o recusa como destino. A exportação é sempre um arquivo novo, que você escolhe.",
      "Ele não grava no banco de dados do Rekordbox.",
      "Ele não exporta tags, notas nem favoritos. O XML do Rekordbox não tem onde colocá-los.",
      "Ele não coloca os seus arquivos de áudio na exportação. Para gravar valores nos próprios arquivos, use “Write tags to files”, depois de uma prévia.",
    ],
    guide: { page: "rekordbox-export", label: "Leia o guia da exportação" },
    related: ["clean", "library"],
  },
];
