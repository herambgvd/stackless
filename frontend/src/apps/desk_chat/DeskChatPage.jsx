import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/api-client";
import { useAuthStore } from "@/shared/store/auth.store";
import { useTenantStore } from "@/shared/store/tenant.store";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/shared/components/ui/dialog";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  MessageSquare, Plus, Send, Hash, Smile,
} from "lucide-react";
import { toast } from "sonner";
import { fmtSmart } from "@/shared/lib/date";

const chatApi = {
  listChannels: () => apiClient.get("/chat/channels").then(r => r.data),
  createChannel: (data) => apiClient.post("/chat/channels", data).then(r => r.data),
  getMessages: (channelId, params) =>
    apiClient.get(`/chat/channels/${channelId}/messages`, { params }).then(r => r.data),
  postMessage: (channelId, body) =>
    apiClient.post(`/chat/channels/${channelId}/messages`, { body }).then(r => r.data),
  react: (channelId, msgId, emoji) =>
    apiClient.post(`/chat/channels/${channelId}/messages/${msgId}/react`, { emoji }).then(r => r.data),
};

const EMOJIS = ["👍", "❤️", "😄", "🎉", "🚀", "👀", "✅", "🙏"];

function NewChannelDialog({ open, onClose }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const mut = useMutation({
    mutationFn: () => chatApi.createChannel({ name, description, channel_type: "public" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-channels"] });
      toast.success("Channel created");
      onClose();
    },
    onError: e => toast.error(e.response?.data?.detail || "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>New Channel</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="channel-name"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="h-8 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={!name.trim() || mut.isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MessageBubble({ msg, currentUserId, channelId, onReact }) {
  const isMe = msg.user_id === currentUserId;
  const [showEmoji, setShowEmoji] = useState(false);

  return (
    <div className={`flex gap-2 group ${isMe ? "flex-row-reverse" : ""}`}>
      <div
        className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
      >
        {msg.user_name?.[0]?.toUpperCase() || "?"}
      </div>
      <div className={`max-w-[70%] ${isMe ? "items-end" : "items-start"} flex flex-col`}>
        {!isMe && (
          <span className="text-[11px] text-muted-foreground mb-0.5 px-1">{msg.user_name}</span>
        )}
        <div
          className={`px-3 py-2 rounded-2xl text-sm relative ${
            isMe
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted rounded-tl-sm"
          }`}
        >
          {msg.deleted ? (
            <span className="italic text-muted-foreground text-xs">Message deleted</span>
          ) : (
            msg.body
          )}
        </div>

        {/* Reactions */}
        {Object.keys(msg.reactions || {}).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 px-1">
            {Object.entries(msg.reactions).map(([emoji, users]) =>
              users.length > 0 ? (
                <button
                  key={emoji}
                  className="text-xs bg-muted hover:bg-muted/80 px-1.5 py-0.5 rounded-full"
                  onClick={() => onReact(msg.id, emoji)}
                >
                  {emoji} {users.length}
                </button>
              ) : null
            )}
          </div>
        )}

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 px-1">
          <span className="text-[10px] text-muted-foreground">{fmtSmart(msg.created_at).label}</span>
          {msg.edited && <span className="text-[10px] text-muted-foreground">(edited)</span>}
          <div className="relative">
            <button
              className="text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => setShowEmoji(v => !v)}
            >
              <Smile className="h-3 w-3" />
            </button>
            {showEmoji && (
              <div className="absolute bottom-5 left-0 bg-background border rounded-lg shadow-lg p-1.5 flex gap-1 z-50">
                {EMOJIS.map(e => (
                  <button
                    key={e}
                    className="text-base hover:scale-125 transition-transform"
                    onClick={() => { onReact(msg.id, e); setShowEmoji(false); }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatPane({ channel }) {
  const { user } = useAuthStore();
  const { tenantId } = useTenantStore?.() || {};
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);
  const wsRef = useRef(null);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["chat-messages", channel.id],
    queryFn: () => chatApi.getMessages(channel.id, { limit: 100 }),
    enabled: !!channel.id,
    staleTime: 0,
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // WebSocket subscription for live messages
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const tid = tenantId || localStorage.getItem("tenant_id");
    if (!token || !tid) return;

    const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${wsProtocol}://${window.location.host}/api/v1/chat/channels/${channel.id}/ws?token=${token}&tenant_id=${tid}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "ping") return;
        qc.setQueryData(["chat-messages", channel.id], (old = []) => {
          if (old.find(m => m.id === msg.id)) return old;
          return [...old, msg];
        });
      } catch (e) {
        console.error("Failed to parse chat message:", e);
      }
    };

    ws.onerror = () => {
      console.error("Chat WebSocket error — connection lost");
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [channel.id, tenantId, qc]);

  const sendMut = useMutation({
    mutationFn: () => chatApi.postMessage(channel.id, input.trim()),
    onSuccess: (msg) => {
      setInput("");
      qc.setQueryData(["chat-messages", channel.id], (old = []) => {
        if (old.find(m => m.id === msg.id)) return old;
        return [...old, msg];
      });
    },
    onError: e => toast.error(e.response?.data?.detail || "Failed to send"),
  });

  const reactMut = useMutation({
    mutationFn: ({ msgId, emoji }) => chatApi.react(channel.id, msgId, emoji),
    onSuccess: (data, { msgId }) => {
      qc.setQueryData(["chat-messages", channel.id], (old = []) =>
        old.map(m => m.id === msgId ? { ...m, reactions: data.reactions } : m)
      );
    },
  });

  function handleSend(e) {
    e.preventDefault();
    if (!input.trim()) return;
    sendMut.mutate();
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Channel header */}
      <div className="px-4 py-3 border-b flex items-center gap-2 shrink-0">
        <Hash className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-sm">{channel.name}</span>
        {channel.description && (
          <span className="text-xs text-muted-foreground">— {channel.description}</span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-2/3 rounded-2xl" />)}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground mt-1">Be the first to say something!</p>
          </div>
        ) : (
          messages.map(msg => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              currentUserId={user?.id}
              channelId={channel.id}
              onReact={(msgId, emoji) => reactMut.mutate({ msgId, emoji })}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="px-4 py-3 border-t shrink-0">
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={`Message #${channel.name}`}
            className="h-9 text-sm"
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
          />
          <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={!input.trim() || sendMut.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}

export function DeskChatPage() {
  const [activeChannel, setActiveChannel] = useState(null);
  const [showNewChannel, setShowNewChannel] = useState(false);

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ["chat-channels"],
    queryFn: chatApi.listChannels,
    onSuccess: (data) => {
      if (data.length > 0 && !activeChannel) setActiveChannel(data[0]);
    },
  });

  useEffect(() => {
    if (channels.length > 0 && !activeChannel) {
      setActiveChannel(channels[0]);
    }
  }, [channels]);

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Channel list */}
      <div className="w-56 shrink-0 border-r flex flex-col">
        <div className="px-4 py-3 border-b flex items-center justify-between shrink-0">
          <span className="font-semibold text-sm flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4" /> Chat
          </span>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setShowNewChannel(true)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {isLoading ? (
            <div className="space-y-1.5 px-2">{[1,2,3].map(i => <Skeleton key={i} className="h-7 rounded" />)}</div>
          ) : channels.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center px-2 py-4">No channels yet</p>
          ) : (
            channels.map(ch => (
              <button
                key={ch.id}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors ${
                  activeChannel?.id === ch.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted"
                }`}
                onClick={() => setActiveChannel(ch)}
              >
                <Hash className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{ch.name}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Message pane */}
      {activeChannel ? (
        <ChatPane key={activeChannel.id} channel={activeChannel} />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Select a channel to start chatting</p>
            <Button size="sm" className="mt-4" onClick={() => setShowNewChannel(true)}>
              <Plus className="h-4 w-4 mr-1" /> Create channel
            </Button>
          </div>
        </div>
      )}

      {showNewChannel && (
        <NewChannelDialog open onClose={() => setShowNewChannel(false)} />
      )}
    </div>
  );
}
