import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { StaticImageData } from "next/image";
import cards from "./brand-icons/cards.svg";
import monogram from "./brand-icons/monogram.svg";
import orbit from "./brand-icons/orbit.svg";
import prism from "./brand-icons/prism.svg";
import streams from "./brand-icons/streams.svg";

type Concept = { name: string; src: StaticImageData; idea: string; chosen?: boolean };

const CONCEPTS: Concept[] = [
  { name: "Converging streams", src: streams, idea: "Three bank-coloured lines merge into one bold line: many banks, one place.", chosen: true },
  { name: "Stacked cards → donut", src: cards, idea: "Offset bank cards with a spending donut cut through them: accounts become insight." },
  { name: "Orbit", src: orbit, idea: "Your money as a planet with accounts orbiting it, a nod to “space”." },
  { name: "pf monogram", src: monogram, idea: "The bowl of the “p” is a category donut; reads as the app initials at favicon size." },
  { name: "Prism", src: prism, idea: "Coloured beams enter a prism and leave as one clear beam: messy data into clarity." },
];

const SIZES = [128, 64, 32, 16];

function BrandIconConcepts() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
      {CONCEPTS.map((c) => (
        <figure key={c.name} className="flex flex-col gap-4 rounded-xl border bg-card p-5">
          <div className="flex items-end gap-4">
            {SIZES.map((size) => (
              // eslint-disable-next-line @next/next/no-img-element -- Storybook-only preview of raw SVG assets
              <img key={size} src={c.src.src} alt={size === SIZES[0] ? c.name : ""} width={size} height={size} />
            ))}
          </div>
          <figcaption className="space-y-1">
            <p className="font-medium">
              {c.name}
              {c.chosen && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">In use</span>}
            </p>
            <p className="text-sm text-muted-foreground">{c.idea}</p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

const meta = {
  title: "Brand/App icon concepts",
  component: BrandIconConcepts,
  parameters: { layout: "padded" },
} satisfies Meta<typeof BrandIconConcepts>;

export default meta;

/** The app-icon explorations, each shown at 128/64/32/16px to judge legibility. “Converging streams” ships as src/app/icon.svg. */
export const AllConcepts: StoryObj<typeof meta> = {};
