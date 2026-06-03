import { getScenarioPrompt } from "./corpus";
import { runMistralPreventionAgent } from "./mistral";
import type { ChatRequest, ChatResponse } from "./types";

export async function runPreventionGraph(request: ChatRequest): Promise<ChatResponse> {
  const scenarioPrompt = getScenarioPrompt(request.scenarioId);
  const message = (request.message || scenarioPrompt || "").trim();
  if (!message) {
    throw new Error("A message or scenarioId is required.");
  }

  return runMistralPreventionAgent({ ...request, message });
}
