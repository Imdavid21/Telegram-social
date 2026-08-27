# UI consolidation debt

The live client currently loads multiple historical style layers. They are intentionally not deleted in the BYOK privacy change because doing so without screenshot regression coverage could silently break the production shell.

Consolidation target:

1. Keep `shadcn.css` for component primitives.
2. Create one product-shell stylesheet for navigation, feed layout, context rail, search, settings, and responsive behavior.
3. Keep landing/demo styles isolated to their routes.
4. Migrate live selectors from `production.css`, `feed.css`, `feed-engine.css`, `identity.css`, `app-system.css`, `session-boot.css`, `ux-overhaul.css`, `instagram-desktop.css`, `backend-search.css`, and `social-system.css` into the owned layer.
5. Delete a legacy file only when no live selector remains and desktop/mobile screenshot checks pass.

This is a structural refactor, not a safe blind deletion task.
