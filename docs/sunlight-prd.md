# Buurt-check Sunlight v1 Spec

This spec defines **what buurt-check computes**, **how it computes it client-side in Three.js**, **how it is sampled**, **what you show users**, and **how you validate**—while explicitly separating *geometry-only visibility* from *irradiance/energy* so you don’t over-claim.

---

## 1) Definitions

### 1.1 What buurt-check measures (and what it does not)

Buurt-check must treat “sunlight potential” as two different classes of outputs:

1. **Time-based geometric visibility (direct sun visibility hours)**
   Binary question at each time step: *is the sun above the horizon and unobstructed by geometry from a chosen evaluation point/surface?* This is the core of direct sun-hours tools and can be computed purely geometrically. 

2. **Energy-based radiation (irradiance/irradiation)**
   Solar engineering decomposes radiation into **DNI (direct normal)**, **DHI (diffuse horizontal)** and **GHI (global horizontal)**; practical relationship is often expressed as **GHI ≈ DHI + DNI · cos(Z)** (Z = solar zenith angle). 

3. **Sunshine duration (WMO-style)**
   Many users mean “hours of sun” as *sunshine duration*, which includes a **direct-beam irradiance threshold** (commonly 120 W/m²). Geometric visibility alone does **not** equal sunshine duration.  

4. **Daylighting standards (EN 17037) and municipal practice (TNO bezonningsnorm)**

* **EN 17037** frames sunlight exposure on reference dates with typical “1.5 / 3 / 4 hours” exposure levels.  
* The **TNO bezonningsnorm** provides Dutch “possible sun hours” thresholds (lichte/strenge) that municipalities often use; these are still *geometry/clear-sky* oriented (reference point concept). 

### 1.2 Why diffuse cannot be ignored in NL

In the Netherlands’ maritime climate, **diffuse radiation is often a large fraction of annual total**; therefore direct-beam-only analysis can systematically under-represent overall light/radiation potential. 
A practical geometric proxy for diffuse access is **Sky View Factor (SVF)**, which measures the visible portion of the sky hemisphere from a point/surface. 

---

## 2) Algorithms

This spec defines a **Baseline** implementation you can ship now (fully client-side, defensible), plus **Upgrade hooks** you can add without breaking the product narrative.

### 2.1 Sun positions

* Use a solar position routine to generate sun **azimuth/elevation** vectors for a location and set of timestamps. (Your current approach already does this conceptually.) 
* Only compute timesteps where **solar altitude > 0°** (sun above horizon). 

### 2.2 Direct sun visibility (binary) – two compute paths

#### Path A (Baseline, scalable): GPU shadow-map occlusion + accumulation

Use Three.js **DirectionalLight** shadow mapping (orthographic shadow camera) to render a depth map from the sun’s perspective; then classify each evaluation sample as lit/shadowed by comparing depths in light space.  

**Accrual method (recommended):**

* For each timestep:

  1. set sun direction
  2. render shadow map
  3. sample shadow map at evaluation samples (or texels)
  4. accumulate lit(1)/shadow(0) using a GPU-friendly **ping-pong render target** pattern
* After all timesteps, normalize to get *fraction of timesteps lit* or *hours lit*.  

This supports both:

* a **numeric metric** (hours or % of sampled timesteps lit)
* a **visual overlay** (heatmap on surfaces). 

#### Path B (Targeted correctness, small N): CPU ray casting

Ray-cast from evaluation point toward sun vector and test intersection with scene geometry. This is straightforward but becomes expensive as evaluation points and timesteps scale. 

**Use this path for:**

* spot-checks / debugging
* small point sets (e.g., a couple façade points), or as a validation cross-check against shadow-map artifacts.

### 2.3 Diffuse sky access (SVF) – geometry-only Baseline

Compute **SVF (0–1)** per evaluation point/surface patch, where 0 = fully enclosed, 1 = open sky. 

**Recommended GPU method (Baseline): hemispherical rendering**

* Place a virtual camera at each evaluation point
* render a hemispherical/cubemap view
* classify pixels into sky vs obstruction
* apply cosine weighting to match SVF definition (view factor style). 

**Important surface note:** façade SVF differs because the surface is vertical (tilt 90°); expect even an unobstructed façade to have SVF around ~0.5 in the geometric sense. 

### 2.4 Diffuse upgrade path (anisotropy) – optional, not required for v1

If you later want more realistic diffuse weighting:

* Use a **sky patch** discretization (e.g., Tregenza 145 patches; Reinhart higher-res) and weight visible patches. 
* Or adopt an anisotropic model like **Perez** (isotropic + circumsolar + horizon brightening) to weight the sky dome. 

**v1 requirement:** You do *not* need to compute absolute kWh/m²; you can ship SVF as “diffuse sky openness” (normalized).

---

## 3) Sampling Policy

Sampling is a **product decision**: you must choose a default that is fast and stable, and offer optional refinement.

### 3.1 Temporal sampling (direct visibility)

Use the “representative days” strategy rather than a full 8,760-hour year by default:

* **Quick preview:** ~48 positions (few representative days × daylight hours)
* **Monthly representative:** ~120 positions (12 days × daylight hours)
* **Standard annual proxy:** ~288 positions (12 days × hourly) 

**Policy choice for v1:**

* Default to **monthly representative (~120)** for the “score” path.
* Provide “detail mode” for a chosen day/season slider if you want finer steps later, but don’t claim it’s necessary for correctness without benchmarking. 

### 3.2 Spatial sampling (evaluation points / surfaces)

3D BAG does not encode windows/balconies/gardens explicitly, so v1 must use deterministic proxies.

**v1 evaluation sets (choose a small, stable set):**

* **Roof surfaces:** sample a coarse grid or a small fixed set (centroid + corners / stratified samples).
  Coarse spatial discretization is acceptable in literature for many urban solar contexts. 
* **Ground around building (optional):** if you can infer a “yard area” proxy, sample a few points in a buffered ring around footprint (clearly label as proxy).
* **Façades (optional):** sample midpoints on footprint edges by orientation, at assumed “window sill” height(s), but label as inferred/approx.

**Policy choice for v1:** start with **roof + 1–3 user-meaningful points** (e.g., roof centroid + one ground proxy + one façade proxy). Only increase point counts if profiling says you can.

### 3.3 Scene/geometry LOD and culling

* Shadow casting can often use simpler LOD geometry; detailed roof geometry matters most for **self-shadowing** on the target building. 
* Apply distance-based culling (remove buildings too far to cast shadows onto the target) to reduce draw calls. 
* Run heavy loops off the main thread using **OffscreenCanvas + Web Worker** to keep the UI responsive. 

---

## 4) Outputs

### 4.1 Primary numeric outputs (v1)

Provide two clearly-labeled metrics:

1. **Clear-sky direct sun visibility (hours)**
   Computed from geometric occlusion only (Path A or B). Label as “clear-sky visibility,” not “sunshine duration.” 

2. **Diffuse sky openness (SVF %, 0–100)**
   Pure geometry SVF per evaluation point/surface. Explain as “how open the sky is above this spot.” 

### 4.2 User-facing score bands (optional, v1)

If you want a “rating,” anchor it to recognizable frameworks but label it as **informational**, not compliance.

A reasonable mapping uses:

* **TNO bezonningsnorm** (lichte/strenge) as a Dutch reference
* **EN 17037** reference-day exposure levels as a European reference 

**v1 rule:** Never claim “EN 17037 compliant” or “meets TNO norm” unless you implement their exact reference-point and reference-day semantics. Instead use language like: “Comparable to thresholds used in…” 

### 4.3 Visual outputs (v1)

* **Shadow overlay playback:** show time slider for sun position (visual truth).
* **Accumulated heatmap overlay:** map direct visibility fraction/hours onto roof surfaces (vertex colors or texture). 
* **SVF overlay (optional):** show sky openness as a separate heat layer.

---

## 5) UX Copy (what you tell users)

Use copy that’s **truthful, simple, and defensible**:

### 5.1 Labels

* “**Direct sun (clear-sky visibility)**”
  “Counts time when the sun is above the horizon and not blocked by nearby buildings.”
* “**Diffuse light (sky openness)**”
  “Measures how much of the sky is visible from this spot (Sky View Factor).” 

### 5.2 Disclaimers (must be visible in-app)

* “This is a **geometry-based estimate** using 3D building models; it does not include clouds, haze, or weather unless explicitly enabled.”
* “Trees, awnings, temporary objects, and interior layout are not included unless stated.”
* “For façades/gardens, points may be **approximated** from building geometry.”

### 5.3 Avoid these claims in v1

* “Sunshine duration” (unless you implement irradiance threshold logic). 
* “kWh/m²/year” (unless you ingest a weather/irradiance time series and validate it).
* “Compliance” with TNO/EN 17037 (unless you implement their measurement protocols precisely). 

---

## 6) Validation Plan (no unvalidated claims)

### 6.1 What to validate

Validate **each metric separately**:

1. Direct visibility hours (geometry)
2. SVF (geometry)

Do **not** validate “solar potential” as one lump metric until you have an energy model.

### 6.2 Benchmark scenes

Create a small suite of test scenes:

* simple courtyard
* street canyon
* detached housing block
* row houses with varying heights

Use consistent 3D BAG-derived geometry variants (LOD1.2 vs LOD2.2 on target roof) to quantify sensitivity. Geometry uncertainty can be a dominant error source in solar estimates, so the suite should include “messy real geometry.” 

### 6.3 Reference engines / cross-checks

* For direct visibility: cross-check a subset of points/timesteps using an independent ray casting implementation (even if slower). 
* For diffuse: cross-check SVF using:

  * higher-sample hemispherical method (more rays / higher cubemap res) as an internal “truthier” reference
  * optionally compare against established tools in sampled locations (e.g., Zonatlas where appropriate), but treat that as *sanity checking* rather than a formal ground truth unless you can align inputs and assumptions. 

### 6.4 Acceptance criteria (v1)

Define acceptance as **stability + monotonic correctness**, not a global % error claim:

* The same scene and sampling policy yields stable results across runs/browsers (within small tolerance).
* Increasing sampling density converges (results move less as you refine).
* Shadow-map path agrees with ray-cast path on a random subset of points/times within a pre-defined disagreement bound (you choose this after profiling and observing failure modes).

## Appendix: Academic + practical anchors (for your “research-backed” positioning)

* Direct/raster/urban shadow foundations and irradiation workflows (Compagnon; Ratti & Richens; Ortner “Shadow Accrual Maps”). 
* Diffuse dominance in NL and SVF definition (Mol et al.; Spitters et al.; Oke). 
* Anisotropic diffuse (Perez) and sky patch discretization (Tregenza/Reinhart).  
* 3D BAG ecosystem and geometry uncertainty context (Biljecki / Solar3Dcity; Zonatlas reference).  
* Web precedents aligned with Three.js constraints (OpenPV/simshady; ShadeMap).
