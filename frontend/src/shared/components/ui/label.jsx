import * as LabelPrimitive from "@radix-ui/react-label";
import { cva } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
);

function Label({ className, ...props }) {
  return <LabelPrimitive.Root className={cn(labelVariants(), className)} {...props} />;
}

export { Label };
