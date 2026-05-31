import * as React from "react";
import { DayPicker } from "react-day-picker";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "./button";
import { cn } from "../../lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, components, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: "w-fit",
        months: "flex flex-col gap-4",
        month: "space-y-4",
        month_caption: "relative flex h-8 items-center justify-center",
        caption_label: "text-sm font-medium text-zinc-950 dark:text-zinc-50",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between",
        button_previous: cn(
          buttonVariants({ variant: "ghost" }),
          "size-8 p-0 text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50",
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost" }),
          "size-8 p-0 text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50",
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "flex size-9 items-center justify-center text-[0.75rem] font-medium text-zinc-500 dark:text-zinc-400",
        week: "mt-1 flex w-full",
        day: "size-9 p-0 text-center text-sm",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "size-9 p-0 font-normal text-zinc-700 aria-selected:opacity-100 dark:text-zinc-200",
        ),
        selected:
          "[&>button]:bg-zinc-950 [&>button]:text-white [&>button]:hover:bg-zinc-950 dark:[&>button]:bg-zinc-100 dark:[&>button]:text-zinc-950 dark:[&>button]:hover:bg-zinc-100",
        today: "[&>button]:border [&>button]:border-zinc-300 dark:[&>button]:border-zinc-700",
        outside:
          "text-zinc-400 opacity-45 [&>button]:text-zinc-400 dark:text-zinc-600 dark:[&>button]:text-zinc-600",
        disabled: "text-zinc-400 opacity-50 dark:text-zinc-600",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName, ...chevronProps }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("size-4", chevronClassName)} {...chevronProps} />
          ) : (
            <ChevronRight className={cn("size-4", chevronClassName)} {...chevronProps} />
          ),
        ...components,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
