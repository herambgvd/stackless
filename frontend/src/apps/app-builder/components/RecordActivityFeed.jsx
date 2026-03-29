import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { commentsApi } from '../api/comments.api';
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { toast } from 'sonner';
import { MessageSquare, GitCommit, Pencil, Trash2, Loader2, Send, Plus, CheckCircle, XCircle, FilePen } from 'lucide-react';
import { fmtSmart } from '@/shared/lib/date';

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ user }) {
  const label = user ? (user.full_name || user.email || user.id).substring(0, 2).toUpperCase() : '??';
  return (
    <div className="h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0 select-none">
      {label}
    </div>
  );
}

// ── Render content with @mention highlighting ─────────────────────────────────
function CommentContent({ content, mentions, tenantUsers }) {
  if (!mentions || mentions.length === 0) {
    return <span>{content}</span>;
  }
  // Replace @{user_id} tokens with highlighted spans
  const parts = content.split(/(@[^\s]+)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('@')) {
          const uid = part.slice(1);
          const user = tenantUsers.find((u) => u.id === uid);
          if (user) {
            return (
              <span key={i} className="text-primary font-medium bg-primary/10 px-0.5 rounded">
                @{user.full_name || user.email}
              </span>
            );
          }
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ── Change diff display ───────────────────────────────────────────────────────
function ChangeDiff({ changes }) {
  const [open, setOpen] = useState(false);
  if (!changes || Object.keys(changes).length === 0) return null;
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
      >
        {open ? 'Hide' : 'Show'} changes ({Object.keys(changes).length} field{Object.keys(changes).length !== 1 ? 's' : ''})
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 rounded-md border border-border bg-muted/30 px-3 py-2">
          {Object.entries(changes).map(([field, change]) => {
            const oldVal = typeof change === 'object' && change !== null ? String(change.old ?? '—') : '—';
            const newVal = typeof change === 'object' && change !== null ? String(change.new ?? change) : String(change);
            return (
              <div key={field} className="text-xs font-mono">
                <span className="text-muted-foreground">{field}:</span>{' '}
                <span className="line-through text-red-500/80">{oldVal}</span>{' '}
                <span className="text-green-600">→ {newVal}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Entry type config ─────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  comment:  { Icon: MessageSquare, color: 'text-primary',     dot: 'bg-primary',     label: null },
  create:   { Icon: Plus,          color: 'text-green-600',   dot: 'bg-green-500',   label: 'Created' },
  update:   { Icon: GitCommit,     color: 'text-amber-600',   dot: 'bg-amber-500',   label: 'Updated' },
  delete:   { Icon: XCircle,       color: 'text-red-600',     dot: 'bg-red-500',     label: 'Deleted' },
  submit:   { Icon: CheckCircle,   color: 'text-green-600',   dot: 'bg-green-500',   label: 'Submitted' },
  cancel:   { Icon: XCircle,       color: 'text-red-500',     dot: 'bg-red-400',     label: 'Cancelled' },
  amend:    { Icon: FilePen,       color: 'text-blue-600',    dot: 'bg-blue-500',    label: 'Amended' },
};

function typeConfig(type) {
  return TYPE_CONFIG[type] ?? TYPE_CONFIG.update;
}

// ── Single activity entry ─────────────────────────────────────────────────────
function ActivityItem({ entry, appId, modelSlug, recordId, currentUserId, tenantUsers, onRefresh }) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(entry.content);

  const updateMut = useMutation({
    mutationFn: () => commentsApi.updateComment(appId, modelSlug, recordId, entry.id, editContent),
    onSuccess: () => { setEditing(false); toast.success('Comment updated'); onRefresh(); },
    onError: () => toast.error('Failed to update comment'),
  });

  const deleteMut = useMutation({
    mutationFn: () => commentsApi.deleteComment(appId, modelSlug, recordId, entry.id),
    onSuccess: () => { toast.success('Comment deleted'); onRefresh(); },
    onError: () => toast.error('Failed to delete comment'),
  });

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isComment = entry.type === 'comment';
  const isOwn = entry.user_id === currentUserId;
  const { label: timeLabel, title: timeTitle } = fmtSmart(entry.created_at);
  const user = tenantUsers.find((u) => u.id === entry.user_id);
  const displayName = entry.user_id === 'system' ? 'System' : (user?.full_name || user?.email || entry.user_id.substring(0, 8));
  const { Icon, color, dot } = typeConfig(entry.type);

  return (
    <div className="flex gap-2.5 group relative">
      {/* Timeline dot + icon */}
      <div className="flex flex-col items-center shrink-0">
        <div className={`h-7 w-7 rounded-full flex items-center justify-center ${isComment ? 'bg-primary/10' : 'bg-muted'}`}>
          <Icon className={`h-3.5 w-3.5 ${color}`} />
        </div>
        {/* vertical connector — rendered by parent via border-l on container */}
      </div>

      <div className="flex-1 min-w-0 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-foreground">{displayName}</span>
          <span className="text-xs text-muted-foreground" title={timeTitle}>{timeLabel}</span>
          {isComment && entry.is_edited && (
            <span className="text-xs text-muted-foreground">(edited)</span>
          )}
          {!isComment && (
            <span className={`ml-auto text-xs font-medium ${color}`}>{typeConfig(entry.type).label}</span>
          )}
        </div>

        {isComment && editing ? (
          <div className="space-y-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="text-sm min-h-[60px]"
              autoFocus
            />
            <div className="flex gap-1.5">
              <Button size="sm" onClick={() => updateMut.mutate()} disabled={updateMut.isPending}>
                {updateMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditContent(entry.content); }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className={`text-sm rounded-lg px-3 py-2 leading-relaxed ${isComment ? 'bg-muted' : 'bg-transparent text-muted-foreground italic'}`}>
              {isComment ? (
                <CommentContent content={entry.content} mentions={entry.mentions} tenantUsers={tenantUsers} />
              ) : (
                entry.content
              )}
            </div>
            {!isComment && <ChangeDiff changes={entry.changes} />}
          </>
        )}

        {isComment && isOwn && !editing && (
          <>
            <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
              <button
                onClick={() => setConfirmingDelete(true)}
                className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-0.5 ml-2"
                disabled={deleteMut.isPending}
              >
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            </div>
            {confirmingDelete && (
              <div className="mt-1.5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
                <span className="text-xs text-red-700">Delete this comment?</span>
                <button
                  onClick={() => { setConfirmingDelete(false); deleteMut.mutate(); }}
                  disabled={deleteMut.isPending}
                  className="rounded-md text-xs font-medium px-2 py-0.5 bg-red-600 text-white hover:bg-red-700 transition-colors duration-150 disabled:opacity-50"
                >
                  {deleteMut.isPending ? 'Deleting…' : 'Delete'}
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded-md text-xs font-medium px-2 py-0.5 border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors duration-150"
                >
                  Cancel
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── @mention picker textarea ──────────────────────────────────────────────────
function MentionTextarea({ value, onChange, onMentionsChange, tenantUsers, ...props }) {
  const [mentionSearch, setMentionSearch] = useState(null); // null = closed, string = searching
  const [mentionStart, setMentionStart] = useState(0); // position of '@' in text
  const [pendingMentions, setPendingMentions] = useState([]); // user_ids collected so far
  const textareaRef = useRef(null);

  const filteredUsers = mentionSearch !== null
    ? tenantUsers.filter((u) =>
        (u.full_name || '').toLowerCase().includes(mentionSearch.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(mentionSearch.toLowerCase())
      ).slice(0, 6)
    : [];

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      props.onSubmit?.();
    }
    if (e.key === 'Escape' && mentionSearch !== null) {
      setMentionSearch(null);
    }
  }

  function handleChange(e) {
    const text = e.target.value;
    onChange(e);

    // Detect @ trigger
    const pos = e.target.selectionStart;
    const before = text.slice(0, pos);
    const match = before.match(/@(\w*)$/);
    if (match) {
      setMentionSearch(match[1]);
      setMentionStart(pos - match[0].length);
    } else {
      setMentionSearch(null);
    }
  }

  function insertMention(user) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const before = value.slice(0, mentionStart);
    const after = value.slice(textarea.selectionStart);
    const inserted = `@${user.id} `;
    const newText = before + inserted + after;
    onChange({ target: { value: newText } });
    const newMentions = [...new Set([...pendingMentions, user.id])];
    setPendingMentions(newMentions);
    onMentionsChange(newMentions);
    setMentionSearch(null);
    // Restore cursor after inserted text
    setTimeout(() => {
      const cur = (before + inserted).length;
      textarea.setSelectionRange(cur, cur);
      textarea.focus();
    }, 0);
  }

  // Reset mentions when text is cleared
  useEffect(() => {
    if (!value) {
      setPendingMentions([]);
      onMentionsChange([]);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        {...props}
      />
      {mentionSearch !== null && filteredUsers.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 z-50 w-56 rounded-md border border-border bg-popover shadow-md overflow-hidden">
          {filteredUsers.map((u) => (
            <button
              key={u.id}
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex flex-col"
              onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}
            >
              <span className="font-medium">{u.full_name || u.email}</span>
              {u.full_name && <span className="text-xs text-muted-foreground">{u.email}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RecordActivityFeed({ appId, modelSlug, recordId, currentUserId, tenantUsers = [] }) {
  const [comment, setComment] = useState('');
  const [mentions, setMentions] = useState([]);
  const queryKey = ['activity', recordId];

  const { data: entries = [], isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () => commentsApi.getActivity(appId, modelSlug, recordId),
    enabled: !!recordId,
    refetchInterval: 30_000,
  });

  const postMut = useMutation({
    mutationFn: () => commentsApi.createComment(appId, modelSlug, recordId, comment, mentions),
    onSuccess: () => {
      setComment('');
      setMentions([]);
      refetch();
    },
    onError: () => toast.error('Failed to post comment'),
  });

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Activity</h3>
      </div>

      {/* Comment input */}
      <div className="space-y-2">
        <MentionTextarea
          placeholder="Write a comment… type @ to mention someone (Ctrl+Enter to submit)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onMentionsChange={setMentions}
          tenantUsers={tenantUsers}
          onSubmit={() => { if (comment.trim()) postMut.mutate(); }}
          className="text-sm min-h-[72px] resize-none"
        />
        <Button
          size="sm"
          onClick={() => postMut.mutate()}
          disabled={!comment.trim() || postMut.isPending}
        >
          {postMut.isPending
            ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            : <Send className="h-3.5 w-3.5 mr-1.5" />
          }
          Post comment
        </Button>
      </div>

      {/* Timeline feed */}
      <div className="relative flex flex-col overflow-y-auto flex-1">
        {/* Vertical timeline line */}
        {entries.length > 0 && (
          <div className="absolute left-3.5 top-0 bottom-4 w-px bg-border" />
        )}

        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-2.5 pb-4">
              <Skeleton className="h-7 w-7 rounded-full shrink-0" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
            </div>
          ))
        ) : entries.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">No activity yet</p>
          </div>
        ) : (
          entries.map((entry) => (
            <ActivityItem
              key={entry.id}
              entry={entry}
              appId={appId}
              modelSlug={modelSlug}
              recordId={recordId}
              currentUserId={currentUserId}
              tenantUsers={tenantUsers}
              onRefresh={refetch}
            />
          ))
        )}
      </div>
    </div>
  );
}
