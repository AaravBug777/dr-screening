# Netra - Diabetic Retinopathy Screening (SIH26038)

Explainable AI screening for diabetic retinopathy: upload a fundus photograph,
get a severity grade (0-4) plus a Grad-CAM heatmap showing exactly which
retinal regions drove the prediction.

```
dr-screening/
├── training/     # Python: data prep, model training, Grad-CAM
├── backend/      # Python: FastAPI inference server
├── frontend/     # React app (the demo UI)
├── matlab/       # MATLAB/Simulink: quality gate, classical segmentation, workflow sim
└── README.md     # you are here
```

**Hybrid architecture**: the SIH26038 problem statement specifies an
Image Processing/Computer Vision/Deep Learning/Medical Imaging Toolbox +
Simulink pipeline. Rather than rewriting the already-working Python classifier
in MATLAB, `matlab/` owns the parts of the spec Python doesn't cover - image
quality gating, classical structural segmentation (vessels, optic disc,
fovea, microaneurysms, exudates, hemorrhages, neovascularization), and the
Simulink district-level workflow simulation - while `training/`/`backend/`
keep doing DR severity grading + Grad-CAM. This isn't just two systems built
in parallel: the running app actually calls MATLAB, live, via the MATLAB
Engine API - `backend/main.py`'s `/predict` runs the MATLAB quality gate
before any Python grading (a rejected image never reaches the model) and
shows the MATLAB segmentation result (vessels, optic disc, fovea, candidate
lesions) as a third view next to the existing Grad-CAM toggle. See
[matlab/README.md](matlab/README.md)'s "Python backend integration" section
for how that's wired up, and for how the two sides fit together overall -
all three MATLAB pieces (quality gate, segmentation, Simulink throughput
model) are built and validated: the quality and segmentation modules
against real ground truth (DRIVE, IDRiD), the Simulink model against
closed-form fluid-queue math. The Simulink model's headline finding is
worth knowing up front: at the brief's own
100,000 patients/year target, compute and bandwidth are over-provisioned by
more than 100x - the real constraint is human review capacity, exactly what
the brief opens with ("~1 ophthalmologist per 100,000 rural population"),
and automated triage turns that from an infeasible constraint into one a
single reviewer sustains up to ~876,000 patients/year against.

## 1. Get the data (do this first)

You need a free Kaggle account and API token.

1. Go to https://www.kaggle.com/settings/account -> "Create New Token".
   This downloads `kaggle.json`.
2. Put it in place and install the CLI:
   ```bash
   pip install kaggle
   mkdir -p ~/.kaggle
   mv ~/Downloads/kaggle.json ~/.kaggle/
   chmod 600 ~/.kaggle/kaggle.json
   ```
3. Download APTOS 2019 (required - this is the core dataset):
   ```bash
   cd training
   mkdir -p data/aptos2019
   kaggle competitions download -c aptos2019-blindness-detection -p data/aptos2019
   cd data/aptos2019 && unzip aptos2019-blindness-detection.zip && cd ../..
   ```
   You should end up with `training/data/aptos2019/train.csv` and
   `training/data/aptos2019/train_images/*.png`.

4. (Optional, recommended if you have time) Download EyePACS for more training
   data and better generalization:
   ```bash
   mkdir -p data/eyepacs
   kaggle competitions download -c diabetic-retinopathy-detection -p data/eyepacs
   # this one is large (~80GB total across all files) - the train set alone is
   # several GB; only grab train.zip + trainLabels.csv.zip if disk/time is tight
   ```
   If you skip this, the pipeline runs fine on APTOS alone - just expect a
   lower ceiling on validation kappa. `EYEPACS_DIR` in `training/config.py`
   simply gets ignored if the folder doesn't have `trainLabels.csv` in it.

**Kaggle competition data note**: both of these are hosted as Kaggle
*competitions*, not plain datasets - you may need to click "Join Competition"
and accept the rules on the competition page in your browser once before the
CLI download will work.

### 1a. Get the external validation/segmentation datasets (DRIVE, IDRiD, Messidor-2)

Not used for training - these are held-out datasets from different clinics/
cameras than APTOS+EyePACS, used to (a) validate the MATLAB segmentation
modules against real expert ground truth, and (b) check the Python
classifier actually generalizes rather than just fitting the training
population. Same `kaggle` CLI as above.

```bash
cd training
mkdir -p data/drive data/idrid data/messidor2

# DRIVE (vessel segmentation ground truth) - clean official structure
kaggle datasets download -d andrewmvd/drive-digital-retinal-images-for-vessel-extraction -p data/drive
cd data/drive && unzip -q *.zip && rm -f *.zip && cd ../..

# IDRiD (optic disc/fovea/lesion ground truth + a second DR-grading set)
kaggle datasets download -d aaryapatel98/indian-diabetic-retinopathy-image-dataset -p data/idrid
cd data/idrid && unzip -q *.zip && rm -f *.zip && cd ../..
# the extracted folder names are URL-encoded ("A.%20Segmentation" etc.) -
# rename them to "A. Segmentation", "B. Disease Grading", "C. Localization"

# Messidor-2 (another DR-grading set) - two pieces that must be combined:
kaggle datasets download -d google-brain/messidor2-dr-grades -p data/messidor2      # the adjudicated grade labels (CSV)
kaggle datasets download -d xyaustin/messidor2 -p data/messidor2                     # the images
cd data/messidor2 && unzip -o -q *.zip && rm -f *.zip && cd ../..
```

**Messidor-2 has a real gotcha, found and fixed during integration**: the
official image release mixes two filename conventions
(`20051020_43808_0100_PP.png` and `IM000012.jpg`), and the second batch's
extension case (`.JPG`) doesn't match what the grade CSV expects (`.jpg`) -
plain case-insensitive filesystems hide this until you diff against the CSV.
If `image_id` lookups come up empty for ~40% of rows, that's why; normalize
the extensions to lowercase. Also try more than one Kaggle mirror if the
first one you find is missing images - not all mirrors are complete (two
independently-uploaded ones both turned out to only have 1,058 of the 1,748
images, consistently missing the same `IM*.jpg` batch).

You should end up with: `training/data/drive/DRIVE/{training,test}/...`,
`training/data/idrid/{A. Segmentation, B. Disease Grading, C. Localization}/...`,
and `training/data/messidor2/{messidor_data.csv, IMAGES/}`.

## 2. Train the model

```bash
cd training
pip install -r requirements.txt
python train.py
```

This will:
- Merge APTOS (+ EyePACS if present), stratified 85/15 train/val split
- Apply Ben Graham preprocessing (crop + contrast normalization - standard
  for this task, makes microaneurysms/hemorrhages visible)
- Fine-tune an EfficientNet-B3 (via `timm`), pretrained on ImageNet
- Use class-weighted loss (the data is heavily skewed toward "No DR")
- Track **quadratic weighted kappa** as the real metric - not accuracy,
  which is misleading here. A kappa above ~0.75 is solid for a hackathon
  demo; published APTOS leaderboard solutions land around 0.85-0.93 with
  heavier ensembling and longer training than you'll have time for.
- Save the best checkpoint to `training/outputs/best_model.pt`

On a single mid-range GPU (e.g. a Colab T4), expect roughly 5-15 min/epoch
depending on dataset size - budget your hackathon time accordingly. If you
only have CPU, drop `NUM_EPOCHS` and `IMG_SIZE` in `config.py` to get
*something* working end-to-end first, then scale up if time allows.

**Sanity-check before trusting anything**: the script prints a confusion
matrix every epoch. Look at it. If the model is just predicting "No DR" for
everything, the class weighting isn't strong enough, or something upstream
(labels, preprocessing) is broken - don't just look at the loss number.

Quick visual check on a single image once trained:
```bash
python gradcam.py --image data/aptos2019/train_images/some_image_id.png
```
This saves `gradcam_overlay.png` - open it and confirm the heatmap actually
lands on the retina (lesions/vessels), not on image borders or artifacts.
If it doesn't, don't proceed to the demo app - debug this first.

**Check it actually generalizes**, not just its own held-out split:
```bash
python validate_external.py
```
Runs the trained model against Messidor-2 and IDRiD's Disease Grading set -
data it never trained on, from different clinics/cameras than APTOS+EyePACS.
Same quadratic weighted kappa metric as training, reported per-dataset and
combined, so you can compare directly against the val_kappa `train.py`
printed. Real numbers from this project's own checkpoint (2-epoch quick-
iteration run, `val_kappa=0.756` on the held-out APTOS+EyePACS split):
Messidor-2 kappa=0.702 (n=1744), IDRiD kappa=0.846 (n=516), combined
kappa=0.780 (n=2260) - a real, evidenced generalization result, not
assumed: performance on IDRiD specifically *exceeded* the training-time
number, and Messidor-2's dip was modest. Worth reporting exactly like
this in a pitch (the actual numbers, both datasets, not just the best one).

**Check against the SIH26038 brief's actual target metric** - sensitivity/
specificity for referable DR (grade >= 2), not kappa:
```bash
python compute_referable_metrics.py
```
Same held-out data as above, but the brief's own binary metric instead of
the ordinal one, using the model's plain argmax grade. This is where a real
gap first showed up and drove three rounds of follow-up work - documented
here in full, including the two attempts that didn't fully work, not just
the one that did:

1. **Retrained from `NUM_EPOCHS=2` to `5`** (`python train.py` again) -
   kappa improved (0.756→0.794 training; 0.702→0.814 Messidor-2), but the
   referable-DR sensitivity target didn't uniformly improve, and got worse
   on IDRiD (93.5%→87.0%, regressing from meeting the target to missing
   it). More epochs alone wasn't the fix for this specific metric.
2. **Tuned a separate referable-DR decision threshold** on the model's
   internal validation split (`tune_referable_threshold.py`) instead of
   just using argmax. Found no threshold clears both the >90% sensitivity
   and >85% specificity targets *simultaneously* on that split; picked the
   closest balance (T=0.14). Applying it to the real external test sets
   (`validate_referable_threshold.py`) revealed it didn't transfer:
   sensitivity=96.5% (exceeds target) but specificity=71.6% (well under) -
   a real domain-shift result, not a rounding error. The model is
   measurably less confident/calibrated on data unlike what it trained on.
3. **Properly calibrated on the external population itself**
   (`calibrate_referable_threshold.py`): split Messidor-2+IDRiD into a
   calibration half and a held-out test half, fit temperature scaling on
   the calibration half to correct the domain-shift miscalibration, then
   swept the threshold requiring sensitivity >= 92% on calibration (a 2pp
   safety margin - a first pass with zero margin selected a threshold at
   exactly 90.00% on calibration that measured 89.74% on the test half;
   ordinary sampling variance was enough to cross the constraint).

**Final numbers** (5-epoch checkpoint, `REFERABLE_TEMPERATURE=0.90`,
`REFERABLE_THRESHOLD=0.30`, on the held-out test half - never used for
calibration or threshold selection): **sensitivity=90.8%, specificity=88.5%**
- the first calibration to clear both SIH targets simultaneously on real
external data. Referral rate: 38.9% (down from step 2's 51.9%, still above
true prevalence of ~26-34% since the calibrated system is still
appropriately more cautious than raw prevalence). `matlab/simulink/throughputParams.m`'s
`ReferralRate` was updated to match and re-run: sustainable capacity at
current resources is now ~901K patients/year, 9x the brief's 100,000/year
target (up from step 2's ~675K, since specificity recovered).

This calibration is live in the running app - `training/gradcam.py`'s
`GradCAM.generate()` applies the temperature before softmax,
`backend/main.py`'s `/predict` returns a separate `referable`/
`referable_probability` computed from those calibrated probabilities
alongside the argmax-based `predicted_label`, and the frontend shows a
"flagged for review as a precaution" note when they disagree (e.g. grade
shown as Mild but still flagged referable due to borderline probability
mass on Moderate+).

### Round 4: test-time augmentation (a genuine improvement, not just re-tuning)

`training/tta.py` averages the prediction over the dihedral-4 symmetry
group - identity + horizontal flip + vertical flip + 3 rotations, the SAME
augmentation family the model actually trained with (`dataset.py`'s
`get_transforms(train=True)`), which matters: a fundus photo has no
canonical "up", so all 6 views are equally valid inputs, not an arbitrary
augmentation choice. Grad-CAM is computed per view against the SAME decided
class and averaged back into canonical orientation too, not just the
probabilities - a smoother, less noisy heatmap as a side effect.

Recalibrated from scratch with its own temperature/threshold
(`training/calibrate_tta_threshold.py`), on the identical 1130/1130
calibration/held-out-test split as the round-3 numbers above, for a direct
comparison rather than a different sample:

| | Sensitivity | Specificity | Kappa |
|---|---|---|---|
| Single-view (round 3) | 90.77% | 88.51% | 0.8350 |
| **TTA (round 4, live default)** | **92.05%** | **87.43%** | **0.8442** |

A real win on both the brief's primary metric (sensitivity) and the ordinal
metric (kappa), at a specificity cost that still clears the 85% target with
margin. Costs ~6x a single view's inference time (measured: ~0.3s/image
extra on GPU) - negligible against the throughput headroom
`matlab/simulink/`'s model already established. This is now the live
default in `backend/main.py` (`cfg.TTA_REFERABLE_TEMPERATURE`/
`TTA_REFERABLE_THRESHOLD`); the round-3 single-view constants stay in
`config.py`, unused by the live path but kept as the historical record.
`throughputParams.m`'s `ReferralRate` was updated to match (38.9%->40.0%)
and re-run: sustainable capacity dipped slightly to ~876K patients/year
(still ~9x the target) - a small, real, expected cost of the higher
referral rate that comes with higher sensitivity, not a regression to be
quiet about.

## 3. Run the backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
Visit http://localhost:8000/health - should report `checkpoint_found: true`.

**First run prints an operator login you need**: `/predict` and `/report`
now require an operator session (see "App hardening" below) - on a totally
fresh `backend/netra.db`, startup creates one automatically and prints its
password to the console ONCE (`[auth] Created default operator account...`).
Save it, or set `NETRA_ADMIN_USER`/`NETRA_ADMIN_PASSWORD` env vars before
first startup to choose it yourself instead.

## 3b. Preview the frontend before training a model (optional, already done)

Earlier in prototyping you could preview the full result UI using generated
placeholder data before a model existed. That mock preview button and
`mockData.js` have since been removed from this version - the frontend now
only shows real predictions from the backend. If you're starting fresh and
want that preview flow back temporarily, it's a small addition (a mock result
object plus one button bypassing the fetch call) - ask if you need it
rebuilt.

## 4. Run the frontend

```bash
cd frontend
npm install
npm run dev
```
Visit http://localhost:5173 - sign in with the operator account printed by
the backend on first startup (see step 3). `sample_test_images/` at the
repo root has four expert-labeled IDRiD test images spanning No DR through
Proliferative DR, ready to drag in. Upload one and you should see the
severity grade, confidence bars, a clinical recommendation, and a toggle
between the original image, the Grad-CAM heatmap, and the MATLAB structures
overlay.

## 4b. `new-frontend/` - a second, in-progress UI

A separate, much larger TypeScript/React rebuild of the screening UI,
alongside (not replacing) `frontend/` above - role-scoped logins (Screening
Operator / Ophthalmologist / Administrator), an offline-first field cache
(IndexedDB drafts + a sync queue for no-connectivity field use), a
longitudinal retinal-progression comparison view, a single-patient history
view, an 8-Indian-language patient takeaway handout, and its own design
system pass. Talks to the exact same backend as `frontend/` - no separate
API, no separate database.

```bash
cd new-frontend
npm install
npm run dev
```
Visit http://localhost:3000 (a different port from `frontend/`'s 5173, so
both can run at once) - same login as step 3/4. `vite.config.ts` proxies
`/api/*` to the backend on :8000, same pattern as `frontend/vite.config.js`.

**Audited against the real backend after landing, three real gaps found
and fixed, not just reported:**
- **History/Patient views were reading local browser storage only, never
  the real backend database** - every prediction was already being saved
  server-side (`db.save_prediction`, inside `/predict`, regardless of
  which frontend calls it), but this frontend's History/Patient/Analytics
  views only ever read a separate local IndexedDB/localStorage cache, so a
  real screening never showed up anywhere but the device that made it.
  Fixed: `services/backendApi.ts` gained real `GET /history` /
  `GET /history/{id}` calls, and `App.tsx` now merges real backend history
  on top of the local cache on load/reload (`services/backendMapping.ts`'s
  `mapBackendHistoryRowToRecord`, with honest placeholders for fields the
  list endpoint doesn't carry - patient identity, per-class confidence,
  segmentation counts - rather than fabricated ones). Known, disclosed
  limitation: a screening just finished in the same session can briefly
  appear twice (once as the local record, once as its own now-persisted
  backend row) since the two have no shared id to correlate by from the
  list endpoint alone.
- **The doctor review-time instrumentation (`/history/{id}/review-complete`,
  the real measured counterpart to the Simulink model's assumed 30s) was
  never called.** Fixed: `TeleOphthalmologyReview.tsx` now times real
  elapsed review wall-clock time and posts it on sign-off, for any record
  sourced from real backend history.
- **`soft_exudate_candidates` (cotton wool spots) was silently dropped** -
  the backend has returned it in `segmentation_summary` since
  `detectSoftExudates.m` shipped, but this frontend's type/mapping
  hardcoded it to 0. Fixed in `types.ts` / `screeningApi.ts`.

Also found: `CapacityPanel.tsx` called a `GET /capacity-live` backend
endpoint that didn't exist yet. Built (`backend/main.py`) rather than
removing the call - it rescales `throughputParams.m`'s sustainable-capacity
figure by the real measured review time once `/history/{id}/review-complete`
timings exist, the same "real number, not re-simulated live" discipline
`/stats` already uses.

Not fixed, disclosed instead: `RecordDetailModal.tsx` renders a
procedurally-generated canvas visualization (`FundusCanvasViewer`, seeded
from the image data) rather than the real
`gradcam_overlay_base64`/`structures_overlay_base64` images the backend
actually computed - true even for a record made through this frontend's
own live pipeline. A real UI-architecture gap, bigger than the ones above;
noted here rather than patched over.

## 5. App hardening (local prototype-grade)

Beyond the core screening flow, the app now has:

- **MATLAB engine crash recovery** (`backend/matlab_bridge.py`) - found the
  hard way that the MATLAB process CAN die mid-session (a concurrent
  Simulink run crashed it outright while this project was building the
  Simulink model), and until now nothing detected that: every request
  after a crash silently fell back to Python-only grading forever, with
  just a log line easy to miss live. `analyze_with_matlab` now tells a
  dead engine apart from a real per-image error and restarts + retries
  once; `/health`'s `matlab_engine_status` (`not_started`/`alive`/`dead`)
  exposes this without ever starting an engine just to check. The frontend
  now surfaces it too, not just the API - the header's status dot and a
  dismiss-free banner turn on the moment a `dead` status is polled (30s
  interval), telling the operator quality-gate/enhancement/structural
  analysis are temporarily Python-only and will recover automatically on
  the next upload, instead of that state being invisible outside the logs.
- **A stats dashboard, paired against the Simulink model** (`GET /stats`,
  the app's **Stats** tab) - real operational numbers (referral rate,
  grade distribution, quality-gate reject rate, screenings/day, and a
  **reject-reasons breakdown**) from this app's own actual usage, shown
  next to `matlab/simulink/throughputParams.m`'s SIMULATED assumptions for
  a direct reality check (e.g. "the model assumes a 40% referral rate;
  this app's actual rate so far is X%"). The reject-reasons breakdown
  parses each rejected row's actual `quality.reasons` codes (`too_dark`,
  `low_source_resolution`, etc.) rather than the unhelpful single
  `quality_verdict="reject"` bucket every rejected row shares. Deliberately
  does NOT trigger a live Simulink re-run per request - MATLAB concurrency
  is fragile enough already (see above) without adding a new way to hit it
  from a web request.
- **History filtering + CSV export** (`GET /history`, `GET /history/export.csv`)
  - date range, multi-select grade (chip picker, not a single dropdown),
  referable-only, and rejected-only filters, "load more" pagination, and a
  CSV export using the exact same filters as the on-screen list (one query
  path for both, not two that could quietly drift apart). Rejected-only is
  UI-mutually-exclusive with the grade/referable-only filters (a rejected
  row has no grade or referable value, so combining them would just
  silently return zero rows) - picking one clears the other rather than
  leaving the operator to find that out by getting an empty result.
- **Operator management** (`backend/manage_operators.py`) - a CLI, not a
  web endpoint (deliberately: account creation isn't exposed through the
  app itself at this trust level - see the script's own docstring):
  `python manage_operators.py add <username> [password] [role]` /
  `list` / `passwd` / `setrole` / `remove`. Operators carry a role -
  `OPERATOR` (default), `OPHTHALMOLOGIST`, or `ADMIN` - returned from
  `/auth/login` and `/auth/me`; `new-frontend/` uses it to pick which app
  view a login lands in (`new-frontend/src/App.tsx`). `frontend/` doesn't
  read the role at all, so it's invisible there. An account has exactly
  one role - to let the same person work as both a screening operator and
  a reviewing ophthalmologist, create two separate accounts. Existing
  accounts from before roles existed default to `OPERATOR` via an additive
  migration (`backend/db.py`); use `setrole` to promote one.
- **A visible "Enhanced" view** - MATLAB's quality-gate enhancement
  (illumination normalization → CLAHE → bilateral denoise,
  `matlab/quality/enhanceFundusImage.m`) was already being computed and
  used silently for borderline-quality images (fed straight to
  segmentation/grading); it's now also returned for display, so the image
  toggle shows Original/**Enhanced**/AI focus/Structures instead of just a
  text note saying enhancement happened. No new image-processing
  algorithm - this exposes an already-validated step that was invisible.
- **Operator accounts + sessions** (`backend/auth.py`) - signed HttpOnly
  cookies, PBKDF2-hashed passwords, no external identity provider needed.
  `/predict` and `/report` require a session; `/health` doesn't (so
  monitoring/uptime checks still work unauthenticated).
- **Screening history** (`backend/db.py`, SQLite) - every prediction
  (graded or rejected) is now persisted with the operator who ran it, not
  discarded the moment the response was sent. The frontend's **History**
  tab lists the shared clinic record (not per-operator-isolated by
  default - a PHC's screening history is something other staff at the
  same site legitimately need to see) and re-opens any past result,
  including re-downloading its PDF report.
- **Batch upload** - the upload panel now accepts multiple files at once;
  they're queued and processed strictly sequentially (matching the
  concurrency fix below, not just a UI choice), with a compact per-file
  status list you click through to each result.
- **Safe MATLAB concurrency** (`backend/matlab_bridge.py`) - the shared
  MATLAB engine instance is not documented as thread-safe for concurrent
  calls, and this project's own license only supports one concurrent
  Image Processing/Simulink checkout anyway (confirmed the hard way: a
  concurrent Simulink run while the backend held its engine crashed
  MATLAB outright, not just slowly - see `matlab/simulink/`'s notes). A
  lock now serializes access, correctly and simply, rather than hoping
  FastAPI's thread pool sending overlapping calls into one engine object
  "just worked".
- **Offline-tolerant requests** (`frontend/src/api.js`) - real network
  failures (a Wi-Fi blip) retry automatically with backoff; a persistent
  "you're offline" banner shows via `navigator.onLine`. This is NOT a full
  offline queue that survives a page refresh (that needs a service
  worker/IndexedDB - real-deployment-grade scope, not attempted here) - a
  failed upload after retries surfaces as a normal, retryable error.
- **Baseline production hardening** (`backend/main.py`) - CORS narrowed
  from a wide-open `*` to an explicit origin allowlist (required anyway
  once sessions use credentialed cookies), security headers
  (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`),
  structured logging in place of scattered `print()` calls. Still a local
  dev server (`uvicorn --reload`), not behind HTTPS/a reverse proxy -
  that needs real infrastructure this local machine doesn't have (see
  "Known limitations" below).

## 6. Validation against published benchmarks

The rest of this document validates the pipeline against ground truth ON
published datasets (IDRiD, DRIVE, Messidor-2). That's a different claim
from validating it AGAINST OTHER PUBLISHED METHODS' reported numbers on
those same datasets - the table below does the latter, which the SIH
brief's Expected Solution also asks for. Every number here was pulled from
a live search against the actual cited source just before writing this
table, not from memory - several genuinely surprised the author (see the
Gulshan row) - so check the link before citing this table in a submission
rather than trusting it transitively.

| Task / dataset | Published result | This project | Directly comparable? |
|---|---|---|---|
| Referable DR detection, Messidor-2 | Gulshan et al. 2016 (JAMA): **96.1% sens / 93.9% spec** at the high-sensitivity operating point (AUC 0.990), graded by a 7-8-ophthalmologist panel adjudicating disagreements | **92.05% sens / 87.43% spec** (TTA-calibrated, held-out split, `training/calibrate_tta_threshold.py`) | Partially - same dataset and same referable-DR task, but Gulshan's reference standard is a multi-ophthalmologist adjudicated panel; this project's ground truth is Messidor-2's single-grader published labels. A stricter reference standard is a harder bar to clear, so this isn't an apples-to-apples gap of the size it looks like, but it isn't nothing either. |
| DR grading (5-class), IDRiD official challenge | Winning/top submissions: **quadratic weighted kappa 0.82-0.93** (Porwal et al. 2018 challenge report) | This project doesn't report a 5-class kappa on IDRiD specifically - closest comparable figure is the binary-referable kappa of **0.8442** (TTA, Messidor-2 held-out split, a different dataset and a coarser 2-class task) | No - different dataset, different task granularity (5-class ordinal vs. binary referable). Listed for scale/context only, not as a head-to-head result. |
| Vessel segmentation, DRIVE | Classical Frangi filter (a comparable, non-DL classical method): **91.7% accuracy, 93.5% AUC, 66.5% sensitivity**. Modern U-Net-family DL methods reach materially higher (74-82% sensitivity, 95-97% accuracy, per recent DRIVE leaderboard papers). | **92.2% accuracy, 64.2% sensitivity, 96.3% specificity, 0.673 Dice** (`fibermetric`-based, `matlab/segmentation/README.md`) | Yes, against the classical-method row - genuinely comparable (same dataset, same task, same family of technique): accuracy is essentially tied (92.2% vs 91.7%), sensitivity close (64.2% vs 66.5%). Honestly behind the modern DL-based rows, as expected for a classical, non-learned method - not claiming otherwise. |
| Microaneurysm segmentation, IDRiD challenge | Top challenge submission: **AUPR 0.5254** (precision-recall-curve-based ranking metric, at the confidence threshold that produces the challenge's ranking score) | Pixel-level **Dice 0.076** at a single fixed threshold; lesion-level detection **82.0%** hit-rate (`matlab/segmentation/README.md`) | No, not directly - AUPR (area under a precision-recall curve swept over confidence thresholds, on a probability map) and Dice-at-one-threshold (on a binary decision) measure genuinely different things; a method can have a strong AUPR and a weak single-threshold Dice simultaneously depending on where that threshold sits. Reported side by side for scale, not claimed as a comparable number. |

**Honest summary of what this table shows**: this project's referable-DR
detection is in the neighborhood of, but measurably behind, Gulshan et
al.'s landmark result - expected, given that used a materially larger
private training set and a stricter multi-grader reference standard, not
a limitation unique to this pipeline. The classical vessel segmentation
genuinely matches the classical-method literature baseline it's actually
comparable to. The lesion-segmentation and 5-class-kappa rows are included
for scale/context but flagged as not directly comparable rather than
forced into a misleading head-to-head - consistent with this project's
practice elsewhere (see the integrated-vs-single-technique ablation above)
of reporting a nuanced or unfavorable result honestly rather than only the
comparisons that flatter it.

Sources: [Gulshan et al. 2016, JAMA](https://research.google.com/pubs/archive/45732.pdf) ([reproduction study](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0217541)) · [IDRiD challenge / Porwal et al. 2018](https://idrid.grand-challenge.org/Leaderboard/) · [DRIVE vessel segmentation benchmark comparisons](https://www.nature.com/articles/s41598-026-48475-6) ([SA-UNet](https://arxiv.org/pdf/2004.03696)).

## Suggested build order for a hackathon

1. Get APTOS downloaded and training loop running end-to-end - even 2-3
   epochs - before doing anything else. Confirm the confusion matrix looks
   sane.
2. Get the backend serving predictions against that (even weak) checkpoint.
3. Get the frontend talking to the backend and rendering a result - this is
   your "it works" checkpoint. Do this before polishing the model further.
4. Only then: go back and improve the model (more epochs, add EyePACS, tune
   class weights) while the demo app around it stays untouched.
5. Stretch goals if time remains: on-device/offline export (ONNX/TFLite) to
   speak to the "rural, low-connectivity" framing in the actual problem
   statement; a short write-up of kappa score + confusion matrix as evidence
   for judges that this isn't just accuracy-on-imbalanced-data theater.

## Known limitations to be upfront about in your pitch

- APTOS alone is only ~3,662 images with a long tail on severe/proliferative
  classes - say this out loud rather than have a judge find it. Mention
  EyePACS as the mitigation, and `validate_external.py`'s Messidor-2/IDRiD
  results as evidence generalization actually holds up, not just a hope.
- The checkpoint in `training/outputs/` is now the 5-epoch retrain
  (`best_model.pt`; the original 2-epoch checkpoint is preserved at
  `best_model_2epoch_backup.pt`). The LIVE default is now test-time
  augmentation (`TTA_REFERABLE_TEMPERATURE=0.80` / `TTA_REFERABLE_THRESHOLD=0.27`,
  see "Round 4" above), clearing **both** the SIH brief's >90% sensitivity
  and >85% specificity targets on a held-out slice of real external data
  (92.1%/87.4%) - but this took three earlier attempts that didn't fully
  work (more epochs alone; a threshold tuned on the wrong population; a
  properly-calibrated single-view threshold that cleared both targets but
  left sensitivity margin thin) to reach, and TTA itself only improved
  things after its own from-scratch calibration pass, not just plugging
  it in. Worth mentioning that history in a pitch, not just the final
  number - it's a stronger story than claiming it worked on the first
  try, and shows the validation discipline (held-out calibration, never
  testing on data used for tuning) that got there.
- Segmentation's lesion detection (microaneurysms/exudates/haemorrhages,
  `matlab/segmentation/`) has honestly weak pixel-level precision - a real,
  measured ceiling for the classical methods used, documented rather than
  hidden. Useful as an unconfirmed candidate generator for review (82% hit
  rate for microaneurysms specifically), not a standalone diagnostic
  segmentation. Microaneurysm centroids are genuinely sub-pixel - computed
  as an intensity-weighted center of mass over the continuous pre-threshold
  response map, not the quantized binary blob (`detectMicroaneurysms.m`'s
  `WeightedCentroid`) - verified empirically, not just asserted:
  `tests/validateMASubpixelCentroid.m` measured a mean 0.104px offset from
  the plain integer centroid across 75,833 real candidates (54 IDRiD
  images), with 0.0% landing on an identical integer position, directly
  addressing the SIH brief's "sub-pixel microaneurysm detection" phrase.
  **Cross-validated against a second, independent grader, not just
  IDRiD/DRIVE**: `matlab/tests/validateAgainstMAPLESLesions.m` reruns
  optic disc, vessel, microaneurysm, exudate, and hemorrhage detection
  against MAPLES-DR's independent annotations (162 matched images) -
  four of five structures hold up as well as or BETTER than the original
  IDRiD/DRIVE numbers (optic disc 89.1%→96.9%, microaneurysm lesion-hit
  82.0%→87.6%, exudate lesion-hit 59.5%→71.4%, hemorrhage lesion-hit
  46.1%→45.9%) - real evidence these detectors learned genuine
  lesion/structure appearance, not just one dataset's labeling
  conventions. Vessel segmentation was the one honest exception - and it
  was diagnosed, not just noted: `tests/diagnoseVesselMAPLESGap.m` found
  76% of MAPLES-DR's annotated vessel pixels are the thinnest category
  (<2px half-width), caught only 38.6% of the time by the old threshold
  vs 91.0%/88.8% for medium-width vessels. `tests/tuneVesselThresholdForThinVessels.m`
  then swept the threshold against BOTH DRIVE and MAPLES-DR together
  (never tune against only the motivating dataset) and found lowering
  `VesselThresholdPercentile` from 88 to 86 recovers real MAPLES-DR gain
  (thin-vessel recall 38.6%→48.3%, Dice 0.594→0.645) at negligible DRIVE
  cost (Dice 0.673→0.672) - now the default. Full tables in
  `matlab/segmentation/README.md`. Two more real gaps were closed the same
  session: **soft exudates (cotton wool spots) had no detector at all**
  before this (only ever mentioned in code comments) - `detectSoftExudates.m`
  is a genuinely new capability, tuned against IDRiD + MAPLES-DR together
  (86.2%/34.5% lesion-hit rate respectively - real, and honestly weaker on
  MAPLES-DR, disclosed not hidden). And the shared MA/exudate/hemorrhage
  weak point (strong recall, weak precision) was directly attacked with a
  per-candidate shape/intensity classifier (250,022 real candidates,
  combined IDRiD+MAPLES-DR ground truth): precision improved 2.6%→20.7%
  but recall dropped 100%→62.7% - a real trade-off, not a clean win, which
  is why it's shipped as an available confidence score for human review
  rather than wired in as an automated filter that would silently drop
  37% of real microaneurysms. **Three more follow-up experiments, same
  session, with mixed and honestly-reported outcomes**: (1) a gentler MA
  classifier operating point exists - sweeping the DECISION THRESHOLD
  instead of retraining anything found precision 4.8% at 91.4% recall
  (vs. the default's 20.7%/62.7%), a real recall-preserving alternative
  found only after catching a genuine bug (RUSBoost's scores aren't a
  calibrated probability comparable to an absolute 0.5 cutoff the way a
  random-forest ensemble's are - a naive sweep first produced results
  that were nearly the exact complement of the real ones). (2) Hard
  exudates got the same two-dataset threshold retune vessels did
  (`ExudateThresholdPercentile` 97→90) - a genuine trade-off this time,
  not a free lunch: pixel Dice drops but lesion-level hit rate rises on
  BOTH datasets (IDRiD 51.9%→63.7%, MAPLES-DR 64.5%→80.7%), chosen for
  hit rate since that's the metric this project has consistently argued
  matters more for a human-in-the-loop candidate generator. (3) A
  multi-scale vessel-fusion variant (separate `fibermetric` calls per
  thickness band instead of one wide-range call) was built and tested
  against both datasets - and it produced numbers numerically IDENTICAL
  to the single-scale approach, a genuine negative result kept as a
  documented dead end (`segmentVesselsMultiScale.m`) rather than silently
  dropped. Hemorrhage candidates are further split dot/blot vs.
  flame-shaped (shape + radial-orientation-from-disc heuristic - see
  `matlab/segmentation/detectHemorrhages.m`), though that type split has no
  expert ground truth to validate against. Neovascularization (NVD/NVE)
  detection (`matlab/segmentation/detectNeovascularization.m`) is now
  validated against real pixel-level ground truth (MAPLES-DR, found and
  integrated this session) - and the honest result is weak, not
  flattering: zero pixel-level overlap on the 5 available NV-positive test
  images, 40% (2/5) image-level sensitivity. The earlier directional check
  (candidate counts trend higher on PDR than No-DR images, p=0.0124) still
  holds and is a genuinely different, separately-true claim - never
  present this output as "neovascularization detected." A real,
  reproduced optic-disc mislocalization case (bright/vessel-dense
  confusion) was also found, correctly diagnosed after two wrong
  hypotheses, and fixed with zero regression on the full 413-image IDRiD
  benchmark - see `matlab/segmentation/README.md`'s "Phase 3" for the full,
  instructive story of a first fix attempt that looked successful but
  regressed everything else, caught before shipping.
- **A further round of segmentation improvements, same "build -> validate
  against both datasets -> only ship real wins" discipline, this time
  explicitly excluding hemorrhages/NV (already-diagnosed real ceilings,
  deferred):** microaneurysm and hemorrhage detection got the same
  two-dataset threshold retune exudates and vessels already had
  (`MAThresholdPercentile` 98->92, `HemorrhageThresholdPercentile` 97->92)
  - a genuine trade-off (pixel Dice down, lesion-level hit rate up
  substantially on both IDRiD and MAPLES-DR, e.g. MA hit rate 81.9%->98.0%
  IDRiD / 87.5%->96.9% MAPLES-DR), taken deliberately for the reason this
  project has consistently argued matters more for a human-in-the-loop
  candidate generator. Soft exudates' minimum-candidate-area parameter
  (`SoftExudateMinAreaPx`, previously untested) was swept and lowered
  40->20 - a rare near-free-lunch result, Dice flat while hit rate rises
  monotonically (IDRiD 70.5%->83.8%). Soft-exudate candidate counts, wired
  into the backend earlier but never surfaced, are now actually shown in
  the app's result narrative (`frontend/src/content.js`). And fovea
  localization gained a genuinely new, independent signal: the foveal
  avascular zone (a real anatomical fact - the fovea sits in a vessel-free
  region, distinct from pure pixel darkness) is now folded into
  `localizeFovea.m`'s scoring via an optional vessel-density term, backward
  compatible with existing callers. Validated on IDRiD (fovea markups,
  84.7%->86.4% success) AND MAPLES-DR's Macula category (a previously
  unused annotation category, 93.2%->95.0%) with vessel/OD detection run
  once per image and shared identically between both scoring modes so the
  comparison isolates the fovea logic itself - a clean win on both
  datasets, no trade-off to weigh, unlike most retunes in this module. Full
  tables and methodology for all of the above in
  `matlab/segmentation/README.md`. A follow-up diagnostic asked whether the
  remaining ~11% OD / ~14% fovea failure tails share a common,
  not-yet-fixed cause (`matlab/tests/diagnoseRemainingODFoveaFailures.m`,
  same ranksum hypothesis-testing discipline as the original misdetection
  diagnosis): the detector's own confidence score is the clearest signal
  (significantly lower on failures for both OD and fovea, p<0.0001) but
  the gap is modest, not a clean accept/reject boundary; image contrast
  and FOV fraction are also significant, mildly counter-intuitively (HIGHER
  contrast and a LARGER in-frame FOV fraction both associate with more
  failures); vessel density does not discriminate at all. No single
  dominant, fixable cause like the Phase 3 tortuosity case - reported
  honestly as a diffuse combination of image-condition factors, not
  oversold as solved. The per-candidate shape/intensity classifier design
  built for microaneurysms was also mechanically extended to hard exudates
  and hemorrhages (`matlab/tests/trainLesionCandidateClassifier.m`,
  generic/parameterized, same RUSBoost + margin-sweep method): exudates
  got the strongest lift of the three (precision 4.0%->34.0% at 66.1%
  recall, driven by LocalContrast rather than Area - a real, clinically
  sensible difference from microaneurysms), hemorrhages the weakest but
  still real (3.5%->11.3% at 59.1% recall, consistent with hemorrhages
  already being the weakest raw detector of the three). Recall-preserving
  operating points (>=90% recall) exist for both, same as microaneurysms.
  Neither wired in as a hard filter, for the same clinical-safety reason.
- Confidence scores shown in the app ARE calibrated (temperature scaling -
  see the calibration history above); the referable-DR decision uses those
  calibrated probabilities against a tuned threshold, not raw argmax. An
  automated annotated PDF report also exists (`POST /report` in
  `backend/main.py`, `backend/report_generator.py`, a "Download annotated
  report" button in the app) - re-renders the already-computed prediction
  as a one-page-scannable PDF (grade, referable decision, all three image
  views, structural findings split into validated vs. lower-confidence
  groups), directly addressing the brief's "automated annotated reports...
  ophthalmologist validation in under 30 seconds" requirement. The
  review-TIME claim now has real instrumentation behind it (`POST
  /history/{id}/review-complete`, `backend/db.py`'s `review_duration_seconds`,
  a "Review time" card on the Stats tab) - it times real elapsed seconds
  from a result being shown to the operator moving on, and reports the
  measured median/p90 alongside the brief's assumed 30s figure. Still not
  a clinician validation study (the "operator" is whoever's logged in and
  using the app locally, not a licensed ophthalmologist) - but it's now a
  real, running measurement rather than an unmeasured number nobody ever
  checked, and will show genuine data as the app accumulates real usage.
- An ablation directly testing the brief's "integrated pipeline outperforms
  any single technique" claim (`matlab/tests/compareIntegratedVsSingleTechnique.m`)
  was substantially strengthened and rerun: the DL-alone baseline was fixed
  to use the CURRENT deployed TTA decision (a real staleness bug - it
  previously compared against an older, superseded calibration), and the
  combiner's calibration set grew from 200 IDRiD images to 2,157 (the full
  413-image official IDRiD train split + 1,744 real, adjudicated-label
  Messidor-2 images, a ~79-minute MATLAB extraction, 0 failures). Evaluated
  on the same untouched official IDRiD test set, n=103:
  **for the first time in this ablation's history, the fitted combiner
  beats DL-alone** - 83.5% accuracy vs. 81.6% (84.6%/66.7% specificity),
  at a real sensitivity cost (82.8% vs. 90.6%). Read with one important
  caveat, not as an unconditional win: DL-alone's specificity on this
  specific 103-image test set (66.7%) is far below what the identical
  model/threshold achieves on the population it was actually calibrated
  against (87.43%, on a 1,130-image held-out split) - a >20pp gap that
  means part of the combiner's apparent win could be genuinely robust
  compensation, or could be fitting to this small test set's specific
  characteristics; n=103 isn't large enough to fully tell those apart.
  Full table and the complete caveat in `matlab/README.md`'s "Ablation"
  section. This is real, measured, methodologically-strongest-yet evidence
  FOR the brief's integration claim - reported with the honesty this
  project has applied to every other result, not spun into a cleaner
  story than the data supports. The stronger, already-evidenced form of
  "integration helping" in this project remains the quality-gate-before-
  grading + calibration story above; this ablation result now stands
  alongside it, not instead of it. **A follow-up DDR-scale check (n=2,000,
  a third independent dataset, different clinics/cameras than both IDRiD
  and Messidor-2) complicates this, honestly: the integration result does
  NOT hold at this scale** - DL-alone (89.8% accuracy) beats the fitted
  combiner (87.1%) there, because the MATLAB structural classifier's
  sensitivity collapses to 6.7% on this dataset. Diagnosed, not just
  reported: this specific DDR mirror's images are pre-downsampled to
  512x512px (vs IDRiD's native 4288x2848px), well below the classical
  pipeline's calibrated working resolutions (640px/1600px) - since every
  resize in this pipeline only ever downscales, never upscales, lesion
  detection runs at native 512x512 instead of its calibrated resolution,
  destroying the fine structure it depends on, while the DL grader (far
  more resolution-robust by construction) is unaffected. A genuine,
  disclosed limitation of the structural pipeline's resolution
  assumptions, not a bug in the combiner or the ablation methodology -
  full diagnosis in `matlab/README.md`'s "DDR-scale validation" section.
- **Low-resolution/re-sourced images can still fool the grader - now caught
  before grading, but worth knowing this failure mode exists.** A real
  user-submitted test with a 480x432px image sourced from a published paper
  figure (resaved/recompressed multiple times) graded Severe at 74.5%
  confidence against a true Mild. Root cause, confirmed with a resolution
  sweep and Grad-CAM (`matlab/quality/README.md`'s calibration history,
  item 4): below the pipeline's own 640px internal working resolution, Ben
  Graham preprocessing's 4x local-contrast amplification turns JPEG
  recompression artifacts and normal foveal pigmentation into lesion-like
  blobs - and the quality gate had no check for source resolution, only
  focus/illumination/framing. Fixed: `assessFundusQuality.m` now rejects
  below `MinNativeResolutionPx=640` outright (no amount of enhancement can
  add back resolution that was never captured), with recapture guidance
  distinguishing "your camera's resolution setting" from "you're testing
  with a downloaded/screenshotted image." Verified this doesn't quietly
  break real data: 2/3662 APTOS images (0.05%) and zero IDRiD/Messidor-2
  images fall below the new floor; current commercial portable fundus
  cameras capture well above it in practice.
- This is a screening aid, not a diagnostic replacement - the recommendation
  text is deliberately phrased as a referral suggestion, not a diagnosis.
- Grad-CAM shows *where* the model looked, not proof the reasoning is
  clinically correct - useful for sanity-checking, not a formal explainability
  guarantee.
- **FGADR exposed real grading failures; a targeted fine-tune helped on
  FGADR but is NOT deployed.** The current grader was run on the FGADR
  Seg-set (1,842 images, grades 0-4, 1280x1280) with nothing fit on it:
  referable sensitivity 92.9% but specificity only **25.9%**, **Mild recall
  2.4%**, PDR recall 27%, QWK 0.459. FGADR's own lesion masks confirmed the
  labels are internally consistent (grade 0 almost never has lesion masks;
  every Mild image has them, mostly microaneurysms only), so this is mostly
  a real model failure. A fine-tune from the current checkpoint on a mix of
  FGADR (60% split by image; 15% val; 25% test never seen) plus replayed
  APTOS/EyePACS, with Mild oversampled and up-weighted
  (`training/finetune_fgadr.py`), was compared on held-out sets at
  temperature/threshold recalibrated only on non-test data
  (`training/eval_checkpoint.py`):

  | Held-out set | Model | QWK | Mild recall | Ref. sens / spec |
  |---|---|---|---|---|
  | FGADR test (n=461) | old / new | 0.482 / **0.792** | 2% / **57%** | 92.4/21.8 -> 94.3/47.4 |
  | DDR (n=2000) | old / new | 0.774 / 0.778 | 19% / **45%** | 81.4/96.7 -> 78.4/97.5 |
  | IDRiD (n=516) | old / new | 0.818 / **0.844** | 68% / **76%** | 93.5/85.0 -> 90.1/92.7 |
  | Messidor-2 half (n=872) | old / new | **0.811** / 0.770 | 14% / 16% | 89.9/87.3 -> 88.2/81.7 |

  A genuine trade-off, not a win: large gains on FGADR and better Mild
  recall on three of four sets, but a regression on Messidor-2 (the
  population the brief's 90%/85% targets were calibrated on; the old model
  has a home-field advantage there) and slightly lower DDR sensitivity.
  Referable specificity on FGADR is still only 47%. Averaging old and new
  predictions was also tried: a compromise that dominates nowhere. Per the
  rule of only shipping demonstrable improvements, the live model is
  unchanged (`best_model.pt`); the candidate is kept locally
  (`outputs/finetune/best.pt`, not committed) with the old model backed up.
  Mild on Messidor-2 stays weak (14-16%) either way.

  **v2 (mixed-data fine-tune), a second attempt to remove that regression**
  (`training/finetune_v2.py`): trains on FGADR + Messidor-2 (split by image
  into train / calibration-only / test) + DDR rows outside the evaluation
  sample + replayed APTOS/EyePACS, Mild up-weighted; epoch chosen by a rule
  fixed in advance (best mean val QWK -> epoch 1). Same protocol for every
  model (T/threshold fitted only on FGADR-val + Messidor-2 cal, sens>=92% on
  each source; tested on data no model trained on;
  `training/compare_models_v2_persource.py`):

  | Held-out set | Model | QWK | Mild recall | Ref. sens / spec | Ref. AUC |
  |---|---|---|---|---|---|
  | FGADR test (461) | old / v2 | 0.484 / **0.798** | 2% / **62%** | 90.1/24.4 -> 97.9/30.8 | 0.818 / **0.912** |
  | DDR sample (2000) | old / v2 | 0.774 / **0.840** | 19% / **68%** | 79.8/97.3 -> **86.8**/95.4 | 0.963 / **0.970** |
  | IDRiD (516) | old / v2 | 0.818 / **0.844** | 68% / **80%** | 92.6/87.6 -> 94.4/87.0 | 0.970 / **0.980** |
  | Messidor-2 test half (872) | old / v2 | 0.811 / **0.824** | 14% / 18% | 89.9 deployed, 87.3 recal -> **82.0**/93.6 | 0.962 / 0.964 |

  v2 discriminates as well or better than the deployed model on every
  held-out set (AUC) and greatly improves Mild on three of four, but its
  Messidor-2 sensitivity at the calibrated threshold (82.0%) is below the
  brief's 90% target. The AUC parity says this is a threshold/calibration
  problem, not worse ranking: the 436-image Messidor-2 calibration quarter
  is too small (~110 referable cases) and a threshold chosen to just clear
  92% on it regresses to the mean on the test half. NOT deployed: shipping
  it needs a threshold refit on the larger pooled Messidor-2 set (which uses
  up its untouched test half), plus ONNX re-export and re-verification of the
  MATLAB import and Grad-CAM path. Candidate: `outputs/finetune_v2/best.pt`
  (local, uncommitted).

  **Gated deployment attempt for v2 - gate passed, final check failed, NOT
  deployed** (`training/cv_threshold_gate2.py`). Pre-registered gate:
  repeated 5-fold CV on the 1,308 held-out Messidor-2 images (temperature by
  5-class NLL - the same method returns T=0.80 for the live model, matching
  what is deployed - then threshold fitted with a 3-point sensitivity
  margin). v2 PASSED: 92.8% sens / 86.5% spec (live model 92.8 / 86.8). But
  the follow-up check on sets not used for fitting failed: at that
  Messidor-tuned threshold (0.115) v2 gives DDR 93.8/85.1 (live model
  81.4/96.7), IDRiD 97.5/**76.2** (93.5/85.0), FGADR test 100/**1.3**
  (92.4/21.8). v2 ranks better (AUC, QWK, Mild recall), but a single
  threshold cannot serve populations whose score distributions differ, and
  a Messidor-fitted one gives up too much specificity elsewhere. An earlier
  temperature+threshold joint search also slid to the grid edge (T=0.5),
  which would have made displayed confidences near-binary - caught and
  replaced by likelihood-based temperature. Live model unchanged. Open
  options: use v2 only for the 5-class grade/Mild label while keeping the
  live model's referable decision, or train with more populations so
  score distributions align.

  **Deployed: the hybrid.** The app now shows the grade, class probabilities
  and Grad-CAM from the v2 fine-tune (`training/outputs/best_model_grade_v2.pt`,
  T=0.85) while the referable decision, probability and threshold are still
  the original model's, unchanged (`backend/main.py`, `config.GRADE_*`; falls
  back to the original model for the grade if the file is missing). Forcing
  the v2 grade to agree with the original referral flag was tested first and
  rejected: it discards most of the gain (Mild recall 21%/62%/56%/8% on
  FGADR/DDR/IDRiD/Messidor-2, and Messidor-2 QWK 0.78 < the original's 0.81),
  because the original model's low specificity pushes many true No-DR/Mild
  eyes into "referable". The deployed unconstrained hybrid leaves referral
  metrics identical by construction and, on held-out data, changes the
  grade as follows (original -> hybrid):

  | Held-out set | QWK | Mild recall | Exact accuracy |
  |---|---|---|---|
  | FGADR test (461) | 0.482 -> **0.798** | 2% -> **62%** | 46.2% -> **67.9%** |
  | DDR (2,000) | 0.774 -> **0.840** | 19% -> **68%** | 72.5% -> 72.5% |
  | IDRiD (516) | 0.818 -> **0.845** | 68% -> **80%** | 57.0% -> **59.5%** |
  | Messidor-2 test (872) | 0.811 -> **0.824** | 14% -> 17% | 75.5% -> 74.4% |

  Costs, stated plainly: grade and referral flag can disagree slightly more
  often than before (share of images where grade>=2 differs from the referral
  flag: FGADR 16.1->20.4%, DDR 4.9->5.9%, IDRiD 7.8->9.3%, Messidor-2
  7.3->13.3%; the original model already disagreed with itself 5-16% of the
  time, since the flag is deliberately more sensitive than the argmax);
  Messidor-2 exact accuracy dips ~1 point; Mild on Messidor-2 is still weak;
  inference does one extra 6-view forward pass (~+0.3 s). The earlier
  "92.05% / 87.43%" figures describe the original model's referral decision,
  which is unchanged. Rollback: delete `best_model_grade_v2.pt`. Verified
  end to end through the real `/predict` endpoint on three FGADR test images
  (grade and probabilities identical to v2's cached output, referable
  probability identical to the original model's to 4 decimals).

- **v3, a full retrain on all six populations at higher resolution -- the
  best grader on three of four test sets, but NOT deployed** (Phase 0-2 of
  the retrain plan: `training/build_manifest.py`, `build_cache.py`,
  `train_v3.py`, `eval_v3.py`, `calibrate_v3.py`). Rebuilt from ImageNet
  rather than fine-tuned: 44k train images from 5 populations (the old model
  saw ~33k from 2), 512px from a 1024px preprocessing cache (old: 380px from
  a 640px cap -- a median IDRiD microaneurysm went from ~1.6px to ~2.2px,
  which is what floors Mild), soft ordinal targets instead of plain
  cross-entropy, a class-balanced sampler, and epoch selection on a
  MULTI-population calibration split rather than the training populations.
  14 epochs, ~9 h on the laptop 4060. Calibration set a sensitivity floor on
  EVERY population at once (worst-case, not average) -- the rule whose
  absence caused the two earlier deployment attempts to fail.

  Training went well and had not plateaued: cal QWK 0.677 -> **0.909** over
  14 epochs, still rising at the last one. On the frozen test suite
  (old model at its deployed operating point vs. v3 at its calibrated one,
  identical images):

  | Test set | Model | QWK | Mild | Sens | Spec | AUC |
  |---|---|---|---|---|---|---|
  | DDR (2000) | old / v3 | 0.774 / **0.916** | 0.19 / **0.54** | 0.814 / **0.934** | 0.967 / 0.961 | 0.963 / **0.988** |
  | FGADR (461) | old / v3 | 0.482 / **0.804** | 0.02 / **0.51** | 0.924 / 0.935 | 0.218 / **0.628** | 0.818 / **0.935** |
  | Messidor-2 (872) | old / v3 | 0.811 / **0.842** | 0.14 / **0.35** | **0.899** / 0.829 | 0.873 / **0.955** | 0.962 / **0.970** |
  | IDRiD (516) | old / v3 | **0.818** / 0.745 | **0.68** / 0.52 | 0.935 / **0.969** | **0.850** / 0.772 | **0.970** / 0.907 |

  **Read the IDRiD row carefully -- it is the honest one.** IDRiD is the only
  population NEITHER model ever trained on (v3 trained on DDR, FGADR and a
  Messidor-2 quarter; the old model on APTOS/EyePACS only), so it is the one
  like-for-like generalization test, and there v3 is WORSE: threshold-free
  AUC 0.907 vs 0.970, QWK 0.745 vs 0.818. So a large part of v3's gains on
  the other three sets is domain adaptation -- it learned those populations --
  not a pure improvement in reading fundus images. That distinction matters
  for a screening tool that will meet cameras and clinics none of these
  datasets contain.

  Two further reasons it is not deployed: (1) no single threshold meets the
  brief's 90%/85% targets on all four test sets -- swept 0.25 to 0.55, FGADR
  specificity peaks at 0.667 and IDRiD at 0.788, while Messidor-2 sensitivity
  never reaches 0.90; (2) against the v2 grade model currently supplying the
  displayed grade, v3 wins on DDR (QWK 0.916 vs 0.840) and Messidor-2 (0.842
  vs 0.824), ties FGADR, but loses on IDRiD (0.745 vs 0.844) and on Mild
  recall (0.51/0.54/0.52 vs 0.62/0.68/0.80 on FGADR/DDR/IDRiD). So it is not
  a clean replacement for either deployed slot. Live app unchanged.

  Clear next step, not taken: v3's cal QWK was still climbing at epoch 14, so
  it is under-trained rather than converged -- more epochs is the cheapest
  remaining lever. Ensembling v3 with v2 (Phase 3, cut for time) is the other.
  Artifacts: `outputs/v3/best.pt` and per-epoch checkpoints (local,
  uncommitted -- 43MB each); `outputs/manifest.csv` and the 17.8GB 1024px
  cache under `training/data/` (gitignored) reproduce everything.

- **Deployed: the displayed grade is now an ENSEMBLE of v2 + v3.** v3 alone was
  not a clean replacement for either slot, but averaging its TTA probabilities
  with v2's is (`config.GRADE_ENSEMBLE`, `backend/main.py`). Blend weight 0.5
  was chosen on the multi-population calibration split -- sweeping 0.0-1.0 there
  picked 0.5 -- never on test. On the frozen test suite, v2 (previously
  deployed) -> ensemble:

  | Test set | QWK | Exact accuracy | Mild recall |
  |---|---|---|---|
  | DDR (2000) | 0.840 -> **0.917** | 0.725 -> **0.883** | 0.68 -> 0.66 |
  | FGADR (461) | 0.798 -> **0.808** | 0.679 -> **0.725** | 0.62 -> 0.55 |
  | Messidor-2 (872) | 0.824 -> **0.848** | 0.744 -> **0.767** | 0.17 -> **0.24** |
  | IDRiD (516) | **0.845** -> 0.800 | 0.595 -> **0.641** | **0.80** -> 0.56 |
  | mean | 0.827 -> **0.843** | 0.686 -> **0.754** | 0.57 -> 0.50 |

  **Exact grade accuracy improves on every one of the four populations**
  (+6.8 points on average) and QWK on three of four. Two honest costs: Mild
  recall drops 57% -> 50% (concentrated on IDRiD, 0.80 -> 0.56), and IDRiD's
  ordinal agreement drops even as its exact accuracy rises -- when it is wrong
  there it is wrong by more. Shipping it anyway is defensible specifically
  because **Mild is non-referable**: grade 1 and grade 0 both mean "do not
  refer", so the safety-critical decision does not depend on telling them
  apart, and that decision is still the ORIGINAL model's, unchanged at its
  original threshold.

  Mechanics: each member is fed the preprocessing it was trained on (v2:
  ben_graham_preprocess at 640 -> 380px; v3: ben_graham_fast at 1024 -> 512px)
  -- mixing them is a domain shift -- via a per-member transform, since
  `dataset.get_transforms` is hard-coded to 380 and would have silently fed the
  512px model the wrong scale. Grad-CAM comes from v2 but now explains the
  ENSEMBLE's chosen class (`tta.generate_tta` gained a `class_idx` override),
  so the heatmap matches the grade shown. A missing checkpoint is skipped with
  a warning, and if none are present the app falls back to the referral model,
  so grading never fails. Rollback: drop the v3 entry from
  `config.GRADE_ENSEMBLE`. Verified end to end through the real `/predict`
  endpoint on three FGADR test images -- probabilities within 0.002 of values
  computed independently from cached logits, referable probability identical.
  Cost: 18 forward passes per image instead of 12, plus a second preprocessing
  pass (latency not yet measured on an idle GPU -- the verification ran while
  v3 was still training).

- **Two further experiments closed the model work, both negative, both
  informative.** (1) *More epochs is a spent lever.* Resuming v3 for 10 more
  epochs (`train_v3.py --resume`) produced ZERO improvements: best 0.9048 vs the
  protected 0.9088, while training loss fell 0.587 -> 0.506 -- loss dropping
  while validation stays flat is overfitting, not headroom. An earlier reading
  of "still improving at epoch 14" was simply wrong. (2) *A stronger, higher-
  resolution model does not help the ensemble.* `benchmark_archs.py` measured
  what actually fits on this GPU and found EfficientNet-B3 badly underuses it:
  ConvNeXt-Tiny at **768px** runs at 25 img/s where B3 at 512px manages 10
  (depthwise convolutions are bandwidth-bound; ConvNeXt's dense convolutions
  use the tensor cores). So 768px -- previously assumed unaffordable, and the
  reason v3 settled for 512 -- was in fact cheaper than what we had already
  run. ConvNeXt-Tiny trained at 768px (`outputs/v4_convnext`, 16 epochs, 3.7 h)
  reached the best calibration score of any single model, **cal QWK 0.924 vs
  B3's 0.909**.

  It still did not ship, and the reason is the most useful thing learned here:

  | Combination (test suite) | mean QWK | mean Mild | IDRiD QWK |
  |---|---|---|---|
  | **deployed v2+v3** | **0.843** | **0.50** | **0.800** |
  | equal thirds v2+v3+v4 | 0.843 | 0.46 | 0.755 |
  | v2+v4 | 0.841 | 0.45 | 0.779 |
  | cal-best blend 0.1/0.5/0.4 | 0.835 | 0.45 | 0.740 |
  | v4 (ConvNeXt) alone | 0.825 | 0.41 | 0.695 |

  **The calibration split cannot see this failure.** `cal` contains only DDR,
  FGADR and Messidor-2 -- populations the model trains on -- so cal QWK rewards
  fitting those harder, and ConvNeXt duly won there while scoring WORST of any
  model on IDRiD (0.695), the one population no model has ever trained on. A
  model-selection metric drawn only from trained populations is systematically
  biased toward domain adaptation over generalization. The right fix is a
  calibration split containing a population held out from training entirely;
  that was not done here because IDRiD is small (516) and was deliberately
  reserved as the untouched final test.

  Model work is closed: no further training runs. Deployed configuration
  remains the v2+v3 grade ensemble plus the original referral model.


## Future work (deliberately deferred, not forgotten)

Two items are explicitly scoped OUT of this Round 1 submission - a
scoping decision, not an oversight, made once each item's own real cost
(mostly waiting on an external access grant) was weighed against Round 1's
actual deadline. (A third, DDR-scale ablation validation, was originally
deferred here too but was later pulled back into scope and completed -
see `matlab/README.md`'s "DDR-scale validation" section for that honest,
not-uniformly-flattering result.)

- **Neovascularization ground-truth expansion via FGADR** - access has
  now been granted and the Seg-set (1,842 images, 49 real NV masks vs. the
  current n=5) is on disk under the license's no-redistribution terms
  (`training/data/` is gitignored - never commit it). The NV detector has
  now been validated against it (n=49 positives, `matlab/segmentation/README.md`'s
  "Third-grader validation against FGADR"): 98.0% image sensitivity but only
  13.1% specificity and Dice 0.003 - directionally real (p=0.008) but not a
  working detector, confirming the MAPLES-DR result at ~10x the positives.
  The same run also checked MA/exudate/hemorrhage detectors (lesion hit rates
  hold up, but candidate counts do not rise with grade - see that section;
  swapping the per-image percentile for absolute cutoffs was tested and does
  NOT fix this, because response scale differs across imaging sources).
- **Mild-grade data and longer training** - the DR grading model already
  clears the brief's sensitivity/specificity targets (92.05%/87.43%), so
  this isn't blocking brief alignment, just general model quality/class
  balance on the hardest-to-distinguish grade. Deferred earliest in this
  project's timeline, still the lowest priority of the three.
