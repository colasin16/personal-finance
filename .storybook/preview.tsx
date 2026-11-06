import type { Decorator, Preview } from "@storybook/nextjs-vite";
import { withThemeByClassName } from "@storybook/addon-themes";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { AmountsVisibilityProvider } from "../src/components/privacy/amounts-visibility";
import { Toaster } from "../src/components/ui/sonner";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { DEFAULT_LOCALE, LOCALES, LOCALE_NAMES, type Locale } from "../src/i18n/config";
import "../src/app/globals.css";

// Same fonts as src/app/layout.tsx, whose variables globals.css relies on.
const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
document.documentElement.classList.add(geistSans.variable, geistMono.variable, "antialiased");

const files = import.meta.glob<{ default: Record<string, unknown> }>("../messages/*/*.json", { eager: true });
const messages: Record<string, Record<string, unknown>> = {};
for (const [file, mod] of Object.entries(files)) {
  const [, locale, namespace] = file.match(/messages\/([^/]+)\/([^/]+)\.json$/)!;
  (messages[locale!] ??= {})[namespace!] = mod.default;
}

const withIntl: Decorator = (Story, { globals }) => {
  const locale = (globals.locale as Locale | undefined) ?? DEFAULT_LOCALE;
  const hidden = globals.amounts === "hidden";
  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="Europe/Madrid">
      <AmountsVisibilityProvider key={String(hidden)} initialHidden={hidden}>
        <TooltipProvider delayDuration={200}>
          <Story />
        </TooltipProvider>
      </AmountsVisibilityProvider>
      <Toaster richColors position="bottom-right" />
    </NextIntlClientProvider>
  );
};

const preview: Preview = {
  parameters: {
    nextjs: { appDirectory: true },
    layout: "padded",
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
  globalTypes: {
    locale: {
      description: "Language",
      toolbar: { icon: "globe", items: LOCALES.map((value) => ({ value, title: LOCALE_NAMES[value] })), dynamicTitle: true },
    },
    amounts: {
      description: "Incognito mode (hide amounts)",
      toolbar: {
        icon: "eye",
        items: [
          { value: "shown", title: "Amounts shown", icon: "eye" },
          { value: "hidden", title: "Amounts hidden", icon: "eyeclose" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { locale: DEFAULT_LOCALE, amounts: "shown" },
  decorators: [withIntl, withThemeByClassName({ themes: { light: "", dark: "dark" }, defaultTheme: "light" })],
};

export default preview;
