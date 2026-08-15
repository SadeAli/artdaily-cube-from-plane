# Cube From Plane 🎲

Grow one drawn face into a correct two-point-perspective cube. Trains
seeing edges as rays to vanishing points instead of "placing corners".

**The drill**: the sheet shows a horizon and one vertical face of a box.
Drag three corner dots — far-bottom, far-top, top-back — until all nine
visible edges converge; press done. Three boxes per round, the VPs
creeping closer each box. Every attempt ends with the true cube revealed
in mint, edges extended faintly to the vanishing points.

**Scoring** (pure functions at the top of `js/game.js`): per corner,
`err = dist(placed, true) / faceDiagonal`; a box scores
`100 · clamp(1 − mean(err)/0.30, 0, 1)` (tiny perfect-zone so 100 is
reachable); the round is the mean of the three boxes, reported 0–100.

**Run it**: `python3 -m http.server 8080` in this folder — plain
HTML/CSS/JS, zero build, zero deps, no tracking.

Part of [Art Daily](https://artdaily.sadeali.com/), a sketchbook of tiny
scored drills, from [sadeali.com](https://sadeali.com/).
