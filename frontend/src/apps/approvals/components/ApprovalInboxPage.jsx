import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Clock, Inbox, Ban } from "lucide-react";
import { toast } from "sonner";
import { approvalsApi } from "../api/approvals.api";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import { Textarea } from "@/shared/components/ui/textarea";
import { Label } from "@/shared/components/ui/label";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/components/ui/tabs";
import { fmtSmart } from "@/shared/lib/date";
import { useAuthStore } from "@/shared/store/auth.store";

function SmartDate({ iso }) {
  const { label, title } = fmtSmart(iso);
  return <span title={title}>{label}</span>;
}

export function ApprovalInboxPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [comment, setComment] = useState("");
  const [action, setAction] = useState(null); // "approve" | "reject" | "cancel"
  const [cancelConfirmRequest, setCancelConfirmRequest] = useState(null);

  const { data: inboxData = { requests: [], total: 0 }, isLoading } = useQuery({
    queryKey: ["approvals", "inbox"],
    queryFn: () => approvalsApi.getInbox(),
  });
  const inbox = inboxData.requests ?? [];

  const { data: history = [] } = useQuery({
    queryKey: ["approvals", "history"],
    queryFn: () => approvalsApi.getHistory("approved"),
  });

  const approveReject = useMutation({
    mutationFn: ({ requestId, act, cmt }) =>
      approvalsApi.decide(requestId, act, cmt),
    onSuccess: (_, { act }) => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      setSelectedRequest(null);
      setComment("");
      toast.success(
        act === "approve" ? "Request approved" : "Request rejected",
      );
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelRequest = useMutation({
    mutationFn: (requestId) => approvalsApi.cancelRequest(requestId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approvals", "inbox"] });
      qc.invalidateQueries({ queryKey: ["approvals", "requests"] });
      setCancelConfirmRequest(null);
      toast.success("Request withdrawn");
    },
    onError: (e) => toast.error(e.response?.data?.detail || "Failed to cancel request"),
  });

  const openDialog = (request, act) => {
    setSelectedRequest(request);
    setAction(act);
    setComment("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Approval Inbox
        </h2>
        <p className="text-sm text-muted-foreground">
          Review and action pending approval requests
        </p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending{" "}
            <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-xs">
              {inboxData.total}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))
          ) : inbox.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Inbox className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="font-medium text-foreground">All caught up!</p>
              <p className="text-sm text-muted-foreground">
                No pending approval requests
              </p>
            </div>
          ) : (
            inbox.map((req) => (
              <ApprovalCard
                key={req.id}
                request={req}
                onApprove={() => openDialog(req, "approve")}
                onReject={() => openDialog(req, "reject")}
                onCancel={() => setCancelConfirmRequest(req)}
                currentUserId={user?.id}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-3">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No history yet
            </p>
          ) : (
            history.map((req) => <HistoryCard key={req.id} request={req} />)
          )}
        </TabsContent>
      </Tabs>

      {/* Cancel/Withdraw confirmation dialog */}
      <Dialog
        open={!!cancelConfirmRequest}
        onOpenChange={() => setCancelConfirmRequest(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Withdraw Request</DialogTitle>
          </DialogHeader>
          {cancelConfirmRequest && (
            <div className="py-2">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to withdraw{" "}
                <span className="font-medium text-foreground">
                  {cancelConfirmRequest.metadata?.title ?? `Request #${cancelConfirmRequest.id.slice(-6)}`}
                </span>
                ? This action cannot be undone.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCancelConfirmRequest(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={cancelRequest.isPending}
              onClick={() => cancelRequest.mutate(cancelConfirmRequest.id)}
            >
              {cancelRequest.isPending ? "Withdrawing…" : "Withdraw"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve/Reject dialog */}
      <Dialog
        open={!!selectedRequest}
        onOpenChange={() => setSelectedRequest(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === "approve" ? "Approve Request" : "Reject Request"}
            </DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-muted p-3">
                <p className="text-sm font-medium">
                  {selectedRequest.metadata?.title ??
                    `Request #${selectedRequest.id.slice(-6)}`}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedRequest.metadata?.description ??
                    `Flow: ${selectedRequest.flow_id} · Record: ${selectedRequest.record_id}`}
                </p>
              </div>
              <div className="space-y-2">
                <Label>
                  Comment {action === "reject" ? "(required)" : "(optional)"}
                </Label>
                <Textarea
                  placeholder="Add a comment…"
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRequest(null)}>
              Cancel
            </Button>
            <Button
              variant={action === "approve" ? "default" : "destructive"}
              disabled={
                approveReject.isPending ||
                (action === "reject" && !comment.trim())
              }
              onClick={() =>
                approveReject.mutate({
                  requestId: selectedRequest.id,
                  act: action,
                  cmt: comment,
                })
              }
            >
              {approveReject.isPending
                ? "Processing…"
                : action === "approve"
                  ? "Approve"
                  : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ApprovalCard({ request, onApprove, onReject }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
          <Clock className="h-5 w-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground">
            {request.metadata?.title ?? `Request #${request.id.slice(-6)}`}
          </p>
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
            {request.metadata?.description ??
              `Flow: ${request.flow_id} · Record: ${request.record_id}`}
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">
            Submitted by{" "}
            <span className="font-medium">{request.submitted_by}</span>{" "}
            <SmartDate iso={request.created_at} />
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="text-destructive border-destructive/30 hover:bg-destructive/5"
            onClick={onReject}
          >
            <XCircle className="h-4 w-4" /> Reject
          </Button>
          <Button size="sm" onClick={onApprove}>
            <CheckCircle className="h-4 w-4" /> Approve
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryCard({ request }) {
  const approved = request.status === "approved";
  return (
    <Card className="opacity-80">
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${approved ? "bg-green-500/10" : "bg-destructive/10"}`}
        >
          {approved ? (
            <CheckCircle className="h-4 w-4 text-green-600" />
          ) : (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {request.metadata?.title ?? `Request #${request.id.slice(-6)}`}
          </p>
          <p className="text-xs text-muted-foreground">
            <SmartDate iso={request.updated_at ?? request.created_at} />
          </p>
        </div>
        <Badge variant={approved ? "success" : "destructive"}>
          {request.status}
        </Badge>
      </CardContent>
    </Card>
  );
}
