# FREEBUFF MISSION — NO HOPE MAP 01: BROKEN PARISH

## Priority

Implement the first real gameplay map for **No Hope**.

This is **not** an image-generation task.
Do **not** use Higgsfield, OpenGenerative, video, image models, paid APIs, or credits.

## Source Files

Use these files as the mission source:

- `data/no-hope-map-v1.json`
- `docs/no-hope-map-v1.md`

## Objective

Load `map01_broken_parish` as structured gameplay data in the existing `grimdark-sim` / No Hope simulation.

The map must become part of the game model, not only visual decoration.

## Required Map Features

The JSON defines:

- logical map size: `256x256`
- 5 capture objectives
- blue, red, and future undead spawn zones
- terrain zones
- trench lines
- cover zones
- line-of-sight blockers
- roads
- danger zones
- future infection zones
- AI hints
- validation rules

## Implementation Requirements

1. Add a map loading layer.
2. Keep the simulation separated from rendering.
3. Validate map data before use.
4. Render the map layers in the existing 2.5D/isometric view if possible.
5. Do not widen scope into zombies, full pathogen sim, ragdolls, or physics.
6. Future undead zones must exist in data but remain inactive unless the undead system is enabled.
7. Keep runtime dependencies at zero unless an existing project dependency already handles JSON/schema validation.

## Tests Required

Add focused tests proving:

- map JSON parses successfully;
- map size is `256x256`;
- all objectives are inside bounds;
- all spawn zones are inside bounds;
- all line-of-sight blockers are inside bounds;
- all infection zones are inside bounds;
- exactly 5 objectives exist;
- objectives have unique IDs;
- spawn zones have valid sides: `blue`, `red`, `undead`;
- infection zones do not affect combat while undead is disabled;
- loading the map does not break existing headless simulation tests.

## Acceptance Criteria

Freebuff must report:

- changed files;
- tests added;
- test commands run;
- pass/fail status;
- whether the map is rendered, loaded only, or both;
- any remaining gaps.

## Forbidden

- Do not generate images.
- Do not animate the reference image.
- Do not spend Higgsfield credits.
- Do not call paid AI APIs.
- Do not merge to main.
- Do not rewrite the whole renderer.
- Do not implement full zombies yet.
- Do not implement full pathogen/cell system yet.

## Short User Intent

No Hope needs a real modeled battlefield first.

The map must support Men of War / Call to Arms style tactical play:

- squads;
- cover;
- suppression;
- morale;
- trenches;
- defilade;
- capture points;
- future corpse and zombie systems.

The first map is **Broken Parish**.


