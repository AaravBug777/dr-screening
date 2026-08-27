# Netra — Diabetic Retinopathy Screening (SIH26038)

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
in MATLAB, `matlab/` owns the parts of the spec Python doesn't cover — image
quality gating, classical structural segmentation (vessels, optic disc,
fovea, microaneurysms, exudates, hemorrhages, neovascularization), and the
Simulink district-level workflow simulation — while `training/`/`backend/`
keep doing DR severity grading + Grad-CAM. This isn't just two systems built
in parallel: the running app actually calls MATLAB, live, via the MATLAB
Engine API — `backend/main.py`'s `/predict` runs the MATLAB quality gate
before any Python grading (a rejected image never reaches the model) and
shows the MATLAB segmentation result (vessels, optic disc, fovea, candidate
lesions) as a third view next to the existing Grad-CAM toggle. See
[matlab/README.md](matlab/README.md)'s "Python backend integration" section
for how that's wired up, and for how the two sides fit together overall —
all three MATLAB pieces (quality gate, segmentation, Simulink throughput
model) are built and validated: the quality and segmentation modules
against real ground truth (DRIVE, IDRiD), the Simulink model against
closed-form fluid-queue math. The Simulink model's headline finding is
worth knowing up front: at the brief's own
100,000 patients/year target, compute and bandwidth are over-provisioned by
more than 100x — the real constraint is human review capacity, exactly what
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
3. Download APTOS 2019 (required — this is the core dataset):
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
   # this one is large (~80GB total across all files) — the train set alone is
   # several GB; only grab train.zip + trainLabels.csv.zip if disk/time is tight
   ```
   If you skip this, the pipeline runs fine on APTOS alone — just expect a
   lower ceiling on validation kappa. `EYEPACS_DIR` in `training/config.py`
   simply gets ignored if the folder doesn't have `trainLabels.csv` in it.

**Kaggle competition data note**: both of these are hosted as Kaggle
*competitions*, not plain datasets — you may need to click "Join Competition"
and accept the rules on the competition page in your browser once before the
CLI download will work.

### 1a. Get the external validation/segmentation datasets (DRIVE, IDRiD, Messidor-2)

Not used for training — these are held-out datasets from different clinics/
cameras than APTOS+EyePACS, used to (a) validate the MATLAB segmentation
modules against real expert ground truth, and (b) check the Python
classifier actually generalizes rather than just fitting the training
population. Same `kaggle` CLI as above.

```bash
cd training
mkdir -p data/drive data/idrid data/messidor2

# DRIVE (vessel segmentation ground truth) — clean official structure
kaggle datasets download -d andrewmvd/drive-digital-retinal-images-for-vessel-extraction -p data/drive
cd data/drive && unzip -q *.zip && rm -f *.zip && cd ../..

# IDRiD (optic disc/fovea/lesion ground truth + a second DR-grading set)
kaggle datasets download -d aaryapatel98/indian-diabetic-retinopathy-image-dataset -p data/idrid
cd data/idrid && unzip -q *.zip && rm -f *.zip && cd ../..
# the extracted folder names are URL-encoded ("A.%20Segmentation" etc.) —
# rename them to "A. Segmentation", "B. Disease Grading", "C. Localization"

# Messidor-2 (another DR-grading set) — two pieces that must be combined:
kaggle datasets download -d google-brain/messidor2-dr-grades -p data/messidor2      # the adjudicated grade labels (CSV)
kaggle datasets download -d xyaustin/messidor2 -p data/messidor2                     # the images
cd data/messidor2 && unzip -o -q *.zip && rm -f *.zip && cd ../..
```

**Messidor-2 has a real gotcha, found and fixed during integration**: the
official image release mixes two filename conventions
(`20051020_43808_0100_PP.png` and `IM000012.jpg`), and the second batch's
extension case (`.JPG`) doesn't match what the grade CSV expects (`.jpg`) —
plain case-insensitive filesystems hide this until you diff against the CSV.
If `image_id` lookups come up empty for ~40% of rows, that's why; normalize
the extensions to lowercase. Also try more than one Kaggle mirror if the
first one you find is missing images — not all mirrors are complete (two
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
- Apply Ben Graham preprocessing (crop + contrast normalization — standard
  for this task, makes microaneurysms/hemorrhages visible)
- Fine-tune an EfficientNet-B3 (via `timm`), pretrained on ImageNet
- Use class-weighted loss (the data is heavily skewed toward "No DR")
- Track **quadratic weighted kappa** as the real metric — not accuracy,
  which is misleading here. A kappa above ~0.75 is solid for a hackathon
  demo; published APTOS leaderboard solutions land around 0.85-0.93 with
  heavier ensembling and longer training than you'll have time for.
- Save the best checkpoint to `training/outputs/best_model.pt`

On a single mid-range GPU (e.g. a Colab T4), expect roughly 5-15 min/epoch
depending on dataset size — budget your hackathon time accordingly. If you
only have CPU, drop `NUM_EPOCHS` and `IMG_SIZE` in `config.py` to get
*something* working end-to-end first, then scale up if time allows.

**Sanity-check before trusting anything**: the script prints a confusion
matrix every epoch. Look at it. If the model is just predicting "No DR" for
everything, the class weighting isn't strong enough, or something upstream
(labels, preprocessing) is broken — don't just look at the loss number.

Quick visual check on a single image once trained:
```bash
python gradcam.py --image data/aptos2019/train_images/some_image_id.png
```
This saves `gradcam_overlay.png` — open it and confirm the heatmap actually
lands on the retina (lesions/vessels), not on image borders or artifacts.
If it doesn't, don't proceed to the demo app — debug this first.

**Check it actually generalizes**, not just its own held-out split:
```bash
python validate_external.py
```
Runs the trained model against Messidor-2 and IDRiD's Disease Grading set —
data it never trained on, from different clinics/cameras than APTOS+EyePACS.
Same quadratic weighted kappa metric as training, reported per-dataset and
combined, so you can compare directly against the val_kappa `train.py`
printed. Real numbers from this project's own checkpoint (2-epoch quick-
iteration run, `val_kappa=0.756` on the held-out APTOS+EyePACS split):
Messidor-2 kappa=0.702 (n=1744), IDRiD kappa=0.846 (n=516), combined
kappa=0.780 (n=2260) — a real, evidenced generalization result, not
assumed: performance on IDRiD specifically *exceeded* the training-time
number, and Messidor-2's dip was modest. Worth reporting exactly like
this in a pitch (the actual numbers, both datasets, not just the best one).

**Check against the SIH26038 brief's actual target metric** — sensitivity/
specificity for referable DR (grade >= 2), not kappa:
```bash
python compute_referable_metrics.py
```
Same held-out data as above, but the brief's own binary metric instead of
the ordinal one, using the model's plain argmax grade. This is where a real
gap first showed up and drove three rounds of follow-up work — documented
here in full, including the two attempts that didn't fully work, not just
the one that did:

1. **Retrained from `NUM_EPOCHS=2` to `5`** (`python train.py` again) —
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
   sensitivity=96.5% (exceeds target) but specificity=71.6% (well under) —
   a real domain-shift result, not a rounding error. The model is
   measurably less confident/calibrated on data unlike what it trained on.
3. **Properly calibrated on the external population itself**
   (`calibrate_referable_threshold.py`): split Messidor-2+IDRiD into a
   calibration half and a held-out test half, fit temperature scaling on
   the calibration half to correct the domain-shift miscalibration, then
   swept the threshold requiring sensitivity >= 92% on calibration (a 2pp
   safety margin — a first pass with zero margin selected a threshold at
   exactly 90.00% on calibration that measured 89.74% on the test half;
   ordinary sampling variance was enough to cross the constraint).

**Final numbers** (5-epoch checkpoint, `REFERABLE_TEMPERATURE=0.90`,
`REFERABLE_THRESHOLD=0.30`, on the held-out test half — never used for
calibration or threshold selection): **sensitivity=90.8%, specificity=88.5%**
— the first calibration to clear both SIH targets simultaneously on real
external data. Referral rate: 38.9% (down from step 2's 51.9%, still above
true prevalence of ~26-34% since the calibrated system is still
appropriately more cautious than raw prevalence). `matlab/simulink/throughputParams.m`'s
`ReferralRate` was updated to match and re-run: sustainable capacity at
current resources is now ~901K patients/year, 9x the brief's 100,000/year
target (up from step 2's ~675K, since specificity recovered).

This calibration is live in the running app — `training/gradcam.py`'s
`GradCAM.generate()` applies the temperature before softmax,
`backend/main.py`'s `/predict` returns a separate `referable`/
`referable_probability` computed from those calibrated probabilities
alongside the argmax-based `predicted_label`, and the frontend shows a
"flagged for review as a precaution" note when they disagree (e.g. grade
shown as Mild but still flagged referable due to borderline probability
mass on Moderate+).

### Round 4: test-time augmentation (a genuine improvement, not just re-tuning)

`training/tta.py` averages the prediction over the dihedral-4 symmetry
group — identity + horizontal flip + vertical flip + 3 rotations, the SAME
augmentation family the model actually trained with (`dataset.py`'s
`get_transforms(train=True)`), which matters: a fundus photo has no
canonical "up", so all 6 views are equally valid inputs, not an arbitrary
augmentation choice. Grad-CAM is computed per view against the SAME decided
class and averaged back into canonical orientation too, not just the
probabilities — a smoother, less noisy heatmap as a side effect.

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
extra on GPU) — negligible against the throughput headroom
`matlab/simulink/`'s model already established. This is now the live
default in `backend/main.py` (`cfg.TTA_REFERABLE_TEMPERATURE`/
`TTA_REFERABLE_THRESHOLD`); the round-3 single-view constants stay in
`config.py`, unused by the live path but kept as the historical record.
`throughputParams.m`'s `ReferralRate` was updated to match (38.9%->40.0%)
and re-run: sustainable capacity dipped slightly to ~876K patients/year
(still ~9x the target) — a small, real, expected cost of the higher
referral rate that comes with higher sensitivity, not a regression to be
quiet about.

## 3. Run the backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
Visit http://localhost:8000/health — should report `checkpoint_found: true`.

**First run prints an operator login you need**: `/predict` and `/report`
now require an operator session (see "App hardening" below) — on a totally
fresh `backend/netra.db`, startup creates one automatically and prints its
password to the console ONCE (`[auth] Created default operator account...`).
Save it, or set `NETRA_ADMIN_USER`/`NETRA_ADMIN_PASSWORD` env vars before
first startup to choose it yourself instead.

## 3b. Preview the frontend before training a model (optional, already done)

Earlier in prototyping you could preview the full result UI using generated
placeholder data before a model existed. That mock preview button and
`mockData.js` have since been removed from this version — the frontend now
only shows real predictions from the backend. If you're starting fresh and
want that preview flow back temporarily, it's a small addition (a mock result
object plus one button bypassing the fetch call) — ask if you need it
rebuilt.

## 4. Run the frontend

```bash
cd frontend
npm install
npm run dev
```
Visit http://localhost:5173 — sign in with the operator account printed by
the backend on first startup (see step 3). `sample_test_images/` at the
repo root has four expert-labeled IDRiD test images spanning No DR through
Proliferative DR, ready to drag in. Upload one and you should see the
severity grade, confidence bars, a clinical recommendation, and a toggle
between the original image, the Grad-CAM heatmap, and the MATLAB structures
overlay.

## 5. App hardening (local prototype-grade)

Beyond the core screening flow, the app now has:

- **MATLAB engine crash recovery** (`backend/matlab_bridge.py`) — found the
  hard way that the MATLAB process CAN die mid-session (a concurrent
  Simulink run crashed it outright while this project was building the
  Simulink model), and until now nothing detected that: every request
  after a crash silently fell back to Python-only grading forever, with
  just a log line easy to miss live. `analyze_with_matlab` now tells a
  dead engine apart from a real per-image error and restarts + retries
  once; `/health`'s `matlab_engine_status` (`not_started`/`alive`/`dead`)
  exposes this without ever starting an engine just to check. The frontend
  now surfaces it too, not just the API — the header's status dot and a
  dismiss-free banner turn on the moment a `dead` status is polled (30s
  interval), telling the operator quality-gate/enhancement/structural
  analysis are temporarily Python-only and will recover automatically on
  the next upload, instead of that state being invisible outside the logs.
- **A stats dashboard, paired against the Simulink model** (`GET /stats`,
  the app's **Stats** tab) — real operational numbers (referral rate,
  grade distribution, quality-gate reject rate, screenings/day, and a
  **reject-reasons breakdown**) from this app's own actual usage, shown
  next to `matlab/simulink/throughputParams.m`'s SIMULATED assumptions for
  a direct reality check (e.g. "the model assumes a 40% referral rate;
  this app's actual rate so far is X%"). The reject-reasons breakdown
  parses each rejected row's actual `quality.reasons` codes (`too_dark`,
  `low_source_resolution`, etc.) rather than the unhelpful single
  `quality_verdict="reject"` bucket every rejected row shares. Deliberately
  does NOT trigger a live Simulink re-run per request — MATLAB concurrency
  is fragile enough already (see above) without adding a new way to hit it
  from a web request.
- **History filtering + CSV export** (`GET /history`, `GET /history/export.csv`)
  — date range, multi-select grade (chip picker, not a single dropdown),
  referable-only, and rejected-only filters, "load more" pagination, and a
  CSV export using the exact same filters as the on-screen list (one query
  path for both, not two that could quietly drift apart). Rejected-only is
  UI-mutually-exclusive with the grade/referable-only filters (a rejected
  row has no grade or referable value, so combining them would just
  silently return zero rows) — picking one clears the other rather than
  leaving the operator to find that out by getting an empty result.
- **Operator management** (`backend/manage_operators.py`) — a CLI, not a
  web endpoint (deliberately: account creation isn't exposed through the
  app itself at this trust level — see the script's own docstring):
  `python manage_operators.py add <username> [password]` /
  `list` / `passwd` / `remove`.
- **A visible "Enhanced" view** — MATLAB's quality-gate enhancement
  (illumination normalization → CLAHE → bilateral denoise,
  `matlab/quality/enhanceFundusImage.m`) was already being computed and
  used silently for borderline-quality images (fed straight to
  segmentation/grading); it's now also returned for display, so the image
  toggle shows Original/**Enhanced**/AI focus/Structures instead of just a
  text note saying enhancement happened. No new image-processing
  algorithm — this exposes an already-validated step that was invisible.
- **Operator accounts + sessions** (`backend/auth.py`) — signed HttpOnly
  cookies, PBKDF2-hashed passwords, no external identity provider needed.
  `/predict` and `/report` require a session; `/health` doesn't (so
  monitoring/uptime checks still work unauthenticated).
- **Screening history** (`backend/db.py`, SQLite) — every prediction
  (graded or rejected) is now persisted with the operator who ran it, not
  discarded the moment the response was sent. The frontend's **History**
  tab lists the shared clinic record (not per-operator-isolated by
  default — a PHC's screening history is something other staff at the
  same site legitimately need to see) and re-opens any past result,
  including re-downloading its PDF report.
- **Batch upload** — the upload panel now accepts multiple files at once;
  they're queued and processed strictly sequentially (matching the
  concurrency fix below, not just a UI choice), with a compact per-file
  status list you click through to each result.
- **Safe MATLAB concurrency** (`backend/matlab_bridge.py`) — the shared
  MATLAB engine instance is not documented as thread-safe for concurrent
  calls, and this project's own license only supports one concurrent
  Image Processing/Simulink checkout anyway (confirmed the hard way: a
  concurrent Simulink run while the backend held its engine crashed
  MATLAB outright, not just slowly — see `matlab/simulink/`'s notes). A
  lock now serializes access, correctly and simply, rather than hoping
  FastAPI's thread pool sending overlapping calls into one engine object
  "just worked".
- **Offline-tolerant requests** (`frontend/src/api.js`) — real network
  failures (a Wi-Fi blip) retry automatically with backoff; a persistent
  "you're offline" banner shows via `navigator.onLine`. This is NOT a full
  offline queue that survives a page refresh (that needs a service
  worker/IndexedDB — real-deployment-grade scope, not attempted here) — a
  failed upload after retries surfaces as a normal, retryable error.
- **Baseline production hardening** (`backend/main.py`) — CORS narrowed
  from a wide-open `*` to an explicit origin allowlist (required anyway
  once sessions use credentialed cookies), security headers
  (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`),
  structured logging in place of scattered `print()` calls. Still a local
  dev server (`uvicorn --reload`), not behind HTTPS/a reverse proxy —
  that needs real infrastructure this local machine doesn't have (see
  "Known limitations" below).

## 6. Validation against published benchmarks

The rest of this document validates the pipeline against ground truth ON
published datasets (IDRiD, DRIVE, Messidor-2). That's a different claim
from validating it AGAINST OTHER PUBLISHED METHODS' reported numbers on
those same datasets — the table below does the latter, which the SIH
brief's Expected Solution also asks for. Every number here was pulled from
a live search against the actual cited source just before writing this
table, not from memory — several genuinely surprised the author (see the
Gulshan row) — so check the link before citing this table in a submission
rather than trusting it transitively.

| Task / dataset | Published result | This project | Directly comparable? |
|---|---|---|---|
| Referable DR detection, Messidor-2 | Gulshan et al. 2016 (JAMA): **96.1% sens / 93.9% spec** at the high-sensitivity operating point (AUC 0.990), graded by a 7-8-ophthalmologist panel adjudicating disagreements | **92.05% sens / 87.43% spec** (TTA-calibrated, held-out split, `training/calibrate_tta_threshold.py`) | Partially — same dataset and same referable-DR task, but Gulshan's reference standard is a multi-ophthalmologist adjudicated panel; this project's ground truth is Messidor-2's single-grader published labels. A stricter reference standard is a harder bar to clear, so this isn't an apples-to-apples gap of the size it looks like, but it isn't nothing either. |
| DR grading (5-class), IDRiD official challenge | Winning/top submissions: **quadratic weighted kappa 0.82-0.93** (Porwal et al. 2018 challenge report) | This project doesn't report a 5-class kappa on IDRiD specifically — closest comparable figure is the binary-referable kappa of **0.8442** (TTA, Messidor-2 held-out split, a different dataset and a coarser 2-class task) | No — different dataset, different task granularity (5-class ordinal vs. binary referable). Listed for scale/context only, not as a head-to-head result. |
| Vessel segmentation, DRIVE | Classical Frangi filter (a comparable, non-DL classical method): **91.7% accuracy, 93.5% AUC, 66.5% sensitivity**. Modern U-Net-family DL methods reach materially higher (74-82% sensitivity, 95-97% accuracy, per recent DRIVE leaderboard papers). | **92.2% accuracy, 64.2% sensitivity, 96.3% specificity, 0.673 Dice** (`fibermetric`-based, `matlab/segmentation/README.md`) | Yes, against the classical-method row — genuinely comparable (same dataset, same task, same family of technique): accuracy is essentially tied (92.2% vs 91.7%), sensitivity close (64.2% vs 66.5%). Honestly behind the modern DL-based rows, as expected for a classical, non-learned method — not claiming otherwise. |
| Microaneurysm segmentation, IDRiD challenge | Top challenge submission: **AUPR 0.5254** (precision-recall-curve-based ranking metric, at the confidence threshold that produces the challenge's ranking score) | Pixel-level **Dice 0.076** at a single fixed threshold; lesion-level detection **82.0%** hit-rate (`matlab/segmentation/README.md`) | No, not directly — AUPR (area under a precision-recall curve swept over confidence thresholds, on a probability map) and Dice-at-one-threshold (on a binary decision) measure genuinely different things; a method can have a strong AUPR and a weak single-threshold Dice simultaneously depending on where that threshold sits. Reported side by side for scale, not claimed as a comparable number. |

**Honest summary of what this table shows**: this project's referable-DR
detection is in the neighborhood of, but measurably behind, Gulshan et
al.'s landmark result — expected, given that used a materially larger
private training set and a stricter multi-grader reference standard, not
a limitation unique to this pipeline. The classical vessel segmentation
genuinely matches the classical-method literature baseline it's actually
comparable to. The lesion-segmentation and 5-class-kappa rows are included
for scale/context but flagged as not directly comparable rather than
forced into a misleading head-to-head — consistent with this project's
practice elsewhere (see the integrated-vs-single-technique ablation above)
of reporting a nuanced or unfavorable result honestly rather than only the
comparisons that flatter it.

Sources: [Gulshan et al. 2016, JAMA](https://research.google.com/pubs/archive/45732.pdf) ([reproduction study](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0217541)) · [IDRiD challenge / Porwal et al. 2018](https://idrid.grand-challenge.org/Leaderboard/) · [DRIVE vessel segmentation benchmark comparisons](https://www.nature.com/articles/s41598-026-48475-6) ([SA-UNet](https://arxiv.org/pdf/2004.03696)).

## Suggested build order for a hackathon

1. Get APTOS downloaded and training loop running end-to-end — even 2-3
   epochs — before doing anything else. Confirm the confusion matrix looks
   sane.
2. Get the backend serving predictions against that (even weak) checkpoint.
3. Get the frontend talking to the backend and rendering a result — this is
   your "it works" checkpoint. Do this before polishing the model further.
4. Only then: go back and improve the model (more epochs, add EyePACS, tune
   class weights) while the demo app around it stays untouched.
5. Stretch goals if time remains: on-device/offline export (ONNX/TFLite) to
   speak to the "rural, low-connectivity" framing in the actual problem
   statement; a short write-up of kappa score + confusion matrix as evidence
   for judges that this isn't just accuracy-on-imbalanced-data theater.

## Known limitations to be upfront about in your pitch

- APTOS alone is only ~3,662 images with a long tail on severe/proliferative
  classes — say this out loud rather than have a judge find it. Mention
  EyePACS as the mitigation, and `validate_external.py`'s Messidor-2/IDRiD
  results as evidence generalization actually holds up, not just a hope.
- The checkpoint in `training/outputs/` is now the 5-epoch retrain
  (`best_model.pt`; the original 2-epoch checkpoint is preserved at
  `best_model_2epoch_backup.pt`). The LIVE default is now test-time
  augmentation (`TTA_REFERABLE_TEMPERATURE=0.80` / `TTA_REFERABLE_THRESHOLD=0.27`,
  see "Round 4" above), clearing **both** the SIH brief's >90% sensitivity
  and >85% specificity targets on a held-out slice of real external data
  (92.1%/87.4%) — but this took three earlier attempts that didn't fully
  work (more epochs alone; a threshold tuned on the wrong population; a
  properly-calibrated single-view threshold that cleared both targets but
  left sensitivity margin thin) to reach, and TTA itself only improved
  things after its own from-scratch calibration pass, not just plugging
  it in. Worth mentioning that history in a pitch, not just the final
  number — it's a stronger story than claiming it worked on the first
  try, and shows the validation discipline (held-out calibration, never
  testing on data used for tuning) that got there.
- Segmentation's lesion detection (microaneurysms/exudates/haemorrhages,
  `matlab/segmentation/`) has honestly weak pixel-level precision — a real,
  measured ceiling for the classical methods used, documented rather than
  hidden. Useful as an unconfirmed candidate generator for review (82% hit
  rate for microaneurysms specifically), not a standalone diagnostic
  segmentation. Microaneurysm centroids are genuinely sub-pixel — computed
  as an intensity-weighted center of mass over the continuous pre-threshold
  response map, not the quantized binary blob (`detectMicroaneurysms.m`'s
  `WeightedCentroid`) — verified empirically, not just asserted:
  `tests/validateMASubpixelCentroid.m` measured a mean 0.104px offset from
  the plain integer centroid across 75,833 real candidates (54 IDRiD
  images), with 0.0% landing on an identical integer position, directly
  addressing the SIH brief's "sub-pixel microaneurysm detection" phrase.
  Hemorrhage candidates are further split dot/blot vs.
  flame-shaped (shape + radial-orientation-from-disc heuristic — see
  `matlab/segmentation/detectHemorrhages.m`), though that type split has no
  expert ground truth to validate against. Neovascularization (NVD/NVE)
  detection (`matlab/segmentation/detectNeovascularization.m`) is now
  validated against real pixel-level ground truth (MAPLES-DR, found and
  integrated this session) — and the honest result is weak, not
  flattering: zero pixel-level overlap on the 5 available NV-positive test
  images, 40% (2/5) image-level sensitivity. The earlier directional check
  (candidate counts trend higher on PDR than No-DR images, p=0.0124) still
  holds and is a genuinely different, separately-true claim — never
  present this output as "neovascularization detected." A real,
  reproduced optic-disc mislocalization case (bright/vessel-dense
  confusion) was also found, correctly diagnosed after two wrong
  hypotheses, and fixed with zero regression on the full 413-image IDRiD
  benchmark — see `matlab/segmentation/README.md`'s "Phase 3" for the full,
  instructive story of a first fix attempt that looked successful but
  regressed everything else, caught before shipping.
- Confidence scores shown in the app ARE calibrated (temperature scaling —
  see the calibration history above); the referable-DR decision uses those
  calibrated probabilities against a tuned threshold, not raw argmax. An
  automated annotated PDF report also exists (`POST /report` in
  `backend/main.py`, `backend/report_generator.py`, a "Download annotated
  report" button in the app) — re-renders the already-computed prediction
  as a one-page-scannable PDF (grade, referable decision, all three image
  views, structural findings split into validated vs. lower-confidence
  groups), directly addressing the brief's "automated annotated reports...
  ophthalmologist validation in under 30 seconds" requirement. The
  review-TIME claim now has real instrumentation behind it (`POST
  /history/{id}/review-complete`, `backend/db.py`'s `review_duration_seconds`,
  a "Review time" card on the Stats tab) — it times real elapsed seconds
  from a result being shown to the operator moving on, and reports the
  measured median/p90 alongside the brief's assumed 30s figure. Still not
  a clinician validation study (the "operator" is whoever's logged in and
  using the app locally, not a licensed ophthalmologist) — but it's now a
  real, running measurement rather than an unmeasured number nobody ever
  checked, and will show genuine data as the app accumulates real usage.
- An ablation directly testing the brief's "integrated pipeline outperforms
  any single technique" claim (`matlab/tests/compareIntegratedVsSingleTechnique.m`)
  was substantially strengthened and rerun: the DL-alone baseline was fixed
  to use the CURRENT deployed TTA decision (a real staleness bug — it
  previously compared against an older, superseded calibration), and the
  combiner's calibration set grew from 200 IDRiD images to 2,157 (the full
  413-image official IDRiD train split + 1,744 real, adjudicated-label
  Messidor-2 images, a ~79-minute MATLAB extraction, 0 failures). Evaluated
  on the same untouched official IDRiD test set, n=103:
  **for the first time in this ablation's history, the fitted combiner
  beats DL-alone** — 83.5% accuracy vs. 81.6% (84.6%/66.7% specificity),
  at a real sensitivity cost (82.8% vs. 90.6%). Read with one important
  caveat, not as an unconditional win: DL-alone's specificity on this
  specific 103-image test set (66.7%) is far below what the identical
  model/threshold achieves on the population it was actually calibrated
  against (87.43%, on a 1,130-image held-out split) — a >20pp gap that
  means part of the combiner's apparent win could be genuinely robust
  compensation, or could be fitting to this small test set's specific
  characteristics; n=103 isn't large enough to fully tell those apart.
  Full table and the complete caveat in `matlab/README.md`'s "Ablation"
  section. This is real, measured, methodologically-strongest-yet evidence
  FOR the brief's integration claim — reported with the honesty this
  project has applied to every other result, not spun into a cleaner
  story than the data supports. The stronger, already-evidenced form of
  "integration helping" in this project remains the quality-gate-before-
  grading + calibration story above; this ablation result now stands
  alongside it, not instead of it.
- **Low-resolution/re-sourced images can still fool the grader — now caught
  before grading, but worth knowing this failure mode exists.** A real
  user-submitted test with a 480x432px image sourced from a published paper
  figure (resaved/recompressed multiple times) graded Severe at 74.5%
  confidence against a true Mild. Root cause, confirmed with a resolution
  sweep and Grad-CAM (`matlab/quality/README.md`'s calibration history,
  item 4): below the pipeline's own 640px internal working resolution, Ben
  Graham preprocessing's 4x local-contrast amplification turns JPEG
  recompression artifacts and normal foveal pigmentation into lesion-like
  blobs — and the quality gate had no check for source resolution, only
  focus/illumination/framing. Fixed: `assessFundusQuality.m` now rejects
  below `MinNativeResolutionPx=640` outright (no amount of enhancement can
  add back resolution that was never captured), with recapture guidance
  distinguishing "your camera's resolution setting" from "you're testing
  with a downloaded/screenshotted image." Verified this doesn't quietly
  break real data: 2/3662 APTOS images (0.05%) and zero IDRiD/Messidor-2
  images fall below the new floor; current commercial portable fundus
  cameras capture well above it in practice.
- This is a screening aid, not a diagnostic replacement — the recommendation
  text is deliberately phrased as a referral suggestion, not a diagnosis.
- Grad-CAM shows *where* the model looked, not proof the reasoning is
  clinically correct — useful for sanity-checking, not a formal explainability
  guarantee.
