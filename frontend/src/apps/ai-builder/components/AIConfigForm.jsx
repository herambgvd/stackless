import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { aiApi } from "../api/ai.api";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/shared/components/ui/form";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Loader2, Bot } from "lucide-react";

const MODELS = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  anthropic: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  ollama: ["llama3.2", "llama3.1", "mistral", "gemma3", "phi4", "qwen2.5"],
};

const schema = z.object({
  provider: z.enum(["openai", "anthropic", "ollama"]),
  model_name: z.string().min(1, "Model name is required"),
  api_key: z.string().optional(),
  ollama_base_url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

export function AIConfigForm() {
  const qc = useQueryClient();

  const { data: existing, isLoading } = useQuery({
    queryKey: ["ai-config"],
    queryFn: aiApi.getConfig,
    retry: false, // 404 means not configured
  });

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      provider: existing?.provider ?? "openai",
      model_name: existing?.model_name ?? "gpt-4o",
      api_key: "",
      ollama_base_url: existing?.ollama_base_url ?? "http://localhost:11434",
    },
    values: existing ? {
      provider: existing.provider,
      model_name: existing.model_name,
      api_key: "",
      ollama_base_url: existing.ollama_base_url ?? "http://localhost:11434",
    } : undefined,
  });

  const provider = form.watch("provider");

  const mutation = useMutation({
    mutationFn: (data) => aiApi.saveConfig(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-config"] });
      toast.success("AI configuration saved.");
      form.setValue("api_key", "");
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = (values) => {
    const payload = {
      provider: values.provider,
      model_name: values.model_name,
    };
    if (values.provider !== "ollama" && values.api_key) {
      payload.api_key = values.api_key;
    }
    if (values.provider === "ollama") {
      payload.ollama_base_url = values.ollama_base_url || "http://localhost:11434";
    }
    mutation.mutate(payload);
  };

  if (isLoading) return null;

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" /> AI Provider Configuration
        </CardTitle>
        <CardDescription>
          Configure the LLM provider and model used for the AI App Builder.
          API keys are encrypted at rest and never exposed in the UI.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

            <FormField control={form.control} name="provider" render={({ field }) => (
              <FormItem>
                <FormLabel>Provider</FormLabel>
                <Select onValueChange={(v) => {
                  field.onChange(v);
                  form.setValue("model_name", MODELS[v][0]);
                }} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                    <SelectItem value="ollama">Ollama (self-hosted)</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />

            <FormField control={form.control} name="model_name" render={({ field }) => (
              <FormItem>
                <FormLabel>Model</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {MODELS[provider].map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  You can also type a custom model name directly below.
                </FormDescription>
                <FormControl>
                  <Input placeholder="Or type custom model name…" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {provider !== "ollama" && (
              <FormField control={form.control} name="api_key" render={({ field }) => (
                <FormItem>
                  <FormLabel>API Key</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={existing?.has_api_key ? "Leave blank to keep existing key" : "Enter your API key"}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {existing?.has_api_key
                      ? "A key is already saved. Enter a new one only to replace it."
                      : `Get your API key from the ${provider === "openai" ? "OpenAI" : "Anthropic"} dashboard.`
                    }
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            {provider === "ollama" && (
              <FormField control={form.control} name="ollama_base_url" render={({ field }) => (
                <FormItem>
                  <FormLabel>Ollama Base URL</FormLabel>
                  <FormControl>
                    <Input placeholder="http://localhost:11434" {...field} />
                  </FormControl>
                  <FormDescription>
                    The URL where your Ollama instance is running.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {existing ? "Update Configuration" : "Save Configuration"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
