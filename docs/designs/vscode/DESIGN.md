---
name: High-Fidelity Terminal
colors:
  surface: '#0c150d'
  surface-dim: '#0c150d'
  surface-bright: '#323c32'
  surface-container-lowest: '#071008'
  surface-container-low: '#151e15'
  surface-container: '#192219'
  surface-container-high: '#232c23'
  surface-container-highest: '#2e372d'
  on-surface: '#dbe6d7'
  on-surface-variant: '#bacbb8'
  inverse-surface: '#dbe6d7'
  inverse-on-surface: '#293329'
  outline: '#849583'
  outline-variant: '#3b4b3c'
  surface-tint: '#00e46a'
  primary: '#f4fff0'
  on-primary: '#003915'
  primary-container: '#38ff7e'
  on-primary-container: '#007231'
  inverse-primary: '#006e2f'
  secondary: '#c3c6cf'
  on-secondary: '#2d3137'
  secondary-container: '#454950'
  on-secondary-container: '#b5b8c1'
  tertiary: '#fffbf9'
  on-tertiary: '#3e2e00'
  tertiary-container: '#ffdb86'
  on-tertiary-container: '#795f16'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#66ff8e'
  primary-fixed-dim: '#00e46a'
  on-primary-fixed: '#002109'
  on-primary-fixed-variant: '#005322'
  secondary-fixed: '#dfe2eb'
  secondary-fixed-dim: '#c3c6cf'
  on-secondary-fixed: '#181c22'
  on-secondary-fixed-variant: '#43474e'
  tertiary-fixed: '#ffdf96'
  tertiary-fixed-dim: '#e5c370'
  on-tertiary-fixed: '#251a00'
  on-tertiary-fixed-variant: '#5a4400'
  background: '#0c150d'
  on-background: '#dbe6d7'
  surface-variant: '#2e372d'
  terminal-black: '#010409'
  status-error: '#F85149'
  status-warning: '#E3B341'
  status-inconclusive: '#8B949E'
  border-subtle: '#30363D'
typography:
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  status-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-panel: 12px
  stack-xs: 4px
  stack-sm: 8px
  stack-md: 16px
---

## Brand & Style

The design system is a fusion of Terminal UI (TUI) efficiency and modern IDE sophistication. It targets professional software engineers who value speed, precision, and low-latency feedback loops. 

The aesthetic is **Corporate Modern with a Brutalist edge**. It leverages heavy-duty utility and high information density while maintaining the polish of a premium VS Code extension. The brand personality is authoritative and technical, using crisp lines, monospaced accents, and a "dashboard-first" mentality to communicate security and code quality. 

Key visual principles include:
- **Functional Density:** Prioritizing information over whitespace.
- **Status-Driven UI:** Using color strictly to denote the health of the codebase.
- **Monospaced Hierarchy:** Treating code and technical identifiers as first-class citizens.

## Colors

This design system utilizes a high-contrast dark palette to reduce eye strain during deep work. 

The **Primary Color (OpenShrike Green)** is reserved for "Passed" states and primary success actions, mirroring the high-visibility neon green of a successful terminal scan. The **Secondary Color** follows VS Code's "Deep Dark" syntax, providing a foundation for high-contrast text.

**Functional Accents:**
- **Error Red:** Immediate attention for failed checks.
- **Warning Orange:** Non-blocking issues or performance suggestions.
- **Neutral Grays:** Used for secondary metadata (Check IDs, file paths) and structural borders.

## Typography

Typography is bifurcated into two roles: **Narrative (Hanken Grotesk)** and **Technical (JetBrains Mono)**.

- **Hanken Grotesk** handles the UI shell, explanations, and headers. It provides a modern, legible contrast to the rigid code views.
- **JetBrains Mono** is used for all output data, including Check IDs (e.g., `BP-SEC-001`), terminal commands, and status labels. 

Large headings are kept relatively small (max 24px) to preserve screen real estate for code snippets. Status labels often use all-caps with increased letter-spacing to mimic TUI headers.

## Layout & Spacing

The layout follows a **Fixed Grid** model typical of IDEs. The screen is divided into functional panels: an Activity Bar (narrow left), Sidebar (standard left), and a Main Content Area.

**Spacing Rhythm:**
- A base unit of **4px** is used for all internal component spacing.
- Panels are separated by a **1px border** rather than wide gutters to maximize the "Command Center" feel.
- Content within cards uses a compressed 8px/12px padding to ensure high density of information, allowing developers to see more check results without scrolling.

**Adaptive Reflow:**
- **Desktop:** 3-column layout (Navigation | List | Details).
- **Tablet:** 2-column layout (Navigation | List), with Details appearing in a slide-over or full-screen view.
- **Mobile:** Single column focus, primarily for viewing scan results on the go.

## Elevation & Depth

This system rejects shadows in favor of **Tonal Layers and Low-Contrast Outlines**. Depth is created through background color shifts rather than physical light metaphors.

- **Layer 0 (Background):** Terminal Black (`#010409`) for the main workspace.
- **Layer 1 (Containers):** VS Code Dark (`#0D1117`) for sidebars and header bars.
- **Layer 2 (Interactive):** Subtle background shifts on hover or focus using `#21262D`.
- **Separation:** All panels and cards are defined by a `1px` solid border (`#30363D`). This creates a sharp, structured grid that feels engineered and robust.

## Shapes

The shape language is primarily **Soft (0.25rem)**. While the TUI roots suggest sharp corners, the modern IDE aesthetic benefits from a slight rounding to soften the technical density.

- **Buttons & Tags:** Use `rounded-sm` (4px) to appear as distinct, clickable objects.
- **Status Chips:** Use `rounded-lg` (8px) or pill shapes to distinguish them from standard buttons.
- **Code Blocks:** Maintain sharp `0px` corners on the left side to align with line numbers, but use `4px` on the outer container.

## Components

### Buttons
Primary buttons use the 'OpenShrike Green' with black text for maximum contrast. Secondary buttons are "Ghost" style—transparent backgrounds with a subtle gray border, turning white on hover.

### Status Chips (Checks)
Used to display the result of a scan. 
- **Pass:** Green background, dark text, prefixed with `[v]`.
- **Fail:** Red background, white text, prefixed with `[x]`.
- **Warning:** Orange background, dark text, prefixed with `[~]`.

### Lists
Checklists utilize a "TUI selection" style. The active item is indicated by a primary-colored vertical bar on the left and a subtle background highlight. Typography in lists should be exclusively monospaced for IDs and status indicators.

### Progress Bars
The "Scan Progress" bar is a multi-segmented element. It does not use gradients; instead, it uses hard-stop blocks of color (Red/Orange/Green) to represent the current distribution of check results in real-time.

### Input Fields
Inputs are styled as "Command Lines." They use a dark background, a 1px border on all sides, and a JetBrains Mono typeface. The focus state is a 1px solid Primary Green border with no outer glow.

### Cards (Check Details)
Cards are used to wrap "Why" and "Evidence" sections. They feature a monospaced header label (e.g., `EVIDENCE`) in a subtle gray, followed by a code block with syntax highlighting.