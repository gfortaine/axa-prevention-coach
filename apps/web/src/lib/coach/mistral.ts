import { axaSuggestedQuestions } from "./corpus";
import type {
  AgentTraceStep,
  ArchitectureLayer,
  Audience,
  AnswerStatus,
  ChatHistoryMessage,
  ChatRequest,
  ChatResponse,
  PreventionDocument,
  ResponseTelemetry,
  RetrievedDocument,
  RiskAssessment,
  SourceCitation,
} from "./types";

const MISTRAL_API_BASE_URL = "https://api.mistral.ai";
const DEFAULT_TIMEOUT_MS = 120_000;
const GUIDE_DOMAINS = new Set(["securite_routiere", "climat", "miniguide"]);

interface MistralDocumentMetadata {
  document_id: string;
  file_name: string;
  title: string;
  sourceUrl: string;
  citationUrl: string;
  citationUrls?: string[];
  sourcePage?: number | null;
  pageHints?: number[];
  guideDomain?: PreventionDocument["guideDomain"];
  audience: Audience;
  tags: string[];
}

interface MistralReference {
  document_id: string;
  page?: number;
  snippet?: string;
  title?: string;
  sourceUrl?: string;
  reference_ids?: unknown;
}

interface MistralDocumentLibraryResult {
  answer: string;
  sources: RetrievedDocument[];
  citations: SourceCitation[];
  usage: Record<string, unknown>;
}

const mistralDocuments: MistralDocumentMetadata[] = [
  {
    document_id: "43d5e72c-9eaa-488f-857a-cbb000d11fd9",
    file_name: "5186d075-ba22-4361-a267-28e1a9132f9b_livret_AXA_2024_PR_web.pdf",
    title: "Guide De La Prevention Routiere.pdf - vitesse et mortalite",
    sourceUrl:
      "https://coreaxaprevention.cdn.axa-contento-118412.eu/coreaxaprevention/5186d075-ba22-4361-a267-28e1a9132f9b_livret_AXA_2024_PR_web.pdf",
    citationUrl: "/guide/securite_routiere?page=16",
    citationUrls: ["/guide/securite_routiere?page=16", "/guide/securite_routiere?page=20"],
    sourcePage: 16,
    pageHints: [16, 20],
    guideDomain: "securite_routiere",
    audience: "particulier",
    tags: ["securite-routiere", "vitesse", "mortalite", "barometre", "accident", "freinage", "distance-arret", "fatigue"],
  },
  {
    document_id: "5f239617-9997-4329-a70b-33bb9ea6f11a",
    file_name: "5a7d7a05-922d-4de8-a0f7-9348dffc5df4_guide-climat-environnement.pdf",
    title: "Guide Climat et Environnement",
    sourceUrl:
      "https://coreaxaprevention.cdn.axa-contento-118412.eu/coreaxaprevention/5a7d7a05-922d-4de8-a0f7-9348dffc5df4_guide-climat-environnement.pdf",
    citationUrl: "/guide/climat",
    citationUrls: ["/guide/climat"],
    sourcePage: null,
    pageHints: [],
    guideDomain: "climat",
    audience: "mixte",
    tags: ["climat", "environnement", "gaz-effet-serre", "empreinte-carbone"],
  },
  {
    document_id: "551f19c1-505d-4a84-bbad-c975399b3020",
    file_name: "43b57919-5028-42e1-9b90-2312304be754_2000567-12.24+MINI+GUIDE+2024.pdf",
    title: "Bien se proteger face aux evenements naturels",
    sourceUrl:
      "https://coreaxaprevention.cdn.axa-contento-118412.eu/coreaxaprevention/43b57919-5028-42e1-9b90-2312304be754_2000567-12.24+MINI+GUIDE+2024.pdf",
    citationUrl: "/guide/miniguide",
    citationUrls: ["/guide/miniguide"],
    sourcePage: null,
    pageHints: [],
    guideDomain: "miniguide",
    audience: "particulier",
    tags: ["tempete", "inondation", "catastrophe-naturelle", "equipements", "prevention"],
  },
];

export class MistralDocumentLibraryUnavailableError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 503) {
    super(message);
    this.name = "MistralDocumentLibraryUnavailableError";
    this.statusCode = statusCode;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function inferAudience(message: string, requested?: Audience): Audience {
  if (requested === "particulier" || requested === "flotte") {
    return requested;
  }
  const normalized = message.toLowerCase();
  if (["flotte", "entreprise", "manager", "commerciaux"].some((marker) => normalized.includes(marker))) {
    return "flotte";
  }
  if (["jeune", "accident", "je "].some((marker) => normalized.includes(marker))) {
    return "particulier";
  }
  return "mixte";
}

function assessRisk(message: string, audience: Audience): RiskAssessment {
  const normalized = normalizeText(message);
  const signals: RiskAssessment["signals"] = [];
  let score = 12;
  const rules: Array<[string[], string, number, string]> = [
    [["vitesse"], "Vitesse excessive ou inadaptée", 20, "La vitesse augmente distances d'arrêt, pertes de contrôle et gravité."],
    [
      ["pluie", "orage", "mouille", "meteo", "aquaplaning"],
      "Conditions météorologiques dégradées",
      18,
      "La météo dégradée réduit adhérence et visibilité; les distances doivent augmenter.",
    ],
    [["fatigue", "fatiguee", "sommeil", "somnolence", "nuit"], "Fatigue ou somnolence", 24, "La fatigue réduit vigilance, anticipation et temps de réaction."],
    [
      ["telephone", "smartphone", "appel", "message", "sms", "notification"],
      "Distraction téléphone",
      26,
      "La distraction détourne simultanément regard, main et cognition.",
    ],
    [["jeune", "permis", "novice", "apprenti"], "Jeune conducteur", 12, "Le manque d'expérience augmente le besoin de consignes simples et préventives."],
    [
      ["accident", "choc", "rond-point", "constat", "panne", "blesse"],
      "Situation post-accident ou zone non sécurisée",
      22,
      "La première priorité est d'éviter un sur-accident et de qualifier l'urgence.",
    ],
    [
      ["flotte", "entreprise", "manager", "commerciaux", "livraison", "mission"],
      "Exposition flotte professionnelle",
      14,
      "Les objectifs horaires et habitudes d'équipe peuvent renforcer les comportements à risque.",
    ],
  ];

  for (const [keywords, label, impact, evidence] of rules) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      score += impact;
      signals.push({ label, impact, evidence });
    }
  }
  if (audience === "flotte") {
    score += 8;
  }
  const level = score >= 76 ? "critique" : score >= 52 ? "eleve" : score >= 28 ? "modere" : "faible";
  if (!signals.length) {
    signals.push({
      label: "Contexte incomplet",
      impact: audience === "flotte" ? 8 : 4,
      evidence: "Le niveau reste prudent tant que le trajet, l'état du conducteur et l'environnement ne sont pas qualifiés.",
    });
  }
  const headline = {
    faible: "Risque faible: maintenir les bonnes pratiques et surveiller le contexte.",
    modere: "Risque modéré: proposer des actions ciblées et réduire les facteurs aggravants.",
    eleve: "Risque élevé: recommander une action préventive immédiate et mesurable.",
    critique: "Risque critique: conseiller l'arrêt, la mise en sécurité ou l'escalade immédiate.",
  }[level];

  return { score: Math.min(score, 96), level, headline, signals };
}

function isGeneralConversation(message: string) {
  const normalized = normalizeText(message).trim().replace(/[ \t\n\r.!?;:]+$/g, "");
  return new Set(["bonjour", "bonsoir", "salut", "hello", "coucou", "merci", "merci beaucoup", "ca va", "comment ca va", "qui es tu", "que peux tu faire"]).has(
    normalized,
  );
}

function buildInputs(message: string, chatHistory?: ChatHistoryMessage[]) {
  const history = (chatHistory || [])
    .slice(-6)
    .map((item) => `${item.role === "assistant" ? "Assistant" : "Utilisateur"}: ${item.content.slice(0, 800)}`)
    .join("\n");
  if (!history) {
    return message;
  }
  return ["Historique récent (contexte conversationnel, pas une source documentaire):", history, `Question utilisateur: ${message}`].join("\n\n");
}

function metadataKeys(document: MistralDocumentMetadata) {
  return [document.document_id, document.file_name, document.sourceUrl, document.citationUrl, document.title, ...(document.citationUrls || [])].flatMap((value) => [
    value,
    value.toLowerCase(),
  ]);
}

function metadataForReference(reference: MistralReference) {
  const entries = new Map<string, MistralDocumentMetadata>();
  for (const document of mistralDocuments) {
    for (const key of metadataKeys(document)) {
      entries.set(key, document);
    }
  }
  for (const value of [reference.document_id, reference.sourceUrl, reference.title]) {
    if (!value) {
      continue;
    }
    const metadata = entries.get(value) || entries.get(value.toLowerCase());
    if (metadata) {
      return metadata;
    }
  }
  return undefined;
}

function pageFromText(value: string) {
  const match = value.match(/(?:[#?&]page=|page[\s:=_-]+)(\d{1,4})/i);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

function pageFromHints(reference: MistralReference, metadata: MistralDocumentMetadata | undefined, query: string) {
  const pages = (metadata?.pageHints || []).filter((page): page is number => Number.isInteger(page) && page > 0);
  if (!pages.length) {
    return undefined;
  }
  const raw = normalizeText(`${query} ${reference.title || ""} ${reference.snippet || ""}`);
  if ((raw.includes("limiter") || raw.includes("raison")) && raw.includes("vitesse") && pages.includes(20)) {
    return 20;
  }
  if (raw.includes("mortal") && pages.includes(16)) {
    return 16;
  }
  return pages[pages.length - 1];
}

function inferGuideDomain(reference: MistralReference, metadata?: MistralDocumentMetadata): PreventionDocument["guideDomain"] | undefined {
  if (metadata?.guideDomain && GUIDE_DOMAINS.has(metadata.guideDomain)) {
    return metadata.guideDomain;
  }
  const raw = normalizeText([reference.title, reference.snippet, reference.sourceUrl].filter(Boolean).join(" "));
  if (raw.includes("climat") || raw.includes("environnement") || raw.includes("carbone")) {
    return "climat";
  }
  if (raw.includes("mini") || raw.includes("naturel") || raw.includes("tempete") || raw.includes("inondation")) {
    return "miniguide";
  }
  if (raw.includes("route") || raw.includes("routiere") || raw.includes("vitesse") || raw.includes("livret")) {
    return "securite_routiere";
  }
  return undefined;
}

function internalGuideUrl(guideDomain: PreventionDocument["guideDomain"] | undefined, page?: number) {
  if (!guideDomain || !GUIDE_DOMAINS.has(guideDomain)) {
    return "";
  }
  return page ? `/guide/${guideDomain}?page=${page}` : `/guide/${guideDomain}`;
}

function sourceFromReference(reference: MistralReference, index: number, query: string): RetrievedDocument {
  const metadata = metadataForReference(reference);
  const guideDomain = inferGuideDomain(reference, metadata);
  const page =
    reference.page ||
    pageFromHints(reference, metadata, query) ||
    (typeof metadata?.sourcePage === "number" ? metadata.sourcePage : undefined) ||
    pageFromText(metadata?.citationUrl || "");
  const citationUrl = internalGuideUrl(guideDomain, page) || metadata?.citationUrl || internalGuideUrl(guideDomain, undefined) || metadata?.sourceUrl || reference.sourceUrl || "#";
  const documentId = reference.document_id || `mistral-document-${index + 1}`;

  return {
    id: documentId,
    title: metadata?.title || reference.title || "Document Mistral",
    content: reference.snippet || "",
    excerpt: reference.snippet || "",
    score: 1,
    sourceUrl: metadata?.sourceUrl || reference.sourceUrl || "#",
    citationUrl,
    sourcePage: page,
    guideDomain,
    sourceType: "public",
    audience: metadata?.audience || "mixte",
    tags: metadata?.tags || ["mistral-document-library"],
  };
}

function citationFromSource(source: RetrievedDocument, index: number): SourceCitation {
  const pageSuffix = source.sourcePage ? `, page ${source.sourcePage}` : "";
  return {
    id: `${source.id}-${index + 1}`,
    label: `[${index + 1}]`,
    title: `${source.title}${pageSuffix}`,
    sourceUrl: source.citationUrl || source.sourceUrl,
    page: source.sourcePage,
    guideDomain: source.guideDomain,
    sourceId: source.id,
  };
}

function referenceFromChunk(chunk: Record<string, unknown>): MistralReference {
  const url = typeof chunk.url === "string" ? chunk.url : typeof chunk.source_url === "string" ? chunk.source_url : typeof chunk.sourceUrl === "string" ? chunk.sourceUrl : undefined;
  const title = typeof chunk.title === "string" ? chunk.title : typeof chunk.document_name === "string" ? chunk.document_name : typeof chunk.documentName === "string" ? chunk.documentName : undefined;
  const snippet = typeof chunk.description === "string" ? chunk.description : typeof chunk.snippet === "string" ? chunk.snippet : typeof chunk.text === "string" ? chunk.text : "";
  return {
    document_id:
      (typeof chunk.document_id === "string" && chunk.document_id) ||
      (typeof chunk.documentId === "string" && chunk.documentId) ||
      url ||
      title ||
      "mistral-document",
    page: (typeof chunk.page === "number" && chunk.page) || pageFromText(url || "") || pageFromText(snippet),
    snippet,
    title,
    sourceUrl: url,
    reference_ids: chunk.reference_ids || chunk.referenceIds,
  };
}

function normalizeAnswer(answer: string) {
  return answer.replace(/\n+(?:#{1,6}\s*)?(?:sources(?:\s+principales)?|references|références)\s*:?\s*[\s\S]*$/i, "").trim();
}

function parseMistralDocumentResponse(payload: unknown, query: string): MistralDocumentLibraryResult {
  if (!isRecord(payload) || !Array.isArray(payload.outputs)) {
    throw new MistralDocumentLibraryUnavailableError("Mistral Conversations response does not contain outputs.");
  }

  const answerParts: string[] = [];
  const references: MistralReference[] = [];
  for (const output of payload.outputs) {
    if (!isRecord(output) || output.type !== "message.output") {
      continue;
    }
    if (typeof output.content === "string") {
      answerParts.push(output.content);
      continue;
    }
    if (!Array.isArray(output.content)) {
      continue;
    }
    for (const chunk of output.content) {
      if (!isRecord(chunk)) {
        continue;
      }
      if (chunk.type === "tool_reference" || chunk.type === "reference") {
        references.push(referenceFromChunk(chunk));
        answerParts.push(`[${references.length}]`);
      } else if (typeof chunk.text === "string") {
        answerParts.push(chunk.text);
      }
    }
  }

  const dedupedReferences = references.filter((reference, index, all) => {
    const current = metadataForReference(reference);
    const currentPage = reference.page || pageFromHints(reference, current, query) || current?.sourcePage;
    return (
      all.findIndex((candidate) => {
        const candidateMetadata = metadataForReference(candidate);
        const candidatePage = candidate.page || pageFromHints(candidate, candidateMetadata, query) || candidateMetadata?.sourcePage;
        return (candidate.document_id || candidateMetadata?.document_id) === (reference.document_id || current?.document_id) && candidatePage === currentPage;
      }) === index
    );
  });
  const sources = dedupedReferences.map((reference, index) => sourceFromReference(reference, index, query));
  return {
    answer: normalizeAnswer(answerParts.join("")),
    sources,
    citations: sources.map(citationFromSource),
    usage: isRecord(payload.usage) ? payload.usage : {},
  };
}

async function queryMistralDocumentLibrary(message: string, chatHistory?: ChatHistoryMessage[]): Promise<MistralDocumentLibraryResult> {
  const apiKey = process.env.MISTRAL_API_KEY;
  const agentId = process.env.MISTRAL_AGENT_ID;
  if (!apiKey || !agentId) {
    throw new MistralDocumentLibraryUnavailableError("MISTRAL_API_KEY and MISTRAL_AGENT_ID are required for Mistral Document Library RAG.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.MISTRAL_CONVERSATION_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));
  let response: Response;
  try {
    response = await fetch(`${process.env.MISTRAL_API_BASE_URL || MISTRAL_API_BASE_URL}/v1/conversations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        agent_id: agentId,
        inputs: buildInputs(message, chatHistory),
        store: false,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error.";
    throw new MistralDocumentLibraryUnavailableError(`Mistral Document Library request failed: ${message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new MistralDocumentLibraryUnavailableError(`Mistral Document Library returned ${response.status}: ${body.slice(0, 180)}`, response.status);
  }

  return parseMistralDocumentResponse(await response.json(), message);
}

function telemetry(message: string, answer: string, startedAt: number, sourceCount: number, usage: Record<string, unknown>): ResponseTelemetry {
  const inputTokens = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : Math.ceil(message.length / 4) + sourceCount * 140;
  const outputTokens = typeof usage.completion_tokens === "number" ? usage.completion_tokens : Math.ceil(answer.length / 4);
  const totalTokens = typeof usage.total_tokens === "number" ? usage.total_tokens : inputTokens + outputTokens;
  return {
    total_tokens: totalTokens,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    embedding_tokens: Math.ceil(message.length / 4),
    co2_emissions: Number((totalTokens * 0.00231).toFixed(6)),
    cost: Number((inputTokens * 0.00000015 + outputTokens * 0.0000006).toFixed(8)),
    response_time: Number(((Date.now() - startedAt) / 1000).toFixed(3)),
  };
}

function unavailableResult(message: string, audience: Audience, startedAt: number, warning: string): ChatResponse {
  const answer = isGeneralConversation(message)
    ? "Bonjour, je suis l'assistant prévention AXA. Je peux vous aider sur la prévention routière, le climat ou les événements naturels."
    : "Je ne peux pas répondre de façon documentaire fiable pour l'instant: Mistral Document Library n'est pas configuré ou n'a pas retourné de source exploitable.";
  return buildResponse({
    message,
    answer,
    audience,
    generationMode: "retrieval-unavailable",
    sources: [],
    citations: [],
    usage: {},
    startedAt,
    retrievalIsCloud: false,
    warning,
  });
}

function buildTrace(args: { audience: Audience; risk: RiskAssessment; retrievalIsCloud: boolean; generationMode: ChatResponse["generationMode"]; warning?: string }): AgentTraceStep[] {
  return [
    {
      agent: "Mistral Enterprise BFF",
      status: "done",
      summary: "Intent, audience et contrat qualifiés",
      detail: `Audience détectée: ${args.audience}.`,
    },
    {
      agent: "Mistral Agent Document Library",
      status: args.retrievalIsCloud ? "done" : "warning",
      summary: "Mistral Document Library",
      detail: args.warning || "RAG PDF managé par Mistral Agent document_library.",
    },
    {
      agent: "Policy risk scorer",
      status: "done",
      summary: `Risque ${args.risk.level}`,
      detail: args.risk.signals.map((signal) => signal.label).join(", ") || "Aucun facteur critique détecté.",
    },
    {
      agent: "Mistral grounded generation",
      status: args.generationMode === "retrieval-unavailable" ? "warning" : "done",
      summary: args.generationMode,
      detail: args.warning || "Génération Mistral source-grounded avec citations.",
    },
  ];
}

function architecture(retrievalIsCloud: boolean): ArchitectureLayer[] {
  return [
    { name: "Next.js BFF", status: "active", detail: "Contrat web propriétaire, sans LangGraph Agent Server." },
    { name: "Mistral Agent", status: "active", detail: "Assistant RAG documentaire appelé directement côté serveur." },
    {
      name: "Mistral Document Library",
      status: retrievalIsCloud ? "active" : "ready",
      detail: "Vector store managé Mistral pour les guides PDF AXA Prévention.",
    },
    { name: "Mistral Enterprise target", status: "ready", detail: "Workflows, Observability, Judges, Datasets et AI Registry comme cible souveraine." },
  ];
}

function buildResponse(args: {
  message: string;
  answer: string;
  audience: Audience;
  generationMode: ChatResponse["generationMode"];
  sources: RetrievedDocument[];
  citations: SourceCitation[];
  usage: Record<string, unknown>;
  startedAt: number;
  retrievalIsCloud: boolean;
  warning?: string;
}): ChatResponse {
  const risk = assessRisk(args.message, args.audience);
  const status: AnswerStatus = args.generationMode === "mistral-document-library" ? "grounded" : "unavailable";
  const retrieval = {
    kind: "mistral-document-library" as const,
    label: "Mistral Document Library",
    isCloud: args.retrievalIsCloud,
    warning: args.warning,
  };

  return {
    id: crypto.randomUUID(),
    answer: args.answer,
    status,
    grounding: {
      required: true,
      status,
      sourceCount: args.citations.length,
    },
    diagnostics: {
      generation: {
        backend: "mistral-agent",
        mode: args.generationMode,
      },
      retrieval: {
        backend: retrieval.kind,
        label: retrieval.label,
        isCloud: retrieval.isCloud,
        warning: retrieval.warning,
      },
    },
    generationMode: args.generationMode,
    retrieval,
    risk,
    sources: args.sources,
    citations: args.citations,
    telemetry: telemetry(args.message, args.answer, args.startedAt, args.sources.length, args.usage),
    trace: buildTrace({ audience: args.audience, risk, retrievalIsCloud: args.retrievalIsCloud, generationMode: args.generationMode, warning: args.warning }),
    architecture: architecture(args.retrievalIsCloud),
    suggestedQuestions: [...axaSuggestedQuestions],
  };
}

export async function runMistralPreventionAgent(request: ChatRequest): Promise<ChatResponse> {
  const message = request.message.trim();
  const startedAt = Date.now();
  const audience = inferAudience(message, request.audience);

  if (isGeneralConversation(message)) {
    return unavailableResult(message, audience, startedAt, "");
  }

  try {
    const result = await queryMistralDocumentLibrary(message, request.chatHistory);
    if (!result.answer || !result.citations.length) {
      return unavailableResult(message, audience, startedAt, "Mistral Document Library n'a pas retourné de citation exploitable.");
    }
    return buildResponse({
      message,
      answer: result.answer,
      audience,
      generationMode: "mistral-document-library",
      sources: result.sources,
      citations: result.citations,
      usage: result.usage,
      startedAt,
      retrievalIsCloud: true,
    });
  } catch (error) {
    const warning = error instanceof Error ? error.message : "Mistral Document Library unavailable.";
    return unavailableResult(message, audience, startedAt, warning);
  }
}
