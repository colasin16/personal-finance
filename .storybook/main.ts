import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import type { StorybookConfig } from "@storybook/nextjs-vite";

// Server actions reach the database, so stories get in-browser stand-ins from .storybook/mocks/actions.
const MOCKED_ACTIONS = ["auth", "household", "preferences", "transactions"];

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-themes"],
  framework: { name: "@storybook/nextjs-vite", options: {} },
  core: { disableTelemetry: true },
  viteFinal: (config) => {
    const actionMocks = MOCKED_ACTIONS.map((name) => ({
      find: `@/lib/actions/${name}`,
      replacement: path.resolve(import.meta.dirname, `mocks/actions/${name}.ts`),
    }));
    const existing = config.resolve?.alias;
    const aliases = Array.isArray(existing) ? existing : Object.entries(existing ?? {}).map(([find, replacement]) => ({ find, replacement }));
    config.resolve = { ...config.resolve, alias: [...actionMocks, ...aliases] };
    // The app compiles Tailwind with the Turbopack loader (next.config.ts); Vite needs its own plugin.
    config.plugins = [...(config.plugins ?? []), tailwindcss()];
    return config;
  },
};

export default config;
