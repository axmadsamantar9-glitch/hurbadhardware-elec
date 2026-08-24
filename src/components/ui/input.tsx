import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Marks the field as invalid — swaps the border/focus ring to --color-error. */
  error?: boolean;
}

/**
 * Base Input primitive. Border uses --color-input-border (>=3:1 UI-component
 * contrast, see globals.css). Focus state uses --color-primary as a 2px ring
 * (>=3:1). Pass `error` to switch to the --color-error treatment.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error = false, ...props }, ref) => {
    return (
      <input
        ref={ref}
        aria-invalid={error || undefined}
        className={cn(
          "flex h-10 w-full rounded-lg border bg-background px-3 py-2 text-base text-foreground",
          "placeholder:text-muted-foreground",
          "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error
            ? "border-error focus-visible:ring-error"
            : "border-input-border focus-visible:ring-primary",
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
