# 11 — Legal compliance (France & EU)

> ⚠️ **This is not legal advice, and I am not a lawyer.** This document is a
> *risk map*: a structured, good-faith survey of the laws that plausibly touch
> Crew Watch, written so the team (and future-Claude) can spot danger zones and
> know what to take to a real French lawyer / DPO / the CNIL. Robust legal
> *principles* are stated with confidence; **specific article numbers,
> penalties, thresholds and the digital-consent age are flagged "verify with
> counsel" — do not treat any number here as settled law.**
>
> Last reviewed: **2026-07-08**. Re-review whenever the app changes what personal
> data it collects, how it's distributed, or whether money changes hands.

---

## 0. TL;DR — the two things that decide "am I in trouble?"

1. **Is this a *private* tool or an *operated service*?** (§1) This single fact
   flips the entire GDPR picture. Everything else hangs off it.
2. **The database is a self-incriminating evidence trail.** (§2) It is a
   timestamped, geolocated log of people committing a criminal offence in France
   (usage de stupéfiants). Protecting *that* is as important as GDPR compliance —
   arguably more, for the users personally.

If you read nothing else, read §1 and §2.

---

## 1. The spine: private tool vs. operated service (GDPR Art. 2(2)(c))

GDPR has a **"purely personal or household activity" exemption** (Art. 2(2)(c)).
A private address book, or a tool you and friends you *personally know* use among
yourselves, generally falls *outside* GDPR. The moment you process the personal
data of people you **don't** personally know — as an operator running a service —
the exemption evaporates and you become a **data controller** with the full suite
of obligations.

Crew Watch straddles this line, and the codebase already contains the fact that
pushes it toward "operated service": the **operator console** (`is_operator`,
`admin_list_crews` / `admin_delete_crew_by_id` in `supabase-schema.sql`) lets one
account list and delete **every crew on the deployment**. If strangers can sign
up and you can see/moderate their data, a regulator will very likely call you a
controller of *their* special-category data.

### Mode A — PRIVATE TOOL (you + a known crew)
- Unlisted link, not advertised, no strangers' data on your Supabase project.
- Household exemption **plausibly** applies → GDPR recedes.
- **Main legal axis becomes French drug law** (§3), plus the evidence-trail risk
  (§2) which applies *regardless* of GDPR.

### Mode B — OPERATED SERVICE (strangers can sign up; you moderate all crews)
- You are a **data controller** of other people's health + location data.
- **Full GDPR attaches**: lawful basis + explicit consent (§4), information
  notice / privacy policy (§4.4), DPIA (§4.6), international-transfer rules
  (§4.5), 72h breach notification (§4.7), data-subject rights (§4.3).
- Everything in Mode A still applies on top.

### 🚧 Tripwires — the moment you cross from A into B
Treat **any** of these as flipping you into Mode B; if one is about to happen,
stop and get advice first:
- [ ] The sign-up/link is shared publicly, posted online, or advertised.
- [ ] People you don't personally know create accounts or crews.
- [ ] You use the operator console to view/moderate crews that aren't yours.
- [ ] Anyone other than you administers the Supabase project.
- [ ] You charge money, take donations, or run ads (also trips the TripSit
      licence, §6, and the medical-device analysis, §5).
- [ ] You publish it to an app store or list it in a directory.

**Design-to-stay-in-Mode-A** guidance is in §7.

---

## 2. Headline risk: the database is evidence

This is the most concrete "trouble" the *users* face, and it exists in **both
modes**, independent of GDPR.

- In France, **use of narcotics is itself a criminal offence** (usage de
  stupéfiants). Crew Watch stores, per person, **what they took, how much, when,
  and where** (`events` table + `profiles.lat/lng`). That is a
  self-incriminating, timestamped, geolocated confession log for every member.
- **Who can read it today?** Per `supabase-schema.sql`, `profiles`/`events`/
  `map_pins`/etc. have **permissive RLS (`using (true)`)** and the **anon key
  ships in the public JS bundle** (see RECAP §11, DEPLOY note). Scoping is only by
  the crew UUID. In practice: **anyone who obtains the deployed URL + the anon key
  + a crew UUID can read that crew's drug logs.** For special-category *and*
  criminal-conduct data, that is a genuine security inadequacy, not a footnote.
- **Seizure / breach exposure:** a lost phone, a subpoena to the hosting
  provider, or a database breach turns the whole store into evidence against the
  users.

**Mitigations (do these regardless of mode):**
- **Store in the EU.** Pick an EU region for the Supabase project (see §4.5).
- **Aggressive retention / auto-wipe.** ✅ *Built.* Locations are auto-forgotten
  once older than a configurable window — a global default (operator-set) plus a
  per-crew override, enforced by `wipe_stale_locations()` on a pg_cron schedule
  **and** re-run whenever the app is opened (fallback for DBs without pg_cron).
  Crew admins also get a one-tap **"Wipe locations now"** panic button. See
  `supabase-schema.sql` (app_settings / crew_settings / wipe_stale_locations),
  the store's `setLocationRetention` / `wipeLocations` / `setGlobalRetention`, and
  the controls in `ManageCrewScreen` / `OperatorConsole`. **Still TODO:** extend
  the same retention idea to old `events`. Data you don't keep can't be seized.
- **Tighten RLS / auth** before Mode B — real per-crew authorisation instead of
  `using (true)`, so the URL+anon-key alone can't read a crew. (Hardening path is
  noted in SETUP-SUPABASE.md and RECAP §11.)
- **Data minimisation:** don't collect precise dose/location unless it earns its
  safety value; prefer coarse/short-lived location.

---

## 3. French drug law — the line you must not cross

Harm reduction is on **solid legal ground** in France, but there is a bright line
next to it. Know both.

### 3.1 Your shield: harm reduction is legally protected
France has a **legally recognised harm-reduction policy** ("réduction des risques
et des dommages", RdR) embedded in the Code de la santé publique. Providing
*information and tools that reduce the risks* of drug use to people who use drugs
is a **protected public-health activity**, not a crime. Crew Watch is squarely in
this tradition: timers, mixing warnings, check-ins, SOS, "look out for each
other." **Keep every user-facing word framed as harm reduction**, factual and
non-judgemental (the RECAP already mandates this tone — it's also legal armour).

### 3.2 Your bright line: incitement / presenting drug use favourably
French law criminalises **provocation to use narcotics** and **presenting
narcotics use in a favourable light** ("présenter sous un jour favorable"),
*even where no one is actually incited*. This is the offence Crew Watch must stay
clear of. Practical rules:
- **Never glamorise, encourage, gamify or reward consumption.** No "streaks,"
  leaderboards, achievements, congratulatory copy, or anything that makes logging
  a dose feel like a win. (This also aligns with the RECAP's "never present
  warnings as guarantees, never celebrate use" tone.)
- **Never recommend a substance, a dose, a source, or a combination as
  desirable.** The app describes risks and durations; it must not read as "here's
  how to have a good time on X."
- **Warnings must dominate the framing**, not be buried under upbeat UI.
- The interaction chart and dose timers are **risk information**, presented as
  such — keep the `DISCLAIMER` prominent (`src/lib/substances.ts`).

### 3.3 Where you're clear: no trafficking / facilitation of supply
Crew Watch has **no marketplace, no sourcing, no "where to buy," no dealer
contact, no price info.** It does not facilitate acquisition or supply of
narcotics. **Keep it that way** — do not add any feature that helps users obtain,
sell, share, or locate substances. That would move you from harm-reduction into
facilitation of trafficking, a completely different and far more serious offence.

### 3.4 Advertising / public promotion
Publicly advertising a drug-related app can itself brush against the
incitement/publicity rules (§3.2) and flips you toward Mode B (§1). Keep
distribution **private and unlisted**; share by direct link, out-of-band.

> ⚠️ Verify with counsel: the exact CSP article numbers, the precise scope of
> "présentation sous un jour favorable" as applied to a private safety app, and
> penalties. The *principle* (harm reduction protected; incitement/favourable
> presentation prohibited; no facilitation of supply) is robust; the citations
> need a French lawyer.

---

## 4. GDPR (applies fully in Mode B; recedes but informs Mode A)

Even in Mode A, treating the data *as if* GDPR applied is good practice and good
protection for your friends. In Mode B it is mandatory.

### 4.1 This is special-category data (Art. 9)
Drug consumption is **health data** → **special category** under Art. 9. Precise
location is sensitive too. Special-category processing is **prohibited by default**
unless an Art. 9(2) exception applies. The workable one here is:
- **Art. 9(2)(a) — explicit consent.** Primary basis. Must be *explicit*,
  freely given, specific, informed, unambiguous, and **as easy to withdraw as to
  give**. A generic "I agree" checkbox is not enough for Art. 9 — the consent must
  specifically name the drug-use + location processing.
- **Art. 9(2)(c) — vital interests** as a **secondary** basis for the *emergency*
  path only (SOS, sharing location when someone is in danger and can't consent).
  Consent stays the primary basis for everyday logging; vital interests is the
  fallback that justifies acting in a genuine emergency.

**Action:** add an explicit, specific consent step (not a buried ToS click) that
names: drug-use logging, location sharing, who can see it (the crew), and how to
withdraw/delete. Record that consent was given.

### 4.2 Core principles to honour
- **Data minimisation & purpose limitation:** collect only what the safety
  purpose needs; don't repurpose it.
- **Storage limitation / retention:** define and enforce retention (see §2 —
  auto-wipe). Locations especially should be short-lived.
- **Security (Art. 32):** the permissive RLS + public anon key (§2) is the weak
  point. For special-category data, appropriate technical measures are expected
  → real authorisation before Mode B.

### 4.3 Data-subject rights
Members can request **access, rectification, erasure ("right to be forgotten"),
portability, and objection**. The app already has some erasure primitives (leave
crew, admin remove member, delete crew, `updateAccount`). For Mode B you need a
clear, honoured route for a user to get *their* data and to have it deleted on
request.

### 4.4 Information notice / privacy policy (Art. 13)
Mode B needs a **privacy notice** telling users: who the controller is (you, with
contact), what's collected, why, legal basis, who it's shared with (Supabase as
processor), where it's stored, retention, their rights, and how to complain to the
CNIL. There is currently **no privacy policy in the app** — add one before Mode B.

### 4.5 International transfers (Art. 44+)
If the Supabase project is in a **US region**, you're exporting special-category
data outside the EEA → you need a valid transfer mechanism (adequacy / SCCs) and
it raises the risk profile considerably. **Simplest fix: host the Supabase
project in an EU region** (also helps §2). Verify the current project's region and
move/recreate it in the EU if it isn't already.

### 4.6 DPIA (Art. 35)
Large-scale processing of special-category data, plus **systematic location
monitoring**, are exactly the factors that trigger a mandatory **Data Protection
Impact Assessment**. In Mode B, assume a **DPIA is required** and do it (the CNIL
publishes a free tool). Whether your *scale* legally forces it — verify with
counsel — but the safe assumption is yes.

### 4.7 Breach notification (Art. 33/34)
In Mode B, a personal-data breach must be notified to the **CNIL within 72 hours**,
and to affected users if high risk. Given the sensitivity here, essentially any
breach of this data is "high risk." Have a plan.

### 4.8 Children
Do not let minors use it. France sets a **digital-consent age** (commonly cited as
15 — *verify*) below which a parent must consent; more importantly, logging a
minor's drug use is an ethical and legal minefield. State **18+** and don't
knowingly onboard minors.

> ⚠️ Verify with counsel/CNIL: whether your scale legally mandates the DPIA, the
> exact digital-consent age, and whether Mode A truly qualifies for the household
> exemption in your specific setup.

---

## 5. Medical device? (EU MDR 2017/745)

Software that is intended for a **medical purpose** (diagnosis, prevention,
monitoring, treatment) can be a regulated **medical device**, which would be a
heavy compliance burden. Crew Watch is intended to sit **outside** this as a
**general information / harm-reduction tool**, and the disclaimers are what keep it
there. To stay outside:
- **Do not diagnose, treat, or calculate a "safe dose."** Timers are described as
  *rough population averages*, explicitly *not medical advice* — keep that framing
  (`DISCLAIMER` in `src/lib/substances.ts`; RECAP's "guidance never guarantee").
- Don't add features that compute personalised safe limits, interpret vitals, or
  tell a user they are/aren't at medical risk in an individualised way.
- Keep the interaction chart as **general reference information**, attributed to
  TripSit, not as a personalised medical recommendation.

If you ever add individualised medical-style outputs, get the MDR question
re-assessed. Verify borderline cases with counsel.

---

## 6. Third-party content licence — TripSit (CC BY-NC-SA)

The interaction chart data is transcribed from **TripSit's `combos.json`**, which
is **CC BY-NC-SA** (`src/lib/interactions.ts`, RECAP §8). That licence carries
three obligations:
- **BY (Attribution):** credit TripSit visibly. *Verify the app actually shows a
  TripSit credit in the Combos UI — add it if missing.*
- **NC (NonCommercial):** you may **not** use it commercially. Charging, ads, or
  paid tiers would **breach the licence** (and trip a Mode-B tripwire, §1).
- **SA (ShareAlike):** derivative distributions must be under the same licence.

While Crew Watch stays **free and private**, this is fine. Monetising it later
requires either dropping/relicensing this data or getting permission from TripSit.

---

## 7. Liability & "it's a safety tool" duty of care

A safety app that fails can create a **false sense of security**. Reduce exposure:
- **The SOS is not the emergency services.** It pings the crew, nothing more.
  The app must tell users, prominently, to **call real emergency numbers** —
  **112** (EU), **15** (SAMU), **18** (pompiers), **17** (police), or **114**
  (SMS/deaf) — in a real emergency. Do not let SOS imply it summons help.
- **Never present timers/warnings as guarantees.** Already the mandated tone;
  it's also liability protection.
- **Terms of use / disclaimer of liability:** add a short ToS making clear the app
  is an informational aid provided "as is," not medical/emergency service, use at
  own risk. (French consumer law limits how far you can disclaim, but stating it
  matters.)
- **Don't over-promise reliability:** location is foreground-only (PWA limit,
  RECAP §13); the app must not imply it tracks people when the phone is closed.

---

## 8. Lower-priority / likely-clear items

- **ePrivacy / cookies:** no third-party tracking, ads, or analytics → no cookie
  consent banner needed as things stand. If you ever add analytics, revisit.
- **Map tiles (CARTO):** free tiles, cached client-side; check CARTO's usage terms
  if traffic grows, but low risk while tiny and private.
- **DSA (Digital Services Act):** obligations scale with size/openness; a tiny
  private tool is far from the thresholds. Relevant only deep into Mode B.
- **Accessibility (EAA):** public commercial services face accessibility duties;
  a private free tool is out of scope, but good practice anyway.

---

## 9. Prioritised action checklist

**Do now (both modes):**
- [ ] Confirm the Supabase project is in an **EU region**; if not, migrate (§4.5, §2).
- [x] **Location retention auto-wipe** — built (global + per-crew window + panic
      wipe). *Still add one for old `events`, and enable pg_cron in the Supabase
      dashboard for true background wipes* (§2).
- [ ] Add a prominent **"in a real emergency call 112/15/18/17"** line near SOS (§7).
- [ ] Verify a **TripSit attribution** is visible in the Combos UI (§6).
- [ ] Keep the harm-reduction framing; **no gamification / no glamorising** (§3.2).
- [ ] State **18+**; don't onboard minors (§4.8).

**Do before Mode B (strangers / public / money):**
- [ ] Replace permissive RLS (`using(true)`) with real per-crew authorisation (§2, §4.2).
- [ ] Write and surface a **privacy notice / policy** (§4.4).
- [ ] Add an **explicit, specific Art. 9 consent** step (§4.1).
- [ ] Run a **DPIA** (§4.6) and prepare a **breach-response** plan (§4.7).
- [ ] Add a short **Terms of use / liability disclaimer** (§7).
- [ ] **Take this document to a French lawyer / DPO** and to the CNIL's guidance
      before opening up.

---

## 10. For future-Claude — when to consult this doc

**Before adding or changing anything that touches personal data, drug-use logging,
location, public distribution, or monetisation, read this file first and surface
any conflict to the user *before* implementing.** Concretely, flag it if a request
would:
- collect more/finer personal, health, or location data, or lengthen retention;
- widen who can read crew data, or move toward public/stranger sign-up (Mode B
  tripwire, §1);
- **gamify, reward, or glamorise consumption**, or recommend substances/doses/
  sources/combos as desirable (French drug-law line, §3.2);
- add anything that helps users **obtain/sell/share** substances (§3.3 — hard no);
- add individualised medical-style outputs (MDR risk, §5);
- introduce charging/ads/donations (GDPR Mode B + TripSit NC breach, §1/§6);
- weaken or hide the disclaimer / emergency-number messaging (§5/§7).

When in doubt, say so and point the user here rather than shipping it silently.
```
