export type ModelAlias = {
  id: string;
  object: 'model';
  owned_by: 'codex-openai-bridge';
  resolved_model: string | null;
};

export function createModelCatalog(codexModel: string): ModelAlias[] {
  return [
    {
      id: 'gpt-5',
      object: 'model',
      owned_by: 'codex-openai-bridge',
      resolved_model: null,
    },
    {
      id: 'codex',
      object: 'model',
      owned_by: 'codex-openai-bridge',
      resolved_model: codexModel,
    },
  ];
}
