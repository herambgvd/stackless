import {
  Type,
  Hash,
  AlignLeft,
  Mail,
  Phone,
  Calendar,
  ToggleLeft,
  List,
  Link as LinkIcon,
  Upload,
  Link2,
  DollarSign,
  Clock,
  User,
  ChevronDown,
  Sigma,
  FunctionSquare,
  Braces,
  Table,
  Timer,
  Palette,
  Star,
  MapPin,
  ScanBarcode,
  PenLine,
  ImagePlus,
  Minus,
  Columns2,
  FileText,
  Code,
  LayoutList,
  Smile,
} from "lucide-react";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { cn } from "@/shared/lib/utils";

/**
 * All types must exactly match the backend FieldType enum values.
 * Groups are for visual organisation only.
 */
const FIELD_GROUPS = [
  {
    label: "Text",
    types: [
      { type: "text",      label: "Text",       icon: Type,        description: "Single line text" },
      { type: "rich_text", label: "Long text",   icon: AlignLeft,   description: "Multi-line / rich text" },
      { type: "email",     label: "Email",       icon: Mail,        description: "Email address" },
      { type: "phone",     label: "Phone",       icon: Phone,       description: "Phone number" },
      { type: "url",       label: "URL",         icon: LinkIcon,    description: "Web address" },
    ],
  },
  {
    label: "Numbers & Dates",
    types: [
      { type: "number",   label: "Number",    icon: Hash,     description: "Integer / decimal" },
      { type: "currency", label: "Currency",  icon: DollarSign, description: "Monetary value" },
      { type: "date",     label: "Date",      icon: Calendar, description: "Date picker" },
      { type: "datetime", label: "Date & time", icon: Clock,  description: "Date + time picker" },
    ],
  },
  {
    label: "Choice",
    types: [
      { type: "boolean",     label: "Checkbox",    icon: ToggleLeft,  description: "True / False toggle" },
      { type: "select",      label: "Select",       icon: List,        description: "Single dropdown" },
      { type: "multiselect", label: "Multi-select", icon: ChevronDown, description: "Multiple choices" },
    ],
  },
  {
    label: "Relations & Files",
    types: [
      { type: "relation", label: "Relation",  icon: Link2,   description: "Link to another model" },
      { type: "file",     label: "File",      icon: Upload,  description: "File / attachment" },
      { type: "user_ref", label: "User ref",  icon: User,    description: "Reference to a user" },
    ],
  },
  {
    label: "Computed",
    types: [
      { type: "rollup",   label: "Rollup",   icon: Sigma,           description: "Aggregate child record values" },
      { type: "formula",  label: "Formula",  icon: FunctionSquare,  description: "Calculated from other fields" },
    ],
  },
  {
    label: "Advanced",
    types: [
      { type: "child_table",   label: "Child Table",   icon: Table,       description: "Inline sub-records (like invoice line items)" },
      { type: "json",          label: "JSON",          icon: Braces,      description: "Arbitrary JSON object / array" },
      { type: "time",          label: "Time",          icon: Clock,       description: "Time picker (HH:MM)" },
      { type: "duration",      label: "Duration",      icon: Timer,       description: "Duration as HH:MM:SS" },
      { type: "color",         label: "Color",         icon: Palette,     description: "Color picker (hex)" },
      { type: "rating",        label: "Rating",        icon: Star,        description: "Star rating (1–5)" },
      { type: "geolocation",   label: "Geolocation",   icon: MapPin,      description: "Latitude / longitude pair" },
      { type: "dynamic_link",  label: "Dynamic Link",  icon: Link2,       description: "Link to any document by ID" },
      { type: "barcode",       label: "Barcode",       icon: ScanBarcode, description: "Scan or enter barcode value" },
      { type: "signature",     label: "Signature",     icon: PenLine,     description: "Capture a signature" },
      { type: "attach_image",       label: "Attach Image",       icon: ImagePlus,    description: "Image attachment" },
      { type: "table_multiselect",  label: "Table MultiSelect",  icon: LayoutList,   description: "Multi-select from related model records" },
      { type: "icon",               label: "Icon",               icon: Smile,        description: "Icon picker (Lucide icon name)" },
    ],
  },
  {
    label: "Layout",
    types: [
      { type: "section_break", label: "Section Break", icon: Minus,    description: "Divider with optional heading" },
      { type: "column_break",  label: "Column Break",  icon: Columns2, description: "Start a new form column" },
      { type: "page_break",    label: "Page Break",    icon: FileText, description: "Split form into pages" },
      { type: "html",          label: "HTML",          icon: Code,     description: "Raw HTML / rich content block" },
    ],
  },
];

export function FieldPalette({ onAddField }) {
  return (
    <div className="flex flex-col h-full rounded-xl border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Field Types
        </p>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-3">
          {FIELD_GROUPS.map(({ label, types }) => (
            <div key={label}>
              <p className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {label}
              </p>
              <div className="space-y-0.5">
                {types.map(({ type, label: typeLabel, icon: Icon, description }) => (
                  <button
                    key={type}
                    onClick={() => onAddField(type)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                      "hover:bg-primary/5 hover:text-primary group",
                    )}
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted group-hover:bg-primary/10 transition-colors">
                      <Icon className="h-3 w-3 text-muted-foreground group-hover:text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground group-hover:text-primary leading-tight">
                        {typeLabel}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
