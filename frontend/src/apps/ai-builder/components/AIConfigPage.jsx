import { AIConfigForm } from "./AIConfigForm";

export function AIConfigPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">AI Settings</h2>
        <p className="text-sm text-muted-foreground">
          Configure the AI provider for the AI App Builder feature. Supports OpenAI, Anthropic, and self-hosted Ollama.
        </p>
      </div>
      <AIConfigForm />
    </div>
  );
}
