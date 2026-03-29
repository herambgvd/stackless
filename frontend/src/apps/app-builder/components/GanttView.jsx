import { useMemo, useState } from "react";
import { format, parseISO, differenceInDays, addDays, startOfDay } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Label } from "@/shared/components/ui/label";

export function GanttView({ records = [], fields = [], appId, modelSlug }) {
  const dateFields = fields.filter(f => f.type === "date" || f.type === "datetime");

  const [startField, setStartField] = useState(dateFields[0]?.name || "");
  const [endField, setEndField] = useState(dateFields[1]?.name || dateFields[0]?.name || "");
  const [labelField, setLabelField] = useState(
    fields.find(f => f.type === "text" || f.type === "short_text")?.name || fields[0]?.name || ""
  );

  const timelineData = useMemo(() => {
    if (!startField) return null;

    const withDates = records
      .map(r => ({
        id: r.id,
        label: String(r[labelField] || r.id || "").substring(0, 40),
        start: r[startField] ? startOfDay(parseISO(r[startField])) : null,
        end: r[endField] ? startOfDay(parseISO(r[endField])) : null,
      }))
      .filter(r => r.start);

    if (withDates.length === 0) return null;

    const allDates = withDates.flatMap(r => [r.start, r.end].filter(Boolean));
    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
    const totalDays = Math.max(differenceInDays(maxDate, minDate) + 7, 30);

    return { rows: withDates, minDate, totalDays };
  }, [records, startField, endField, labelField]);

  const today = startOfDay(new Date());

  if (dateFields.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground border rounded-lg">
        <p>Gantt view requires at least one date field in your model.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Field selectors */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-xs">Start Date</Label>
          <Select value={startField} onValueChange={setStartField}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {dateFields.map(f => <SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">End Date</Label>
          <Select value={endField} onValueChange={setEndField}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {dateFields.map(f => <SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Label</Label>
          <Select value={labelField} onValueChange={setLabelField}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {fields.map(f => <SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!timelineData ? (
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          No records with valid dates to display.
        </div>
      ) : (
        <div className="border rounded-lg overflow-auto">
          {/* Date header */}
          <div className="flex border-b bg-muted/30 sticky top-0 z-10">
            <div className="w-48 shrink-0 px-3 py-2 text-xs font-medium border-r">Record</div>
            <div className="flex-1 relative" style={{ minWidth: timelineData.totalDays * 20, height: 32 }}>
              {Array.from({ length: Math.ceil(timelineData.totalDays / 7) }, (_, i) => {
                const date = addDays(timelineData.minDate, i * 7);
                return (
                  <span
                    key={i}
                    className="absolute text-xs text-muted-foreground"
                    style={{ left: i * 7 * 20, top: 6 }}
                  >
                    {format(date, "MMM d")}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Rows */}
          {timelineData.rows.map(row => {
            const startOffset = differenceInDays(row.start, timelineData.minDate);
            const duration = row.end ? Math.max(differenceInDays(row.end, row.start), 1) : 1;
            const todayOffset = differenceInDays(today, timelineData.minDate);
            return (
              <div key={row.id} className="flex border-b last:border-0 hover:bg-muted/20">
                <div className="w-48 shrink-0 px-3 py-2 text-xs truncate border-r">{row.label}</div>
                <div
                  className="flex-1 relative py-1.5"
                  style={{ minWidth: timelineData.totalDays * 20, height: 36 }}
                >
                  {/* Today line */}
                  {todayOffset >= 0 && todayOffset <= timelineData.totalDays && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-red-400 opacity-50 z-10"
                      style={{ left: todayOffset * 20 }}
                    />
                  )}
                  {/* Bar */}
                  <div
                    className="absolute top-1.5 bottom-1.5 rounded bg-primary/70 hover:bg-primary cursor-pointer transition-colors flex items-center px-2"
                    style={{ left: startOffset * 20, width: Math.max(duration * 20, 8) }}
                    title={`${row.label}: ${format(row.start, "MMM d")} → ${row.end ? format(row.end, "MMM d") : "?"}`}
                  >
                    {duration > 2 && (
                      <span className="text-xs text-primary-foreground truncate">{row.label}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
