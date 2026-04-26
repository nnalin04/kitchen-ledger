# UI Resources & Libraries (Mandatory for All UI Work)

When building or modifying any UI in `apps/web` or `apps/mobile`, you MUST use the resources below.
Do not reach for raw CSS, ad-hoc animations, or one-off component code when these libraries cover the need.

---

## 1. Motion — Animation Library

**Package:** `motion` (Framer Motion v11+ unified package)

```bash
npm install motion
```

**Import:**
```ts
import { motion, AnimatePresence } from 'motion/react'
```

**When to use:**
- Page/route transitions
- Modal and drawer enter/exit animations
- List item add/remove (layout animations)
- KPI card number counting-up effects
- Loading skeletons and skeleton-to-content swaps
- Micro-interactions: button press, toast slide-in, alert pulse

**Rules:**
- Prefer `layout` prop over manually animating width/height
- Use `AnimatePresence` for any conditional render that needs an exit animation
- Keep `duration` ≤ 0.3s for interactive feedback; ≤ 0.6s for page transitions
- Never animate `opacity` alone — pair with `y` or `scale` for polish
- Respect `prefers-reduced-motion`: wrap variants behind a `useReducedMotion()` check

---

## 2. 21st.dev Community Components

**Source:** https://21st.dev/community/components

**What it is:** A curated registry of open-source, copy-paste React components built with Tailwind + shadcn/ui conventions.

**When to use:**
- Before writing a new UI component from scratch, search 21st.dev first
- Ideal for: data tables, stat cards, timeline views, badge variants, command palettes, charts wrappers, empty states, onboarding flows

**Workflow:**
1. Browse or search 21st.dev for a component matching the need
2. Copy the component source into the appropriate location:
   - Shared/reusable → `packages/ui/src/components/`
   - Page-specific → `apps/web/components/<feature>/`
3. Adapt props and types to match KitchenLedger's TypeScript strict-mode standards
4. Replace any hardcoded colors with Tailwind semantic tokens from `packages/ui`

---

## 3. UI/UX Pro Max Skill

**Source:** https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

**What it is:** A Claude skill file that encodes 50+ design styles, 161 color palettes, 57 font pairings, 99 UX guidelines, and 25 chart types — a reference layer for making design decisions.

**When to use:**
- Designing a new screen or dashboard layout from scratch
- Choosing a color palette, font pairing, or chart type for a feature
- Auditing an existing screen for visual hierarchy and spacing issues
- Use via the `/ui-ux-pro-max` skill in this project

**Key guidance from the skill to keep in mind always:**
- Visual hierarchy: size → weight → color → spacing (in that priority order)
- Touch targets: minimum 44×44px on mobile, 36×36px on desktop
- Spacing scale: use Tailwind's 4-point grid (4, 8, 12, 16, 24, 32, 48, 64)
- Charts: use the right type — bar for comparison, line for trend, donut for proportion; never pie for >5 segments
- Empty states must always include an icon, a headline, a subtext, and a CTA

---

## Decision Tree for New UI Work

```
Need a new component?
  └─ Search 21st.dev first
       ├─ Found → copy, adapt to KitchenLedger types, add to packages/ui
       └─ Not found → build with shadcn/ui primitives + Tailwind tokens

Need animation?
  └─ Use `motion` — import from 'motion/react'
       ├─ Enter/exit → AnimatePresence + variants
       ├─ Layout shift → layout prop
       └─ Number/counter → useMotionValue + useTransform

Need design direction?
  └─ Run /ui-ux-pro-max skill for palette, typography, and UX guidelines
```

---

## Package Installation

These must be present in `apps/web/package.json` and `apps/mobile/package.json` as needed:

```bash
# Web
cd apps/web && npm install motion

# Mobile (Expo — use reanimated instead for RN)
cd apps/mobile && npx expo install react-native-reanimated
```

> On mobile, use `react-native-reanimated` (Expo-compatible) instead of `motion`.
> The `motion` package is for web (React DOM) only.
