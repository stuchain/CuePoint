import { APP_SHOTS as EN_APP_SHOTS, TRUST as EN_TRUST, type Hero, type AppShotDef, type AppShotId, type Feature, type OpeningStep, type TrustClaim } from "../../home";
import { featureHref } from "../../features";

/**
 * A página inicial em português do Brasil (DEC-311). Os mesmos fatos do inglês, tratamento por "você", as
 * palavras de docs/translation.md ficam em inglês. A estrutura e os campos que não são texto são conferidos
 * por src/i18n/parity.test.ts.
 */

export const OPENING_STEPS: readonly OpeningStep[] = [
  {
    id: "messy",
    title: "Uma biblioteca bagunçada",
    text: "Anos de tracks, e as keys, os BPM e os gêneros não batem. Em alguns falta informação, em outros ela está errada.",
  },
  {
    id: "matched",
    title: "Cruzada com o Beatport",
    text: "O CuePoint procura cada track no Beatport e traz de volta a key dele, além de oferecer o BPM e o gênero. Ele aceita sozinho os resultados de que tem certeza e deixa o resto para você revisar.",
  },
  {
    id: "ready",
    title: "Organizada e pronta para a cabine",
    text: "Seus tracks se alinham na roda Camelot, ordenados por key, e voltam para o Rekordbox como um arquivo novo. As suas correções têm prioridade.",
  },
];

type ShotText = Pick<AppShotDef, "label" | "alt">;
const shot = (id: AppShotId, text: ShotText): AppShotDef => ({ ...EN_APP_SHOTS[id], ...text });

export const APP_SHOTS: Readonly<Record<AppShotId, AppShotDef>> = {
  window: shot("window", {
    label: "A janela do CuePoint",
    alt: "A janela do CuePoint com uma biblioteca de tracks, com a roda Camelot aberta na key do track que está tocando, acesa nas keys que combinam com ele.",
  }),
  clean: shot("clean", {
    label: "Clean",
    alt: "A área Match da página Clean: os tracks que um cruzamento com o Beatport deixou para conferir, cada um ao lado do que o Beatport encontrou para ele.",
  }),
  "clean-compare": shot("clean-compare", {
    label: "Clean: um de cada vez",
    alt: "O painel “Check the match” do Clean: um track da biblioteca ao lado dos candidatos que o Beatport encontrou, com “Use this match” e “None of these”.",
  }),
  library: shot("library", {
    label: "The Library",
    alt: "A página Library: a tabela de tracks com as Collections e as playlists ao lado, e um track selecionado com as ações dele acima da tabela.",
  }),
  keys: shot("keys", {
    label: "Keys",
    alt: "A página Keys: as keys de três playlists contadas na roda Camelot, com a key que tem mais tracks selecionada.",
  }),
  discover: shot("discover", {
    label: "Discover",
    alt: "A página Discover depois de uma busca: tracks novos achados em um chart do Beatport, de artistas da biblioteca, com seus artistas e labels.",
  }),
  prepare: shot("prepare", {
    label: "Prepare",
    alt: "A página Prepare: um Set como ordem de execução em capítulos, com as verificações entre os tracks e a faixa de transição aberta em uma delas.",
  }),
  statistics: shot("statistics", {
    label: "Statistics",
    alt: "O Overview da página Statistics: como a biblioteca inteira se distribui por gênero, label e artista, com a contagem em cada barra.",
  }),
  waveforms: shot("waveforms", {
    label: "Waveforms e o player",
    alt: "A barra do player com a waveform de um track em pausa, e o Track details mostrando a waveform do track inteiro, com os cue points listados embaixo.",
  }),
  export: shot("export", {
    label: "Export to Rekordbox",
    alt: "A janela “Export to Rekordbox”: quantos tracks e playlists o novo arquivo do Rekordbox vai ter e o que entra nele, antes de qualquer coisa ser gravada.",
  }),
};

const more = (slug: string) => ({ label: "Saiba mais", path: featureHref(slug) });

export const FEATURES: readonly Feature[] = [
  {
    id: "clean",
    name: "Clean",
    text: "Cruze uma playlist ou a sua biblioteca inteira com o Beatport e revise só os resultados de que o CuePoint não tem certeza.",
    learnMore: more("clean"),
  },
  {
    id: "library",
    name: "The Library",
    text: "Pesquise a sua coleção inteira e filtre por key, BPM ou gênero, com a key do Beatport em cada track cruzado.",
    learnMore: more("library"),
  },
  {
    id: "discover",
    name: "Discover",
    text: "Encontre música nova no Beatport a partir dos artistas e labels que já estão na sua biblioteca.",
    learnMore: more("discover"),
  },
  {
    id: "prepare",
    name: "Prepare",
    text: "Planeje um set como ordem de execução, e o CuePoint avisa quando há um choque de keys ou um BPM que não encaixa.",
    learnMore: more("prepare"),
  },
  {
    id: "export",
    name: "Export to Rekordbox",
    text: "Grave suas keys, BPM e gêneros em um novo arquivo XML do Rekordbox, e o arquivo que você importou nunca é alterado.",
    learnMore: more("export"),
  },
];

type TrustText = Pick<TrustClaim, "id" | "title" | "text">;
const TRUST_TEXT: readonly TrustText[] = [
  { id: "free", title: "Gratuito", text: "Gratuito para baixar e para usar." },
  {
    id: "local",
    title: "Roda no seu computador",
    text: "Sua biblioteca fica no seu computador. O CuePoint só vai à internet para procurar tracks no Beatport quando você pede, para perguntar ao GitHub se há uma versão nova e para enviar relatórios de erro sem os seus nomes, o que você pode desligar.",
  },
  {
    id: "yours",
    title: "Sua biblioteca continua sua",
    text: "O CuePoint nunca apaga nem move os seus arquivos de música, e antes de gravar tags ou exportar ele mostra uma prévia: nada acontece até você confirmar.",
  },
  { id: "open", title: "Open Source", text: "O código é público no GitHub, sob a licença Apache 2.0." },
  {
    id: "rekordbox",
    title: "Feito para o Rekordbox",
    text: "Ele lê a coleção que você exporta do Rekordbox como XML e grava de volta um novo arquivo XML para o Rekordbox importar.",
  },
];

export const TRUST: readonly TrustClaim[] = TRUST_TEXT.map((t) => ({
  ...t,
  evidence: EN_TRUST.find((e) => e.id === t.id)!.evidence,
}));

export const HERO = {
  heading: "Sua biblioteca do Rekordbox, arrumada e pronta para a cabine",
  lead: "O CuePoint é um app gratuito para desktop, feito para DJs. Ele cruza seus tracks com o Beatport, preenche as keys e os BPM que faltam ou estão errados e manda o resultado de volta para o Rekordbox.",
  title: "CuePoint: arrume sua biblioteca do Rekordbox",
  description:
    "CuePoint, app gratuito para DJs: cruze sua biblioteca do Rekordbox com o Beatport, corrija keys e BPM, veja suas keys na roda Camelot e planeje sets.",
} as const satisfies Hero;
