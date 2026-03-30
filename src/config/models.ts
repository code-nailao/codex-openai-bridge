export type ModelAlias = {
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

function createModelAlias(id: string, resolvedModel: string): ModelAlias {
  return {
    id,
    object: 'model',
    owned_by: 'codex-openai-bridge',
    resolved_model: resolvedModel,
  };
}

export function createModelCatalog(): ModelAlias[] {
  return DIRECT_MODEL_IDS.map((modelId) => createModelAlias(modelId, modelId));
}

export function findModelAlias(models: readonly ModelAlias[], alias: string): ModelAlias | null {
  return models.find((candidate) => candidate.id === alias) ?? null;
}
