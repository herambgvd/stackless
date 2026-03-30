import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bot, Loader2, SendHorizonal, Sparkles, User } from "lucide-react";
import { toast } from "sonner";
import { aiApi } from "../api/ai.api";
import { BlueprintPreviewPanel } from "./BlueprintPreviewPanel";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";

function MessageBubble({ role, content, isStreaming }) {
  const isUser = role === "user";
  return (
    <div className={cn("flex gap-3 max-w-[85%]", isUser ? "ml-auto flex-row-reverse" : "")}>
      <div className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
        isUser ? "bg-primary text-primary-foreground" : "bg-muted"
      )}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className={cn(
        "rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words",
        isUser
          ? "bg-primary text-primary-foreground rounded-tr-sm"
          : "bg-muted text-foreground rounded-tl-sm"
      )}>
        {content}
        {isStreaming && <span className="inline-block w-1.5 h-4 ml-0.5 bg-current animate-pulse rounded-sm" />}
      </div>
    </div>
  );
}

const WELCOME_MESSAGE = {
  role: "assistant",
  content: "Hi! I'm Stackless AI. Tell me about the app you want to build — what data do you need to track, who will use it, and what should happen after someone submits a form? The more detail the better!",
};

export function ChatWindow({ sessionId, onSessionCreated }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const bottomRef = useRef(null);
  const abortRef = useRef(null);

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [blueprint, setBlueprint] = useState(null);
  const [localSessionId, setLocalSessionId] = useState(sessionId);

  // Load existing session if provided
  const { data: session, isLoading } = useQuery({
    queryKey: ["ai-session", localSessionId],
    queryFn: () => aiApi.getSession(localSessionId),
    enabled: !!localSessionId,
  });

  // Sync blueprint from loaded session
  useEffect(() => {
    if (session?.blueprint) setBlueprint(session.blueprint);
  }, [session]);

  // Sync sessionId prop → local
  useEffect(() => {
    setLocalSessionId(sessionId);
    setBlueprint(null);
    setStreamText("");
  }, [sessionId]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages, streamText]);

  const generateMutation = useMutation({
    mutationFn: () => aiApi.generateApp(localSessionId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["ai-sessions"] });
      toast.success(`"${data.app_name}" created! Redirecting to builder…`);
      navigate({ to: "/apps/$appId", params: { appId: data.app_id } });
    },
    onError: (e) => toast.error(e.message),
  });

  const sendMessage = () => {
    const msg = input.trim();
    if (!msg || streaming) return;

    setInput("");
    setStreaming(true);
    setStreamText("");

    // Optimistically show user message in the query cache
    if (localSessionId) {
      qc.setQueryData(["ai-session", localSessionId], (old) =>
        old ? {
          ...old,
          messages: [
            ...old.messages,
            { role: "user", content: msg, created_at: new Date().toISOString() },
          ],
        } : old
      );
    }

    abortRef.current = aiApi.streamChat(msg, localSessionId, {
      onChunk: (token) => setStreamText((p) => p + token),
      onDone: (payload) => {
        const newSessionId = payload.session_id;
        if (!localSessionId && newSessionId) {
          setLocalSessionId(newSessionId);
          onSessionCreated?.(newSessionId);
        }
        if (payload.blueprint) {
          setBlueprint(payload.blueprint);
        }
        setStreaming(false);
        setStreamText("");
        qc.invalidateQueries({ queryKey: ["ai-session", newSessionId ?? localSessionId] });
        qc.invalidateQueries({ queryKey: ["ai-sessions"] });
      },
      onError: (msg) => {
        setStreaming(false);
        setStreamText("");
        toast.error(msg);
      },
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const messages = session?.messages ?? [];
  const showWelcome = !isLoading && messages.length === 0 && !localSessionId;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className={cn("h-12 rounded-2xl", i % 2 === 0 ? "w-3/4" : "w-1/2 ml-auto")} />
            ))
          : <>
              {showWelcome && <MessageBubble {...WELCOME_MESSAGE} />}
              {messages.map((m, i) => (
                <MessageBubble key={i} role={m.role} content={m.content} />
              ))}
              {streaming && streamText && (
                <MessageBubble role="assistant" content={streamText} isStreaming />
              )}
              {streaming && !streamText && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Bot className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </>
        }

        {/* Blueprint preview */}
        {blueprint && !streaming && (
          <div className="space-y-3">
            <BlueprintPreviewPanel blueprint={blueprint} />
            <Button
              className="w-full gap-2"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating App…</>
                : <><Sparkles className="h-4 w-4" /> Create This App</>
              }
            </Button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border p-4">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your app or ask a follow-up question… (Enter to send, Shift+Enter for new line)"
            rows={2}
            disabled={streaming || generateMutation.isPending}
            className="resize-none"
          />
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={!input.trim() || streaming || generateMutation.isPending}
            className="shrink-0 h-10 w-10"
          >
            {streaming
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <SendHorizonal className="h-4 w-4" />
            }
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          When the AI shows a blueprint, click <strong>Create This App</strong> to build it automatically.
        </p>
      </div>
    </div>
  );
}
