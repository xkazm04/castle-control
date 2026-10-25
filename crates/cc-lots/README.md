# Offline draw eligibility (WP 2.1)

This crate contains Rust domain types only. It adds no schema, wire payload,
method, event kind, live subscription or RPC handler. The `lots.*` contract
remains Pending. It does not call `cc-verify` or implement seal, beacon, cast or
writ; those belong to WP 2.2. No code is copied from another project.

## Policy and consent

`check_draw(&DrawPolicy)` is pure and returns the existing `CheckResult` enum
with all applicable reasons. For prize draws:

- Paid entry and paid weight block independently. A subscriber-only eligibility
  filter warns; a required purchase must additionally be marked `paid_entry`.
- Total value above 500,000 USD cents blocks until registration is confirmed.
  Exactly 500,000 cents is below the block. Integer cents avoid rounding drift.
- Subscriber-only entry, points without a free equal-odds path, and missing
  age/region settings warn. Missing rules or the Twitch disclaimer block.
- Free entry with equal odds, rules and disclaimer is built into the defaults.
  Question, idea and seat draws have no giveaway-policy friction.

`GuardedDraw` owns an immutable configured-draw ID and settings. `unlock` logs
paid-entry/paid-weight consent; `confirm_registration` explicitly confirms an
over-cap prize's registration. Both append one typed `DrawRiskAcknowledged`
through `Store::append_ledger` **before** changing state. The event uses the
configured `DrawId` slug via store-local `DrawSlug`; the acknowledgement time
is the line's `event_at`, separate from `recorded_at`. An append error propagates
without unlocking anything. Repeating a completed acknowledgement on the same
value is a no-op and appends nothing. Each other blocker remains in force.
An unrelated setting is refused. Rules/disclaimer blocks cannot be overridden.

Configuration replacement/restart creates a fresh guarded value and requires
fresh consent; this offline package does not restore consent from storage.
The caller must check the guarded policy before authorizing a future draw.

## Pools and winner constraints

`PassedMessage` can be constructed only from `Verdict::Pass`. Its payload is
private; `Roll::intake` accepts no raw messages or unfiltered events. The future
adapter must supply verified follower/subscriber/redemption/cohort facts after
moderation. Chat text grants no membership. No message text is retained by a
roll. Activity units are nonmonetary; this crate consumes no contribution events.

Pools cover chatters, followers, subscribers, redeemers and case-insensitive
keyword tokens. Intake deduplicates by Twitch user ID and excludes cooldowns.
An enabled free `!join` path admits nonmembers too and forces **all** entries to
equal weight, including restricted-pool members.

`validate_winners` checks an externally derived, complete result: the exact
positive configured count, unique eligible entrants, cooldowns, and every
cohort's cap. Caps are rational fractions rounded down against the complete
configured winner count. Overlapping cohorts each apply. `record_winners`
validates the whole set before updating any cooldown history. `clear_entries`
opens the next pool while retaining history. Time reversal never bypasses a
cooldown; eligibility resumes exactly at its expiry. These operations never
choose winners or authorize publication. History is in memory in this prep cut.

## Published weight data

Equal is the default curve. The alternative is an exact, capped, concave integer
curve with cap `c > 0`, nonmonetary activity `u`, and `n = min(u, c)`:

`weight(u) = c + n * (2*c - n + 1) / 2`

Its successive increments are `c, c-1, ..., 1, 0, ...`; there is no floating-point
rounding or lottery sampling. For cap 10, units 0/5/10 weigh 10/50/65.
`weight_table` exposes each eligible user's weight, the newcomer baseline, the
heaviest current weight, and the smallest number of newcomers whose combined
weight strictly exceeds it (7 in that example). An empty table has no comparison.

## Acceptance evidence

Run `cargo test --offline --locked -p cc-lots`. Fixtures are generated simulated
messages and isolated simulated stores; no real chat or network is used.

| Acceptance | Named tests |
| --- | --- |
| Barred/held messages cannot enter | `barred_and_held_messages_never_create_a_lot` |
| All pool restrictions | `each_pool_checks_its_post_verdict_membership`, `keywords_match_tokens_and_chat_claims_do_not_grant_membership` |
| All giveaway table rows | `paid_entry_and_paid_weight_on_prizes_are_blocked_with_reasons`, `over_5000_usd_requires_registration_and_boundary_is_exact`, `subscriber_only_and_points_without_free_path_warn`, `missing_age_and_region_warn_and_all_reasons_accumulate`, `no_prize_content_has_no_giveaway_friction`, `free_equal_odds_prize_with_rules_and_disclaimer_is_ok` |
| Exact typed audit and failed append | `unlock_appends_exactly_one_typed_acknowledgement_before_effect`, `unlock_fails_without_changing_policy_when_ledger_append_fails`, `unrelated_unlock_is_refused_and_configuration_changes_reset_consent` |
| Cooldowns and cohort caps, 10,000 cases each | `cooldown_holds_in_10000_cases`, `cohort_cap_holds_in_10000_cases` |
| Concavity, 10,000 cases | `non_equal_weight_curve_is_concave_in_10000_cases` |
| Equal free entry and published weights | `free_join_admits_non_subscribers_with_equal_odds`, `weight_table_publishes_exact_newcomer_comparison` |

Seeded mutation checks (2026-10-25): admitting Bar while still rejecting Hold
made the barred-message test exit 1; ignoring `append_ledger`'s error made the
failed-append test exit 1. Both mutations were restored before final gates.
