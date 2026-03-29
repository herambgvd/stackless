import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Play, Trash2, ChevronUp, Terminal, Info } from "lucide-react";

const STARTER_SNIPPET = `# System Console — Python REPL
# Available: AppDefinition, Workflow, WorkflowRun, User, _user

# Example: count apps
# import asyncio
# count = asyncio.run(AppDefinition.find_all().count())
# print(f"Total apps: {count}")

print("Hello from system console!")
`;

function OutputPanel({ result, loading }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <span className="animate-spin">⟳</span> Running…
      </div>
    );
  }
  if (!result) {
    return (
      <div className="p-4 text-sm text-muted-foreground italic">
        Output will appear here after execution.
      </div>
    );
  }

  const { success, output, error } = result;

  return (
    <div className="font-mono text-xs leading-5 p-4 space-y-2">
      {output && (
        <div className="whitespace-pre-wrap text-foreground">{output}</div>
      )}
      {error && (
        <div className="whitespace-pre-wrap text-destructive border border-destructive/30 bg-destructive/5 rounded p-2">
          {error}
        </div>
      )}
      {!output && !error && success && (
        <div className="text-muted-foreground italic">
          (no output — execution completed successfully)
        </div>
      )}
    </div>
  );
}

export function SystemConsolePage() {
  const [code, setCode] = useState(STARTER_SNIPPET);
  const [language, setLanguage] = useState("python");
  const [history, setHistory] = useState([]);
  const [currentResult, setCurrentResult] = useState(null);
  const textareaRef = useRef(null);

  const executeMutation = useMutation({
    mutationFn: async ({ code, language }) => {
      const res = await apiClient.post("/admin/console/execute", { code, language });
      return res.data;
    },
    onSuccess: (data) => {
      setCurrentResult(data);
      setHistory((prev) => [
        { code, language, result: data, timestamp: new Date().toISOString() },
        ...prev.slice(0, 19),
      ]);
    },
    onError: (err) => {
      setCurrentResult({
        success: false,
        output: "",
        error: err?.response?.data?.detail || err.message,
        result: null,
      });
    },
  });

  function handleRun() {
    if (!code.trim()) return;
    executeMutation.mutate({ code, language });
  }

  function handleKeyDown(e) {
    // Ctrl+Enter / Cmd+Enter to execute
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleRun();
      return;
    }
    // Tab inserts 4 spaces
    if (e.key === "Tab") {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const newCode = code.substring(0, start) + "    " + code.substring(end);
      setCode(newCode);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = start + 4;
          textareaRef.current.selectionEnd = start + 4;
        }
      });
    }
  }

  function loadHistoryItem(item) {
    setCode(item.code);
    setCurrentResult(item.result);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">System Console</h1>
          <Badge variant="destructive" className="text-[10px]">Admin Only</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="python">Python</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={handleRun}
            disabled={executeMutation.isPending || !code.trim()}
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            Run
            <span className="ml-1.5 text-[10px] opacity-60">⌘↵</span>
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-900/10 px-3 py-2">
        <Info className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Code runs on the server with direct access to app models. Use <code className="font-mono bg-amber-100 dark:bg-amber-900/30 px-1 rounded">asyncio.run()</code> for async Beanie queries. Destructive operations are irreversible.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Editor pane */}
        <div className="lg:col-span-2 space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                Editor
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setCode("")}
                  title="Clear"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <textarea
                ref={textareaRef}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full font-mono text-sm bg-transparent resize-none outline-none px-4 pb-4 min-h-[280px] leading-5 text-foreground"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="# Write Python code here..."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                Output
                {currentResult && (
                  <Badge
                    variant={currentResult.success ? "default" : "destructive"}
                    className="text-[10px]"
                  >
                    {currentResult.success ? "OK" : "Error"}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 min-h-[100px] max-h-80 overflow-y-auto">
              <OutputPanel result={currentResult} loading={executeMutation.isPending} />
            </CardContent>
          </Card>
        </div>

        {/* History pane */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {history.length === 0 ? (
              <p className="px-4 py-3 text-xs text-muted-foreground italic">
                No executions yet.
              </p>
            ) : (
              <div className="divide-y max-h-[500px] overflow-y-auto">
                {history.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => loadHistoryItem(item)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors group"
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge
                        variant={item.result.success ? "default" : "destructive"}
                        className="text-[9px] px-1 py-0"
                      >
                        {item.result.success ? "OK" : "ERR"}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs font-mono truncate text-muted-foreground group-hover:text-foreground">
                      {item.code.split("\n").find((l) => l.trim() && !l.startsWith("#")) || item.code.split("\n")[0]}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
