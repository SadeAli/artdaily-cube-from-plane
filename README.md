# Cube From Plane 🎲

Grow one drawn face into a correct two-point-perspective cube. Trains
seeing edges as rays to vanishing points instead of "placing corners".

**The drill**: the sheet shows a horizon and one vertical face of a
cube. Drag three corner dots — far-bottom, far-top, top-back — until all
nine visible edges converge; press done. Three boxes per round, the right
VP pulling in each box. Every attempt ends with the true cube revealed
in the accent, edges extended faintly to the vanishing points (marked
with an × on the sheet, or an edge chevron when they lie beyond it).

**Real geometry**: the truth is an actual unit cube projected through a
real pinhole camera (`makeCube` in `js/game.js`) — the 90° constraint
ties the vanishing-point pair to the focal length, so the given square
face secretly fixes both VPs. Nothing about the answer is arbitrary: a
player who knows the measuring-point construction can derive it from
the sheet alone.

**Scoring** (pure functions at the top of `js/game.js`): per corner,
`err = dist(placed, true) / faceDiagonal`; a box scores
`100 · clamp(1 − mean(err)/0.30, 0, 1)` with a small perfect-zone so
100 is reachable — 1.5% of the diagonal by mouse, 3.5% by finger (touch
has no arrow-key fine nudge); the round is the mean of the three boxes,
reported 0–100. The reveal hint names the worst dot and its miss in px.
The dots start 25–33% of the diagonal off the truth, so pressing done
without moving anything can never clear 30 — the meter starts where the
looking starts.

**Run it**: `python3 -m http.server 8080` in this folder — plain
HTML/CSS/JS, zero build, zero deps, no tracking.

Part of [Art Daily](https://artdaily.sadeali.com/), a sketchbook of tiny
scored drills, from [sadeali.com](https://sadeali.com/).
