import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function CalendarView({ records, model, view, onRecordClick }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());

  const dateField = view?.group_by_field || model?.fields?.find(f => f.type === "date" || f.type === "datetime")?.name;

  if (!dateField) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Calendar requires a DATE field. Set "Group by" in view settings.
      </div>
    );
  }

  // Build date → records map
  const dayMap = {};
  for (const rec of records) {
    const raw = rec[dateField];
    if (!raw) continue;
    try {
      const d = new Date(raw);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const key = d.getDate();
        if (!dayMap[key]) dayMap[key] = [];
        dayMap[key].push(rec);
      }
    } catch (e) { console.warn("CalendarView: invalid date value", raw, e); }
  }

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function prev() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function next() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const today = new Date();
  const isToday = (d) => d && today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-base font-semibold">{MONTHS[month]} {year}</h3>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={next}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-px">
        {DAYS.map(d => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border border-border">
        {cells.map((day, i) => (
          <div
            key={day != null ? `${year}-${month}-${day}` : `empty-${i}`}
            className={cn(
              "bg-card min-h-[80px] p-1.5",
              !day && "bg-muted/20",
            )}
          >
            {day && (
              <>
                <span className={cn(
                  "text-xs font-medium inline-flex h-5 w-5 items-center justify-center rounded-full mb-1",
                  isToday(day) ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                )}>
                  {day}
                </span>
                <div className="space-y-0.5">
                  {(dayMap[day] ?? []).slice(0, 3).map(rec => {
                    const titleField = model?.fields?.[0];
                    const title = titleField ? rec[titleField.name] : rec.id?.slice(-6);
                    return (
                      <div
                        key={rec.id}
                        className="text-[10px] bg-primary/10 text-primary px-1 py-0.5 rounded truncate cursor-pointer hover:bg-primary/20"
                        onClick={() => onRecordClick?.(rec)}
                        title={title}
                      >
                        {title}
                      </div>
                    );
                  })}
                  {(dayMap[day]?.length ?? 0) > 3 && (
                    <div className="text-[10px] text-muted-foreground pl-1">
                      +{dayMap[day].length - 3} more
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
