# Memory Index — vite-flare-starter

- [Starter is a pattern library, not a strip-and-build template](feedback_starter_as_pattern_library.md) — modules teach the AI how to build new modules in this stack; disable via flags, don't delete
- [ClawHQ artifact + document tools deferred from v1.2](project_artifact_tools_deferred.md) — Word/Excel/PowerPoint generation needs Cloudflare Containers; use run_python in sandbox as v1.2 alternative
- [TanStack adoption strategy](feedback_tanstack_adoption.md) — keep Query+Table, don't switch to Router/Start/Form, add optimistic updates incrementally
- [Chat bugs + fixes from live testing](project_chat_bugs_2026_04_15.md) — all 6 bugs fixed, security audit done, 16/16 models pass, UI improvements shipped
- [Always test with multiple accounts](feedback_multi_account_testing.md) — ownership/access control bugs only found via multi-account testing
- [Test existing features thoroughly before building new ones](feedback_test_before_new_features.md) — "done" means watched it work end-to-end, not "code exists"
- [Use Chrome MCP for logged-in views](feedback_chrome_for_logged_in_views.md) — Jez is already authenticated in Chrome; playwright-cli bounces to sign-in
- [Test live app after every non-trivial deploy](feedback_test_live_after_deploy.md) — type-check + build passing ≠ works; dogfood in Chrome before reporting "done"
