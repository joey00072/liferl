export type ColorMode = "light" | "dark";

export type ThemePreset = {
  id: string;
  name: string;
  accent: string;
  dot: string;
};

export const themePresets: ThemePreset[] = [
  { id: "slate", name: "Slate", accent: "#10b981", dot: "#6b7280" },
  { id: "amethyst", name: "Amethyst", accent: "#a855f7", dot: "#c084fc" },
  { id: "rose", name: "Rose", accent: "#db2777", dot: "#f472b6" },
  { id: "sage", name: "Sage", accent: "#059669", dot: "#78716c" },
  { id: "amber", name: "Amber", accent: "#f59e0b", dot: "#fdba74" },
  { id: "catppuccin", name: "Catppuccin", accent: "#7287fd", dot: "#a6adc8" },
];

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const fullHex = hex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  if (!result) return { h: 0, s: 0, l: 0 };
  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function applyCustomTheme(hex: string, isDark: boolean) {
  const { h, s } = hexToHsl(hex);
  const neutralSaturation = isDark ? Math.min(18, Math.round(s * 0.18 + 5)) : Math.min(12, Math.round(s * 0.12 + 3));
  const lightness = isDark ? [98, 95, 88, 78, 60, 47, 35, 23, 14, 9, 5] : [96.5, 93, 87, 78, 62, 48, 37, 28, 21, 15, 11];
  const neutralVars = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
  const root = document.documentElement;

  neutralVars.forEach((step, index) => {
    root.style.setProperty(`--zinc-${step}`, `hsl(${h}, ${neutralSaturation}%, ${lightness[index]}%)`);
  });

  const baseS = Math.max(40, Math.min(95, s));
  [
    ["100", 94],
    ["200", 86],
    ["300", 70],
    ["400", 56],
    ["500", 46],
    ["600", 36],
    ["800", 20],
    ["900", 12],
  ].forEach(([step, l]) => {
    root.style.setProperty(`--accent-${step}`, `hsl(${h}, ${baseS}%, ${l}%)`);
  });
}

export function clearCustomTheme() {
  [
    "--zinc-50",
    "--zinc-100",
    "--zinc-200",
    "--zinc-300",
    "--zinc-400",
    "--zinc-500",
    "--zinc-600",
    "--zinc-700",
    "--zinc-800",
    "--zinc-900",
    "--zinc-950",
    "--accent-100",
    "--accent-200",
    "--accent-300",
    "--accent-400",
    "--accent-500",
    "--accent-600",
    "--accent-800",
    "--accent-900",
  ].forEach((name) => document.documentElement.style.removeProperty(name));
}
