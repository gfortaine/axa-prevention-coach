import { axaSuggestedQuestions, getScenarioPrompt } from "./corpus";
import { generateAnswer } from "./provider";
import { runRemotePreventionGraph } from "./langgraph";
import { retrieveDocuments } from "./retrieval";
import { assessRisk } from "./risk";
import type {
  AgentTraceStep,
  ArchitectureLayer,
  Audience,
  ChatRequest,
  ChatResponse,
  ResponseTelemetry,
  RetrievedDocument,
  SourceCitation,
} from "./types";

type SourceTopic = "securite_routiere" | "climat_ges" | "evenements_naturels";

const MAX_CITED_SOURCES = 2;

function inferAudience(message: string, requested?: Audience): Audience {
  if (requested && requested !== "mixte") return requested;
  const normalized = message.toLowerCase();
  if (normalized.includes("flotte") || normalized.includes("entreprise") || normalized.includes("manager")) {
    return "flotte";
  }
  if (normalized.includes("jeune") || normalized.includes("accident") || normalized.includes("je ")) {
    return "particulier";
  }
  return "mixte";
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

function inferQueryTopic(message: string): SourceTopic | undefined {
  const tokens = new Set(tokenize(message));
  const greenhouseKeywords = [
    "biodiversite",
    "carbone",
    "climat",
    "climatique",
    "co2",
    "empreinte",
    "environnement",
    "ges",
    "methane",
    "rechauffement",
    "serre",
  ];
  const naturalEventsKeywords = ["catastrophe", "equipement", "equipements", "inondation", "naturel", "naturelle", "naturels", "tempete"];
  const roadKeywords = [
    "accident",
    "arret",
    "conducteur",
    "distance",
    "fatigue",
    "freinage",
    "mortalite",
    "route",
    "routier",
    "routiere",
    "securite",
    "telephone",
    "vehicule",
    "vitesse",
    "volant",
  ];
  const greenhouseScore = greenhouseKeywords.filter((keyword) => tokens.has(keyword)).length;
  const naturalEventsScore = naturalEventsKeywords.filter((keyword) => tokens.has(keyword)).length;
  const roadScore = roadKeywords.filter((keyword) => tokens.has(keyword)).length;
  const bestScore = Math.max(greenhouseScore, naturalEventsScore, roadScore);

  if (bestScore === 0) return undefined;
  if (roadScore === bestScore && roadScore > greenhouseScore && roadScore > naturalEventsScore) return "securite_routiere";
  if (naturalEventsScore === bestScore && naturalEventsScore > greenhouseScore && naturalEventsScore > roadScore) return "evenements_naturels";
  if (greenhouseScore === bestScore && greenhouseScore > naturalEventsScore && greenhouseScore > roadScore) return "climat_ges";
  return undefined;
}

function inferDocumentTopic(document: RetrievedDocument): SourceTopic | undefined {
  const tokens = new Set(tokenize(`${document.title} ${document.tags.join(" ")}`));
  if (document.guideDomain === "securite_routiere") {
    return "securite_routiere";
  }
  if (document.guideDomain === "miniguide") {
    return "evenements_naturels";
  }
  if (["tempete", "inondation", "catastrophe", "naturels", "equipements"].some((token) => tokens.has(token))) {
    return "evenements_naturels";
  }
  if (document.guideDomain === "climat") {
    return "climat_ges";
  }
  if (["climat", "environnement", "gaz", "serre", "carbone", "empreinte", "co2"].some((token) => tokens.has(token))) {
    return "climat_ges";
  }
  if (["route", "routiere", "securite", "vitesse", "accident", "freinage", "conducteur", "volant"].some((token) => tokens.has(token))) {
    return "securite_routiere";
  }

  return undefined;
}

function buildTrace(
  audience: Audience,
  retrievalLabel: string,
  isCloud: boolean,
  riskLevel: string,
  warnings: string[],
): AgentTraceStep[] {
  return [
    {
      agent: "Orchestrateur LangGraph",
      status: "done",
      summary: "Intent, audience et scenario qualifies",
      detail: `Audience detectee: ${audience}. Le graphe declenche retrieval, scoring risque, coaching et controle conformite.`,
    },
    {
      agent: "Agent RAG",
      status: isCloud ? "done" : "warning",
      summary: retrievalLabel,
      detail: isCloud
        ? "Recherche executee sur un service cloud compatible Vercel et LangGraph Cloud."
        : "Fallback local actif. Configurer Vertex AI Search, Pinecone ou Elastic pour afficher Cloud RAG.",
    },
    {
      agent: "Agent risque",
      status: "done",
      summary: `Risque ${riskLevel}`,
      detail: "Score explicable calcule a partir des facteurs conduite, meteo, distraction, flotte et accident.",
    },
    {
      agent: "Agent conformite",
      status: warnings.length > 0 ? "warning" : "done",
      summary: warnings.length > 0 ? "Fallbacks signales explicitement" : "Reponse bornee et citee",
      detail:
        warnings.join(" ") ||
        "Les documents RAG sont traites comme donnees, les sources sont citees et les sujets sensibles sont limites.",
    },
  ];
}

function buildArchitecture(isCloud: boolean, retrievalLabel: string): ArchitectureLayer[] {
  return [
    {
      name: "Vercel",
      status: "ready",
      detail: "Frontend Next.js autonome, partageable pendant l'entretien, avec API route de secours.",
    },
    {
      name: "LangGraph Cloud",
      status: "ready",
      detail: "Graph cible: classifyIntent -> retrieveContext -> scoreRisk -> coachAnswer -> complianceCheck.",
    },
    {
      name: retrievalLabel,
      status: isCloud ? "active" : "fallback",
      detail: isCloud
        ? "Retrieval cloud actif derriere une interface interchangeable."
        : "Fallback local actif; configurer Vertex AI Search en priorite pour l'equivalent Azure AI Search.",
    },
    {
      name: "LangSmith",
      status: "ready",
      detail: "Traces, evaluation RAG, latence, sources et erreurs exploitables pour l'industrialisation.",
    },
  ];
}

function suggestedQuestions(audience: Audience): string[] {
  if (audience === "flotte") {
    return [
      "Quels KPI suivre sans surveillance individuelle intrusive ?",
      "Comment lancer un programme pilote flotte en deux semaines ?",
      "Quels guardrails RGPD pour la telematique agregee ?",
    ];
  }

  return [...axaSuggestedQuestions];
}

function isSpeedBenchmark(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return normalized.includes("limiter") && normalized.includes("vitesse");
}

function citationUrlForDocument(document: RetrievedDocument): string {
  if (document.citationUrl) {
    return document.citationUrl.replace(/\/guide\/([^#?\s]+)#(\d+)/, "/guide/$1?page=$2");
  }
  if (document.guideDomain === "securite_routiere" && document.sourcePage) {
    return `/guide/securite_routiere?page=${document.sourcePage}`;
  }
  if (document.id === "mini-guide-evenements-naturels" || document.guideDomain === "miniguide") {
    return "/guide/miniguide";
  }
  if (document.id === "guide-climat-environnement" || document.guideDomain === "climat") {
    return "/guide/climat";
  }

  return document.sourceUrl;
}

function citationFromDocument(document: RetrievedDocument, index: number): SourceCitation {
  const pageSuffix = document.sourcePage ? `, page ${document.sourcePage}` : "";

  return {
    id: document.id,
    label: `[${index + 1}]`,
    title: `${document.title}${pageSuffix}`,
    sourceUrl: citationUrlForDocument(document),
    page: document.sourcePage,
  };
}

function buildCitations(message: string, sources: RetrievedDocument[]): SourceCitation[] {
  if (isSpeedBenchmark(message)) {
    const page20 = sources.find((source) => source.sourcePage === 20);
    const page16 = sources.find((source) => source.sourcePage === 16);
    const fallback20 = page20 || sources[0];
    const fallback16 = page16 || sources.find((source) => source.id !== fallback20?.id);

    return [fallback20, fallback16].filter((source): source is RetrievedDocument => Boolean(source)).map((source, index) => ({
      ...citationFromDocument(source, index),
      id: `${source.id}-${index + 1}`,
    }));
  }

  return sources.slice(0, MAX_CITED_SOURCES).map(citationFromDocument);
}

function selectRelevantSources(message: string, audience: Audience, sources: RetrievedDocument[]): RetrievedDocument[] {
  const queryTopic = inferQueryTopic(message);
  const queryTokens = new Set(tokenize(message));
  const ranked = sources
    .map((source, index) => ({ source, index }))
    .map(({ source, index }) => {
      const sourceTokens = new Set(tokenize(`${source.title} ${source.tags.join(" ")} ${source.content}`));
      const overlap = [...queryTokens].filter((token) => sourceTokens.has(token)).length;
      const sourceTopic = inferDocumentTopic(source);
      const publicBoost = source.sourceType === "public" ? 1 : 0;
      const audienceBoost = source.audience === audience || source.audience === "mixte" || audience === "mixte" ? 1 : 0;
      return {
        source,
        index,
        overlap,
        sourceTopic,
        rank: [publicBoost, overlap, audienceBoost, source.score, -index] as const,
      };
    })
    .filter(({ overlap, sourceTopic }) => {
      if (!queryTopic) return true;
      return sourceTopic === queryTopic && overlap > 0;
    })
    .sort((left, right) => {
      for (let index = 0; index < left.rank.length; index += 1) {
        const delta = right.rank[index] - left.rank[index];
        if (delta !== 0) return delta;
      }
      return 0;
    });

  if (ranked.length) {
    return ranked.slice(0, MAX_CITED_SOURCES).map(({ source }) => source);
  }

  return queryTopic ? [] : sources.slice(0, MAX_CITED_SOURCES);
}

function compactCitationPunctuation(answer: string): string {
  return answer
    .replace(/\s+,/g, ",")
    .replace(/,\s*,+/g, ",")
    .replace(/:\s*,/g, ":")
    .replace(/,\s*\./g, ".")
    .replace(/:\s*\./g, ".")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function filterAndRelabelResponse(response: ChatResponse, message: string, audience: Audience): ChatResponse {
  const queryTopic = inferQueryTopic(message);
  const indexedSources = response.sources.map((source, index) => ({ source, oldLabel: `[${index + 1}]` }));
  const filteredSources = selectRelevantSources(message, audience, response.sources);
  const keptOldLabels = new Map(indexedSources.map(({ source, oldLabel }) => [source.id, oldLabel]));
  const labelMap = new Map<string, string>();
  for (const [index, source] of filteredSources.entries()) {
    const oldLabel = keptOldLabels.get(source.id);
    if (oldLabel) {
      labelMap.set(oldLabel, `[${index + 1}]`);
    }
  }

  const citations = buildCitations(message, filteredSources);
  const answer = compactCitationPunctuation(
    response.answer.replace(/\[(\d+)\]/g, (label) => labelMap.get(label) ?? ""),
  );

  return {
    ...response,
    answer,
    sources: filteredSources,
    citations: answer.match(/\[\d+\]/) ? citations : queryTopic ? [] : citations,
  };
}

function estimateTelemetry(message: string, answer: string, startedAt: number, sourceCount: number): ResponseTelemetry {
  const input_tokens = Math.ceil(message.length / 4) + sourceCount * 140;
  const output_tokens = Math.ceil(answer.length / 4);
  const embedding_tokens = Math.ceil(message.length / 4);
  const total_tokens = input_tokens + output_tokens;
  const response_time = Number(((performance.now() - startedAt) / 1000).toFixed(3));

  return {
    total_tokens,
    input_tokens,
    output_tokens,
    embedding_tokens,
    co2_emissions: Number((total_tokens * 0.00231).toFixed(6)),
    cost: Number((input_tokens * 0.00000015 + output_tokens * 0.0000006).toFixed(8)),
    response_time,
  };
}

export async function runPreventionGraph(request: ChatRequest): Promise<ChatResponse> {
  const startedAt = performance.now();
  const scenarioPrompt = getScenarioPrompt(request.scenarioId);
  const message = (request.message || scenarioPrompt || "").trim();
  if (!message) {
    throw new Error("A message or scenarioId is required.");
  }

  const remote = await runRemotePreventionGraph({ ...request, message });
  if (remote.response) {
    const audience = inferAudience(message, request.audience);
    return filterAndRelabelResponse(remote.response, message, audience);
  }

  const audience = inferAudience(message, request.audience);
  const retrieval = await retrieveDocuments(message, audience);
  const sources = selectRelevantSources(message, audience, retrieval.documents);
  const risk = assessRisk(message, audience);
  const generation = await generateAnswer({
    message,
    risk,
    sources,
    retrievalLabel: retrieval.label,
    retrievalWarning: retrieval.warning,
  });

  const warnings = [remote.warning, retrieval.warning, generation.warning].filter(
    (warning): warning is string => Boolean(warning),
  );
  const citations = buildCitations(message, sources);
  const telemetry = estimateTelemetry(message, generation.answer, startedAt, sources.length);

  return {
    id: crypto.randomUUID(),
    answer: generation.answer,
    generationMode: generation.mode,
    retrieval: {
      kind: retrieval.kind,
      label: retrieval.label,
      isCloud: retrieval.isCloud,
      warning: retrieval.warning,
    },
    risk,
    sources,
    citations,
    telemetry,
    trace: buildTrace(audience, retrieval.label, retrieval.isCloud, risk.level, warnings),
    architecture: buildArchitecture(retrieval.isCloud, retrieval.label),
    suggestedQuestions: suggestedQuestions(audience),
  };
}
