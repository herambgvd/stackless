import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, addDays, isSameMonth, isSameDay, isToday,
  parseISO, startOfDay, endOfDay,
} from "date-fns";
import { apiClient } from "@/shared/lib/api-client";
import { useAuthStore } from "@/shared/store/auth.store";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/shared/components/ui/dialog";
import { Badge } from "@/shared/components/ui/badge";
import { ChevronLeft, ChevronRight, Plus, Calendar, Trash2, Edit2 } from "lucide-react";
import { toast } from "sonner";

const calendarApi = {
  listEvents: (start, end) =>
    apiClient.get("/calendar/events", { params: { start, end } }).then(r => r.data),
  createEvent: (data) =>
    apiClient.post("/calendar/events", data).then(r => r.data),
  updateEvent: (id, data) =>
    apiClient.put(`/calendar/events/${id}`, data).then(r => r.data),
  deleteEvent: (id) =>
    apiClient.delete(`/calendar/events/${id}`),
};

const EVENT_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444",
  "#3b82f6", "#8b5cf6", "#f97316", "#06b6d4",
];

const EMPTY_EVENT = {
  title: "",
  description: "",
  start_at: "",
  end_at: "",
  all_day: false,
  color: "#6366f1",
  location: "",
};

function EventDialog({ open, onClose, initialDate, editing }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => {
    if (editing) {
      return {
        title: editing.title,
        description: editing.description || "",
        start_at: editing.start_at.slice(0, 16),
        end_at: editing.end_at.slice(0, 16),
        all_day: editing.all_day,
        color: editing.color,
        location: editing.location || "",
      };
    }
    const dateStr = initialDate ? format(initialDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
    return { ...EMPTY_EVENT, start_at: `${dateStr}T09:00`, end_at: `${dateStr}T10:00` };
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const createMut = useMutation({
    mutationFn: () => calendarApi.createEvent({
      ...form,
      start_at: new Date(form.start_at).toISOString(),
      end_at: new Date(form.end_at).toISOString(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
      toast.success("Event created");
      onClose();
    },
    onError: e => toast.error(e.response?.data?.detail || "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: () => calendarApi.updateEvent(editing.id, {
      ...form,
      start_at: new Date(form.start_at).toISOString(),
      end_at: new Date(form.end_at).toISOString(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
      toast.success("Event updated");
      onClose();
    },
    onError: e => toast.error(e.response?.data?.detail || "Failed"),
  });

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Event" : "New Event"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Input
            value={form.title}
            onChange={e => set("title", e.target.value)}
            placeholder="Event title"
            className="h-8 text-sm"
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Start</label>
              <Input
                type={form.all_day ? "date" : "datetime-local"}
                value={form.all_day ? form.start_at.slice(0, 10) : form.start_at}
                onChange={e => set("start_at", e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">End</label>
              <Input
                type={form.all_day ? "date" : "datetime-local"}
                value={form.all_day ? form.end_at.slice(0, 10) : form.end_at}
                onChange={e => set("end_at", e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.all_day}
              onChange={e => set("all_day", e.target.checked)}
              className="rounded"
            />
            All day
          </label>
          <Input
            value={form.description}
            onChange={e => set("description", e.target.value)}
            placeholder="Description (optional)"
            className="h-8 text-sm"
          />
          <Input
            value={form.location}
            onChange={e => set("location", e.target.value)}
            placeholder="Location (optional)"
            className="h-8 text-sm"
          />
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Color</label>
            <div className="flex gap-2 flex-wrap">
              {EVENT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("color", c)}
                  className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: form.color === c ? "white" : "transparent",
                    outline: form.color === c ? `2px solid ${c}` : "none",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={() => editing ? updateMut.mutate() : createMut.mutate()}
            disabled={!form.title.trim() || !form.start_at || !form.end_at || isPending}
          >
            {editing ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EventPopover({ event, onEdit, onDelete, onClose }) {
  const { user } = useAuthStore();
  const isOwner = event.creator_id === user?.id;

  return (
    <div className="absolute z-50 bg-background border rounded-lg shadow-xl p-3 w-64 text-sm" style={{ top: "100%", left: 0 }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: event.color }} />
          <span className="font-medium leading-tight">{event.title}</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs shrink-0">✕</button>
      </div>
      <div className="space-y-1 text-xs text-muted-foreground pl-5">
        <p>{format(parseISO(event.start_at), "MMM d, yyyy h:mm a")} – {format(parseISO(event.end_at), "h:mm a")}</p>
        {event.location && <p>📍 {event.location}</p>}
        {event.description && <p className="text-foreground/80">{event.description}</p>}
        <p>by {event.creator_name}</p>
      </div>
      {isOwner && (
        <div className="flex gap-2 mt-3 pl-5">
          <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={onEdit}>
            <Edit2 className="h-3 w-3 mr-1" /> Edit
          </Button>
          <Button size="sm" variant="outline" className="h-6 text-xs px-2 text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-3 w-3 mr-1" /> Delete
          </Button>
        </div>
      )}
    </div>
  );
}

function CalendarDay({ date, events, currentMonth, onDayClick, onEventClick }) {
  const isCurrentMonth = isSameMonth(date, currentMonth);
  const isCurrentDay = isToday(date);

  return (
    <div
      className={`min-h-[80px] border-r border-b p-1 cursor-pointer hover:bg-muted/30 transition-colors ${
        !isCurrentMonth ? "bg-muted/10" : ""
      }`}
      onClick={() => onDayClick(date)}
    >
      <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium mb-1 ${
        isCurrentDay
          ? "bg-primary text-primary-foreground"
          : isCurrentMonth
            ? "text-foreground"
            : "text-muted-foreground/50"
      }`}>
        {format(date, "d")}
      </div>
      <div className="space-y-0.5">
        {events.slice(0, 3).map(ev => (
          <button
            key={ev.id}
            className="w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate text-white font-medium leading-tight block"
            style={{ backgroundColor: ev.color }}
            onClick={e => { e.stopPropagation(); onEventClick(ev, e); }}
          >
            {ev.all_day ? ev.title : `${format(parseISO(ev.start_at), "h:mm")} ${ev.title}`}
          </button>
        ))}
        {events.length > 3 && (
          <span className="text-[10px] text-muted-foreground px-1">+{events.length - 3} more</span>
        )}
      </div>
    </div>
  );
}

export function CalendarPage() {
  const qc = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showDialog, setShowDialog] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [popoverEvent, setPopoverEvent] = useState(null);

  // Compute visible date range (full weeks)
  const rangeStart = startOfWeek(startOfMonth(currentMonth));
  const rangeEnd = endOfWeek(endOfMonth(currentMonth));

  const { data: events = [] } = useQuery({
    queryKey: ["calendar-events", format(currentMonth, "yyyy-MM")],
    queryFn: () => calendarApi.listEvents(rangeStart.toISOString(), rangeEnd.toISOString()),
    staleTime: 30_000,
  });

  const deleteMut = useMutation({
    mutationFn: (id) => calendarApi.deleteEvent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
      toast.success("Event deleted");
      setPopoverEvent(null);
    },
    onError: e => toast.error(e.response?.data?.detail || "Failed"),
  });

  // Build calendar grid (always 6 rows × 7 cols)
  const weeks = useMemo(() => {
    const days = [];
    let d = rangeStart;
    while (d <= rangeEnd) {
      days.push(d);
      d = addDays(d, 1);
    }
    // Pad to 42 days
    while (days.length < 42) days.push(addDays(days[days.length - 1], 1));
    const result = [];
    for (let i = 0; i < 42; i += 7) result.push(days.slice(i, i + 7));
    return result;
  }, [currentMonth]);

  // Map events to days
  const eventsByDay = useMemo(() => {
    const map = {};
    for (const ev of events) {
      const key = format(parseISO(ev.start_at), "yyyy-MM-dd");
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    }
    return map;
  }, [events]);

  function handleDayClick(date) {
    setSelectedDate(date);
    setEditingEvent(null);
    setShowDialog(true);
    setPopoverEvent(null);
  }

  function handleEventClick(ev, domEvent) {
    domEvent.stopPropagation();
    setPopoverEvent(popoverEvent?.ev?.id === ev.id ? null : { ev, target: domEvent.currentTarget });
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{format(currentMonth, "MMMM yyyy")}</h1>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => setCurrentMonth(new Date())}>
              Today
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Button size="sm" className="h-8 gap-1" onClick={() => { setSelectedDate(new Date()); setEditingEvent(null); setShowDialog(true); }}>
          <Plus className="h-3.5 w-3.5" /> New Event
        </Button>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b sticky top-0 bg-background z-10">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2 border-r">
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div className="relative" onClick={() => setPopoverEvent(null)}>
          {weeks.map((week) => (
            <div key={format(week[0], "yyyy-MM-dd")} className="grid grid-cols-7 border-t">
              {week.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                return (
                  <div key={key} className="relative">
                    <CalendarDay
                      date={day}
                      events={eventsByDay[key] || []}
                      currentMonth={currentMonth}
                      onDayClick={handleDayClick}
                      onEventClick={handleEventClick}
                    />
                    {popoverEvent && isSameDay(day, parseISO(popoverEvent.ev.start_at)) && (
                      <EventPopover
                        event={popoverEvent.ev}
                        onClose={() => setPopoverEvent(null)}
                        onEdit={() => {
                          setEditingEvent(popoverEvent.ev);
                          setShowDialog(true);
                          setPopoverEvent(null);
                        }}
                        onDelete={() => deleteMut.mutate(popoverEvent.ev.id)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming events sidebar strip */}
      <div className="border-t px-4 py-2 flex gap-3 overflow-x-auto shrink-0 bg-muted/20">
        <span className="text-xs text-muted-foreground font-medium shrink-0 self-center">Upcoming:</span>
        {events
          .filter(ev => new Date(ev.start_at) >= startOfDay(new Date()))
          .slice(0, 8)
          .map(ev => (
            <button
              key={ev.id}
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border shrink-0 hover:bg-muted transition-colors"
              onClick={() => { setPopoverEvent({ ev }); }}
            >
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: ev.color }} />
              <span>{format(parseISO(ev.start_at), "MMM d")} · {ev.title}</span>
            </button>
          ))
        }
        {events.filter(ev => new Date(ev.start_at) >= startOfDay(new Date())).length === 0 && (
          <span className="text-xs text-muted-foreground italic">No upcoming events</span>
        )}
      </div>

      {/* Create/edit dialog */}
      {showDialog && (
        <EventDialog
          open
          onClose={() => { setShowDialog(false); setEditingEvent(null); }}
          initialDate={selectedDate}
          editing={editingEvent}
        />
      )}
    </div>
  );
}
