export type SupportedModel = {
  id: string;
  object: 'model';
  owned_by: 'codex-openai-bridge';
  resolved_model: string;
};

export const DIRECT_MODEL_IDS = [
  'gpt-5.4',
  'gpt-5.3-codex',
  'gpt-5.2',
  'gpt-5.2-codex',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex-mini',
] as const;

function createSupportedModel(id: string, resolvedModel: string): SupportedModel {
  return {
    id,
    object: 'model',
    owned_by: 'codex-openai-bridge',
    resolved_model: resolvedModel,
  };
}

export function createModelCatalog(): SupportedModel[] {
  return DIRECT_MODEL_IDS.map((modelId) => createSupportedModel(modelId, modelId));
}

export function findSupportedModel(models: readonly SupportedModel[], id: string): SupportedModel | null {
  return models.find((candidate) => candidate.id === id) ?? null;
}
