import { Calendar as CalendarIcon, Moon, Palette, Sun } from "lucide-react";
import { useState, type Dispatch, type SetStateAction } from "react";
import { formatDateString, getTodayString, parseDateString } from "../../lib/date";
import { themePresets, type ColorMode } from "../../lib/theme";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

type TopBarProps = {
  currentDate: string;
  selectedDate: string;
  onSelectedDateChange: (date: string) => void;
  theme: ColorMode;
  onThemeChange: (theme: ColorMode) => void;
  themePreset: string;
  onThemePresetChange: (preset: string) => void;
  customSeedColor: string;
  onCustomSeedColorChange: Dispatch<SetStateAction<string>>;
};

export function TopBar({
  currentDate,
  selectedDate,
  onSelectedDateChange,
  theme,
  onThemeChange,
  themePreset,
  onThemePresetChange,
  customSeedColor,
  onCustomSeedColorChange,
}: TopBarProps) {
  const [isDateOpen, setIsDateOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const today = getTodayString();

  return (
    <header className="flex items-center justify-between gap-4 border-b border-zinc-200 py-3 dark:border-zinc-800">
      <span className="text-sm font-semibold tracking-tight">LifeRL</span>
      <div className="relative flex items-center gap-1.5">
        <Popover open={isDateOpen} onOpenChange={setIsDateOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-2 text-xs font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
              aria-label="Choose date"
              title="Choose date"
            >
              <CalendarIcon className="size-4" />
              <span className="hidden tabular-nums sm:inline">{currentDate}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={parseDateString(selectedDate)}
              defaultMonth={parseDateString(selectedDate)}
              onSelect={(date) => {
                if (!date) return;
                onSelectedDateChange(formatDateString(date));
                setIsDateOpen(false);
              }}
              autoFocus
            />
          </PopoverContent>
        </Popover>

        {selectedDate !== today ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onSelectedDateChange(today)}
            className="h-8 px-2 text-xs font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Today
          </Button>
        ) : null}

        <Button
          aria-label="Select theme preset"
          data-testid="theme-menu-trigger"
          variant="ghost"
          size="icon"
          onClick={() => setIsThemeOpen((open) => !open)}
          className="size-8 text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          <Palette className="size-4" />
        </Button>

        {isThemeOpen ? (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsThemeOpen(false)} />
            <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Select Theme
              </div>
              {themePresets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    onThemePresetChange(preset.id);
                    setIsThemeOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors ${
                    themePreset === preset.id
                      ? "bg-zinc-100 text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                  }`}
                >
                  <span>{preset.name}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: preset.accent }} />
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: preset.dot }} />
                  </span>
                </button>
              ))}

              <div className="my-1.5 border-t border-zinc-100 dark:border-zinc-800" />
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Custom Theme
              </div>
              <div className="flex items-center gap-2 px-2 py-1">
                <input
                  type="color"
                  value={customSeedColor}
                  onChange={(event) => {
                    onCustomSeedColorChange(event.target.value);
                    onThemePresetChange("custom");
                  }}
                  className="size-6 cursor-pointer rounded border border-zinc-200 bg-transparent p-0 outline-none dark:border-zinc-800"
                  title="Choose custom seed color"
                />
                <button
                  onClick={() => {
                    onThemePresetChange("custom");
                    setIsThemeOpen(false);
                  }}
                  className={`flex-1 rounded border py-1 text-center text-[10px] font-bold uppercase transition ${
                    themePreset === "custom"
                      ? "border-zinc-950 bg-zinc-950 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
                      : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                  }`}
                >
                  Custom
                </button>
              </div>
            </div>
          </>
        ) : null}

        <Button
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          variant="ghost"
          size="icon"
          onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
          className="size-8 text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </div>
    </header>
  );
}
