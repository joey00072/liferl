import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../styles.css";

export const metadata: Metadata = {
  title: "LifeRL",
  description: "Markdown-backed daily habit dashboard.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#10b981",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const savedTheme = localStorage.getItem('liferl-theme');
                  const theme = savedTheme ? savedTheme : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                  const preset = localStorage.getItem('liferl-theme-preset') || 'rose';
                  
                  if (theme === 'dark') {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }

                  if (preset === 'slate') {
                    document.documentElement.removeAttribute('data-theme');
                  } else if (preset === 'custom') {
                    document.documentElement.removeAttribute('data-theme');
                    const hex = localStorage.getItem('liferl-custom-seed') || '#10b981';
                    const shorthandRegex = /^#?([a-f\\d])([a-f\\d])([a-f\\d])$/i;
                    const fullHex = hex.replace(shorthandRegex, function(_, r, g, b) { return r + r + g + g + b + b; });
                    const result = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(fullHex);
                    if (result) {
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
                          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                          case g: h = (b - r) / d + 2; break;
                          case b: h = (r - g) / d + 4; break;
                        }
                        h /= 6;
                      }
                      h = Math.round(h * 360);
                      s = Math.round(s * 100);
                      
                      const isDark = theme === 'dark';
                      const neutralSaturation = isDark ? Math.min(18, Math.round(s * 0.18 + 5)) : Math.min(12, Math.round(s * 0.12 + 3));
                      const lightness = isDark ? [98, 95, 88, 78, 60, 47, 35, 23, 14, 9, 5] : [96.5, 93, 87, 78, 62, 48, 37, 28, 21, 15, 11];
                      const neutralVars = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
                      const root = document.documentElement;
                      
                      neutralVars.forEach(function(step, index) {
                        root.style.setProperty('--zinc-' + step, 'hsl(' + h + ', ' + neutralSaturation + '%, ' + lightness[index] + '%)');
                      });
                      
                      const baseS = Math.max(40, Math.min(95, s));
                      const accentSteps = [
                        ['100', 94],
                        ['200', 86],
                        ['300', 70],
                        ['400', 56],
                        ['500', 46],
                        ['600', 36],
                        ['800', 20],
                        ['900', 12]
                      ];
                      accentSteps.forEach(function(pair) {
                        root.style.setProperty('--accent-' + pair[0], 'hsl(' + h + ', ' + baseS + '%, ' + pair[1] + '%)');
                      });
                    }
                  } else {
                    document.documentElement.setAttribute('data-theme', preset);
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
