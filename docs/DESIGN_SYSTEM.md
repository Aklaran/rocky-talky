# Design System

Basecamp uses **Tailwind CSS** + **shadcn/ui** with CSS custom properties for theming.

## Theme

Colors are defined as HSL values in CSS custom properties. Both light and dark modes are supported.

```css
/* Light mode (default) */
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --primary: 240 5.9% 10%;
  --primary-foreground: 0 0% 98%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;
  --destructive: 0 84.2% 60.2%;
  /* ... */
}

/* Dark mode */
.dark {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  /* ... */
}
```

## Installed Components

shadcn/ui components live in `app/frontend/src/components/ui/` as source code (not packages):

| Component | Import |
|-----------|--------|
| `AlertDialog` | `@/components/ui/alert-dialog` |
| `Avatar` | `@/components/ui/avatar` |
| `Button` | `@/components/ui/button` |
| `Card` | `@/components/ui/card` |
| `Dialog` | `@/components/ui/dialog` |
| `DropdownMenu` | `@/components/ui/dropdown-menu` |
| `Input` | `@/components/ui/input` |
| `Label` | `@/components/ui/label` |
| `ScrollArea` | `@/components/ui/scroll-area` |
| `Separator` | `@/components/ui/separator` |
| `Skeleton` | `@/components/ui/skeleton` |
| `Textarea` | `@/components/ui/textarea` |
| `Tooltip` | `@/components/ui/tooltip` |

### Adding a Component

```bash
cd app/frontend
npx shadcn@latest add <component> --yes
```

Components are source code — customize freely.

## Conventions

### Spacing

Use Tailwind's default scale: `p-2` (0.5rem), `p-4` (1rem), `gap-3` (0.75rem), etc.

### Color Usage

Always use semantic color names:

| Purpose | Class | Variable |
|---------|-------|----------|
| Page background | `bg-background` | `--background` |
| Primary text | `text-foreground` | `--foreground` |
| Buttons, links | `bg-primary` | `--primary` |
| Secondary content | `text-muted-foreground` | `--muted-foreground` |
| Errors | `text-destructive` | `--destructive` |
| Hover states | `hover:bg-accent` | `--accent` |

Never use raw colors (`bg-blue-500`). Use semantic tokens so themes work.

### Layout Patterns

**Page layout (chat):**
```
┌──────────┬────────────────────────┐
│ Sidebar  │ Content                │
│ (w-72)   │                        │
│          │  Header (border-b)     │
│ List     │  Message list (flex-1) │
│          │  Input (border-t)      │
└──────────┴────────────────────────┘
```

**Card layout (login):**
```
┌──────────────────────────────┐
│   Centered Card (max-w-md)   │
│   ┌──────────────────────┐   │
│   │  Header              │   │
│   │  Content (form)      │   │
│   │  Footer (actions)    │   │
│   └──────────────────────┘   │
└──────────────────────────────┘
```

### Icons

Using [Lucide React](https://lucide.dev/icons/). Import individually:

```tsx
import { Bot, User, Plus, LogOut, Trash2 } from 'lucide-react'
```

### Loading States

- **Skeleton** for initial data loading (preserves layout shape)
- **Spinner** (`Loader2` + `animate-spin`) for actions in progress
- **Disabled state** on buttons during mutations

### Dark Mode

The `dark` class is applied to `<html>`. Currently follows system preference via the CSS `@media (prefers-color-scheme: dark)` or can be toggled manually by adding/removing the `dark` class.

To test both themes during development, toggle the class in browser DevTools:
```js
document.documentElement.classList.toggle('dark')
```
