import { COMPARE_CHECKED, type CompareTool, type OtherFact, type Source } from "../../compare";

/**
 * As páginas de comparação em português do Brasil (DEC-312). Os endereços, as datas e a ordem das fontes são
 * os do inglês (src/i18n/parity.test.ts confere); o que se traduz são os textos e os nomes dos links.
 * As citações das páginas das outras ferramentas ficam no original em inglês, porque são citadas ao pé da letra.
 */

const at = (url: string, label: string): Source => ({ url, label });
const fact = (text: string, source: Source): OtherFact => ({ text, source, checked: COMPARE_CHECKED });

const LEXICON_HOME = at("https://www.lexicondj.com/", "Página inicial do Lexicon");
const LEXICON_PRICING = at("https://www.lexicondj.com/pricing", "Página de preços do Lexicon");
const MIK_HOME = at("https://mixedinkey.com/", "Página inicial do Mixed In Key");
const MIK_MORE = at("https://mixedinkey.com/learn-more/", "Página do Mixed In Key 11");
const MIK_REKORDBOX = at("https://mixedinkey.com/integration/rekordbox-integration/", "Página do Mixed In Key sobre o Rekordbox");
const MIK_WORKFLOW = at(
  "https://mixedinkey.com/workflows/use-mixed-in-key-with-rekordbox/",
  "Guia do Mixed In Key para usá-lo com o Rekordbox",
);
const OKS_HOME = at("https://www.openkeyscan.com/", "Página inicial do OpenKeyScan");
const REKORDCLOUD = at("https://rekord.cloud/", "Página inicial da rekordcloud");

export const COMPARE_TOOLS: readonly CompareTool[] = [
  {
    slug: "lexicon",
    name: "Lexicon",
    maker: "rekordcloud",
    hosts: ["lexicondj.com", "rekord.cloud"],
    title: "CuePoint vs. Lexicon: comparação lado a lado | CuePoint",
    description:
      "CuePoint e Lexicon (da rekordcloud) lado a lado: o que cada um faz com a sua biblioteca de DJ, com quais apps de DJ cada um funciona e o que o CuePoint não faz.",
    heading: "CuePoint e Lexicon (rekordcloud)",
    intro:
      "Os dois ajudam você a cuidar de uma biblioteca de DJ. Cada afirmação sobre o Lexicon abaixo vem das páginas públicas dele, com a data em que lemos. O que o CuePoint faz vem do guia do usuário dele.",
    summary: "Gestão de Library entre vários apps de DJ, ao lado do cruzamento do CuePoint com o Beatport para o Rekordbox.",
    rows: [
      {
        topic: "Quem faz",
        other: fact(
          "A página inicial da rekordcloud lista Lexicon, TrackHack, OpenKeyScan e SonoVault como produtos dela. Se você pesquisou por rekordcloud, o Lexicon é a suíte dela de gestão de biblioteca para DJs.",
          REKORDCLOUD,
        ),
        cuepoint: "O CuePoint é gratuito e open source, sob a licença Apache 2.0.",
      },
      {
        topic: "O que é",
        other: fact("A página inicial do Lexicon diz: “Organize, clean and upgrade your DJ library.”", LEXICON_HOME),
        cuepoint:
          "O CuePoint cruza os seus tracks do Rekordbox com o Beatport, preenche keys e outros valores, acha duplicatas e arquivos ausentes e manda o resultado de volta para o Rekordbox.",
      },
      {
        topic: "Quais apps de DJ",
        other: fact(
          "O Lexicon lista Rekordbox, Serato, Traktor, VirtualDJ, Engine DJ e djay Pro, e converte playlists, cue points e Beatgrids entre eles.",
          LEXICON_HOME,
        ),
        cuepoint: "O CuePoint funciona só com o Rekordbox. Ele lê a coleção que você exporta do Rekordbox como XML.",
      },
      {
        topic: "Duplicatas e arquivos ausentes",
        other: fact(
          "O Lexicon acha tracks duplicados e tracks quebrados ou ausentes. A página de preços dele lista Find Duplicates no plano Ultimate.",
          LEXICON_PRICING,
        ),
        cuepoint:
          "O Clean agrupa possíveis duplicatas e lista arquivos ausentes, de graça. Ele nunca junta nem apaga nada.",
      },
      {
        topic: "Tags e capas ausentes",
        other: fact(
          "O Lexicon acha tags e capas de álbum ausentes. A página de preços dele lista Find Missing Tags & Album Art no plano Ultimate.",
          LEXICON_PRICING,
        ),
        cuepoint:
          "O CuePoint procura cada track no Beatport e dá a ele a key do Beatport, e oferece o BPM, o gênero, o label e o ano. Ele lê a capa dos seus arquivos e, nos resultados aceitos, do Beatport.",
      },
      {
        topic: "Pontos de cue",
        other: fact("O Lexicon tem uma ferramenta Generate Cue Points que cria cues em lote.", LEXICON_HOME),
        cuepoint: "O CuePoint não cria cue points. Ele mantém os cues e Beatgrids que o Rekordbox gravou exatamente como estavam.",
      },
      {
        topic: "Apps de celular",
        other: fact("O Lexicon tem apps para iPhone e Android.", LEXICON_HOME),
        cuepoint: "O CuePoint é só um app para desktop.",
      },
      {
        topic: "Computadores",
        other: fact("O Lexicon diz que roda no Windows e no macOS.", LEXICON_HOME),
        cuepoint:
          "O CuePoint roda no Windows e em Macs com Apple silicon, e há uma build experimental para Linux. A página Download diz o que está disponível.",
      },
      {
        topic: "Preço",
        other: fact(
          "A página de preços do Lexicon mostra um plano Free com conversão de biblioteca, o Essential a partir de US$ 10,49 por mês ou US$ 249 no plano vitalício, e o Ultimate a partir de US$ 20,99 por mês ou US$ 499 no vitalício.",
          LEXICON_PRICING,
        ),
        cuepoint: "O CuePoint é gratuito.",
      },
    ],
    cuepointDoesNot: [
      "Ele não converte uma biblioteca entre apps de DJ. Funciona só com o Rekordbox.",
      "Ele não cria cue points nem define Beatgrids.",
      "Ele não tem app de celular nem armazenamento na nuvem.",
      "Ele não monitora uma pasta à procura de tracks novos.",
    ],
    chooseOther:
      "Se você usa mais de um app de DJ, ou quer levar uma biblioteca de um para outro, o Lexicon foi feito para isso e o CuePoint não.",
    chooseCuePoint:
      "Se você toca pelo Rekordbox e quer as keys e os outros valores dele conferidos com o Beatport, com cada resultado revisável e nada apagado, o CuePoint foi feito para isso. Você também pode usar os dois.",
  },
  {
    slug: "mixed-in-key",
    name: "Mixed In Key",
    maker: "Mixed In Key",
    hosts: ["mixedinkey.com"],
    title: "CuePoint vs. Mixed In Key: comparação lado a lado | CuePoint",
    description:
      "CuePoint e Mixed In Key lado a lado: de onde cada um tira a key de um track, o que gravam no Rekordbox, notas de energy, cue points e o que falta ao CuePoint.",
    heading: "CuePoint e Mixed In Key",
    intro:
      "Os dois podem dar aos seus tracks uma key para mixar. Cada afirmação sobre o Mixed In Key abaixo vem das páginas públicas dele, com a data em que lemos. O que o CuePoint faz vem do guia do usuário dele.",
    summary: "Análise de key e energy a partir do áudio, ao lado de keys vindas de resultados do Beatport.",
    rows: [
      {
        topic: "O que é",
        other: fact(
          "A página inicial do Mixed In Key descreve o Mixed In Key como: “Discover the key and BPM of any track to create harmonically perfect DJ sets.”",
          MIK_HOME,
        ),
        cuepoint:
          "O CuePoint cruza os seus tracks com o Beatport e preenche o que falta ou está errado, e depois manda de volta para o Rekordbox.",
      },
      {
        topic: "De onde vem a key",
        other: fact(
          "O Mixed In Key 11 diz para “Analyze your music collection”. Ele chama a própria detecção de key de “the world's most precise key-detection technology.”",
          MIK_MORE,
        ),
        cuepoint:
          "O CuePoint não descobre a key a partir do áudio. A key de um track é a que você digitou, ou a key do resultado aceito dele no Beatport. Um track que o Beatport não tem fica sem key até você dar uma.",
      },
      {
        topic: "Energy",
        other: fact(
          "A página inicial do Mixed In Key diz que as notas de Energy Level dele “show you how danceable each track is.”",
          MIK_HOME,
        ),
        cuepoint: "O CuePoint não tem nota de energy.",
      },
      {
        topic: "Pontos de cue",
        other: fact(
          "O Mixed In Key 11 diz que “will give you up to 8 automatic Cue Points per track.”",
          MIK_MORE,
        ),
        cuepoint: "O CuePoint não cria cue points. Ele mantém os que o Rekordbox tem.",
      },
      {
        topic: "Como os resultados dele chegam ao Rekordbox",
        other: fact(
          "A página do Mixed In Key sobre o Rekordbox manda analisar seus arquivos no Mixed In Key, adicioná-los ao Rekordbox e depois recarregar as tags deles, e diz que os resultados de Key e Energy são atualizados.",
          MIK_REKORDBOX,
        ),
        cuepoint:
          "O CuePoint grava um novo arquivo XML do Rekordbox para você abrir no Rekordbox, mantendo seus cues e Beatgrids. Ele também pode gravar tags nos seus arquivos, depois de uma prévia. O Rekordbox as mostra depois que você escolhe Reload Tag.",
      },
      {
        topic: "Pontos de cue no Rekordbox",
        other: fact(
          "O guia do Mixed In Key diz que cue points não fazem parte do recarregamento de tags: “Cue Points require the Rekordbox XML import workflow.”",
          MIK_WORKFLOW,
        ),
        cuepoint:
          "A exportação do CuePoint é uma cópia ajustada do XML que você importou, então os cues e Beatgrids que o Rekordbox gravou passam exatamente como estavam.",
      },
      {
        topic: "Onde os resultados aparecem no Rekordbox",
        other: fact(
          "Por padrão, os resultados de key do Mixed In Key vão para a coluna Key do Rekordbox e para a coluna Comments. Você pode mudar isso nas configurações Update Tags dele.",
          MIK_REKORDBOX,
        ),
        cuepoint: "A exportação do CuePoint grava a key no campo de key do novo arquivo XML, na notação que você escolher.",
      },
      {
        topic: "Notação Camelot",
        other: fact("A página inicial do Mixed In Key lista uma Camelot Wheel para mixagem harmônica.", MIK_HOME),
        cuepoint:
          "O CuePoint mostra a key de um track em notação Camelot, como 8A, e diz “No Beatport key” quando um track não tem. A key do próprio Rekordbox aparece como não usada.",
      },
      {
        topic: "Preço",
        other: fact(
          "O Mixed In Key 11 é vendido como compra única. As páginas que lemos não mostram valor; o preço está na loja dele.",
          MIK_MORE,
        ),
        cuepoint: "O CuePoint é gratuito.",
      },
    ],
    cuepointDoesNot: [
      "Ele não descobre a key a partir do áudio. Não consegue dar key a um track que o Beatport não tem.",
      "Ele não dá nota para a energy de um track.",
      "Ele não cria cue points.",
      "Ele não tem ferramentas para fazer música ou mashups.",
    ],
    chooseOther:
      "Se os seus tracks não estão no Beatport, ou você quer uma key calculada a partir do próprio som, além de notas de energy e cue points automáticos, o Mixed In Key faz isso e o CuePoint não.",
    chooseCuePoint:
      "Se os seus tracks estão no Beatport e você quer a key, o BPM, o gênero, o label e o ano do Beatport conferidos com o Rekordbox, com cada resultado revisável, o CuePoint faz isso de graça. Os dois não conflitam, então você pode usar ambos.",
  },
  {
    slug: "openkeyscan",
    name: "OpenKeyScan",
    maker: "rekordcloud",
    hosts: ["openkeyscan.com", "rekord.cloud"],
    title: "CuePoint vs. OpenKeyScan: comparação lado a lado | CuePoint",
    description:
      "CuePoint e o OpenKeyScan, da rekordcloud, lado a lado: como cada um acha a key de um track, onde funciona offline, o que grava e o que o CuePoint não faz.",
    heading: "CuePoint e OpenKeyScan (rekordcloud)",
    intro:
      "Os dois podem dar uma key a um track. Cada afirmação sobre o OpenKeyScan abaixo vem das páginas públicas dele ou da empresa que o faz, com a data em que lemos. O que o CuePoint faz vem do guia do usuário dele.",
    summary: "Um detector de key gratuito que escuta o áudio, ao lado de keys vindas do Beatport.",
    rows: [
      {
        topic: "Quem faz",
        other: fact(
          "A página inicial da rekordcloud lista o OpenKeyScan, com Lexicon, TrackHack e SonoVault, entre os produtos dela, e chama o OpenKeyScan de app gratuito e open source para desktop.",
          REKORDCLOUD,
        ),
        cuepoint: "O CuePoint é gratuito e open source, sob a licença Apache 2.0.",
      },
      {
        topic: "O que é",
        other: fact("A página do OpenKeyScan o descreve como “a free, open-source key detector.”", OKS_HOME),
        cuepoint:
          "O CuePoint é um app gratuito e open source para desktop que faz mais do que keys: cruza tracks com o Beatport, acha duplicatas e arquivos ausentes, descobre música nova e planeja sets.",
      },
      {
        topic: "De onde vem a key",
        other: fact(
          "O OpenKeyScan diz que transforma o áudio em um espectrograma e usa uma rede neural para reconhecer nele padrões harmônicos.",
          OKS_HOME,
        ),
        cuepoint:
          "O CuePoint não descobre a key a partir do áudio. Ele pega a key do resultado aceito no Beatport, ou de você.",
      },
      {
        topic: "Offline",
        other: fact("O OpenKeyScan diz que roda “completely offline on your machine.”", OKS_HOME),
        cuepoint:
          "Sua biblioteca fica no seu computador. O CuePoint vai à internet para ler o Beatport (cruzamento, capas, Discover) e, a menos que você desligue, para enviar relatórios de erro.",
      },
      {
        topic: "O que ele grava",
        other: fact(
          "A rekordcloud diz que o OpenKeyScan “writes results directly into your files for Rekordbox, Serato and Traktor.”",
          REKORDCLOUD,
        ),
        cuepoint:
          "O CuePoint só grava nos seus arquivos quando você escolhe “Write tags to files”, depois de uma prévia, com um registro que permite restaurar cada arquivo. A exportação dele para o Rekordbox é um novo arquivo XML.",
      },
      {
        topic: "Preço",
        other: fact("O OpenKeyScan diz que é “100% free, forever.”", OKS_HOME),
        cuepoint: "O CuePoint é gratuito.",
      },
    ],
    cuepointDoesNot: [
      "Ele não descobre a key a partir do áudio. Um track que o Beatport não tem não recebe key do CuePoint.",
      "Ele não funciona offline para cruzar. Procurar tracks no Beatport precisa de conexão.",
      "Ele funciona só com o Rekordbox, não com Serato nem Traktor.",
    ],
    chooseOther:
      "Se você quer uma key calculada a partir do som de um track e gravada no arquivo para Rekordbox, Serato e Traktor, o OpenKeyScan foi feito para isso, e roda offline.",
    chooseCuePoint:
      "Se você quer a key e os metadados do Beatport conferidos com a sua biblioteca do Rekordbox, com tudo revisável, o CuePoint foi feito para isso. Para um track que o Beatport não tem, você pode digitar a key você mesmo.",
  },
];
