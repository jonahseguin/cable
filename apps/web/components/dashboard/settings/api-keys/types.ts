export interface ApiKeyHookState {
  apiKeyLast6: string | null;
  isLoading: boolean;
  isRegenerating: boolean;
  error: Error | null;
}

export type ApiKeyHookActions = {
  regenerateApiKey: () => Promise<void>;
  setNewApiKey: (key: string | null) => void;
};

export interface ApiKeySection {
  title: string;
  description: string;
}
