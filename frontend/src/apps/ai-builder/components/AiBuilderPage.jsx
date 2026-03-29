import { useState } from "react";
import { Sparkles } from "lucide-react";
import { ChatWindow } from "./ChatWindow";
import { SessionList } from "./SessionList";

export function AiBuilderPage() {
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  const handleNew = () => setSelectedSessionId(null);
  const handleSelect = (id) => setSelectedSessionId(id);
  const handleSessionCreated = (id) => setSelectedSessionId(id);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 rounded-xl border border-border overflow-hidden bg-background">
      {/* ── Session sidebar ─────────────────────────────────────────────────── */}
      <div className="w-64 shrink-0 border-r border-border flex flex-col bg-muted/20">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">AI Builder</span>
        </div>
        <div className="flex-1 min-h-0">
          <SessionList
            selectedId={selectedSessionId}
            onSelect={handleSelect}
            onNew={handleNew}
          />
        </div>
      </div>

      {/* ── Chat area ────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        <ChatWindow
          key={selectedSessionId ?? "new"}
          sessionId={selectedSessionId}
          onSessionCreated={handleSessionCreated}
        />
      </div>
    </div>
  );
}
