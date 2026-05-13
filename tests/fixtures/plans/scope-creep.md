# Plan: Add Dark Mode to Dashboard

## Objective
Add a dark mode toggle to the existing dashboard application, as requested in ticket #4821.

## Scope

The ticket asks for a CSS theme toggle. This plan expands the scope to include:

### Dark Mode (requested)
- Toggle button in top navigation
- CSS custom properties for color theming
- User preference persisted in localStorage

### Additional Features (proposed additions)
- Full design system overhaul with new typography scale
- Accessibility audit and WCAG 2.1 AA compliance fixes for all 47 pages
- New icon set replacement (Heroicons → Phosphor Icons)
- Component library migration from custom CSS to Tailwind CSS
- Animation system with Framer Motion for all state transitions
- New onboarding flow with multi-step wizard

## Implementation
- 3 frontend engineers, 14 weeks
- Design system work: 6 weeks
- Dark mode: 2 weeks
- Icon migration: 2 weeks
- Accessibility: 4 weeks

## Acceptance Criteria
- Dark mode toggle works (original requirement)
- All components use new design system
- 100% Lighthouse accessibility score
