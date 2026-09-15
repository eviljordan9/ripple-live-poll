import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-xl border border-border bg-bg-elevated px-3.5 text-base text-fg placeholder:text-subtle",
          "transition-[border-color,box-shadow] duration-[150ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/35",
          "disabled:cursor-not-allowed disabled:opacity-40",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
