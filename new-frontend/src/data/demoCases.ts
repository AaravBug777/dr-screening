import { DemoPresetCase, ScreeningRecord } from '../types';

export const DEMO_PRESET_CASES: DemoPresetCase[] = [
  {
    id: 'case-normal-01',
    name: 'Normal Retina (Grade 0: No DR)',
    shortDescription: 'Healthy fundus with intact optic disc, clear macular avascular zone, and normal vascular branching.',
    canvasSeed: 'seed-normal-01',
    eyeSide: 'Right (OD)',
    patientInfo: {
      patientId: 'NETRA-UP-2026-0841',
      age: 48,
      sex: 'Female',
      diabetesDurationYears: 3,
      screeningCenter: 'PHC Chandpur Rural Health Center',
      district: 'Bijnor, Uttar Pradesh',
      operatorName: 'Sunita Devi (ASHA / Field Operator)',
      lastHbA1c: '6.4%',
      hypertensionHistory: false,
      contactNumber: '+91 98765 43210',
      notes: 'Routine annual screening camp. Asymptomatic vision.'
    },
    quality: {
      status: 'ACCEPTED',
      overallScore: 96,
      focusBlurScore: 95,
      illuminationScore: 97,
      contrastScore: 94,
      resolutionScore: 98,
      fieldOfViewScore: 96,
      feedbackReasons: [],
      recommendation: 'Image quality meets diagnostic screening thresholds (Snellen equivalent > 6/60).'
    },
    structureFindings: {
      opticDiscDetected: true,
      opticDiscConfidence: 99.1,
      opticDiscCoordinates: { x: 250, y: 250, radius: 48 },
      foveaDetected: true,
      foveaConfidence: 98.4,
      foveaCoordinates: { x: 420, y: 260, radius: 24 },
      vesselSegmentationScore: 97.5,
      vesselDensity: 'Normal physiological density (18.4%)',
      candidateLesionsDetected: false,
      lesionCount: {
        microaneurysms: 0,
        hemorrhages: 0,
        hardExudates: 0,
        cottonWoolSpots: 0,
        neovascularization: 0
      },
      lesionMarkers: []
    },
    grading: {
      stage: 'NO_DR',
      stageName: 'No Apparent Diabetic Retinopathy',
      stageNumber: 0,
      icdrDescription: 'No microaneurysms, hemorrhages, or exudates observed. Retina appears normal.',
      confidence: 98.2,
      probabilities: {
        noDR: 98.2,
        mild: 1.4,
        moderate: 0.3,
        severe: 0.1,
        pdr: 0.0
      },
      modelArchitecture: 'EfficientNet-B3 + Spatial Attention (TorchScript v2.2)',
      inferenceLatencyMs: 84
    },
    gradCam: {
      peakActivationRegion: 'Normal vascular arcades & optic disc physiological margins',
      attentionSummary: 'Neural network attention is distributed evenly across background retina without focal lesion hotspots.',
      lesionCorrelationScore: 12,
      clinicalPointers: [
        'No focal heat concentration in macula or temporal arcade',
        'Clean baseline vascular morphology',
        'Sharp foveal avascular zone boundaries'
      ],
      heatmapPoints: [
        { x: 250, y: 250, intensity: 0.3, radius: 60 },
        { x: 380, y: 240, intensity: 0.2, radius: 45 }
      ]
    },
    referral: {
      status: 'NOT_REFERABLE',
      priority: 'ROUTINE',
      referralProbability: 1.8,
      primaryReason: 'No retinopathy detected on automated screening.',
      suggestedAction: 'Advise continued glycemic control, healthy diet, and routine annual follow-up screening.',
      recommendedTimeframe: '12 months routine re-screening',
      teleOphthalmologyCenter: 'District Hospital Bijnor Tele-Ophthalmology Unit'
    }
  },
  {
    id: 'case-mild-02',
    name: 'Mild NPDR (Grade 1: Mild Non-Proliferative DR)',
    shortDescription: 'Presence of isolated microaneurysms in temporal arcade. No macular edema or exudates.',
    canvasSeed: 'seed-mild-02',
    eyeSide: 'Left (OS)',
    patientInfo: {
      patientId: 'NETRA-MH-2026-1102',
      age: 54,
      sex: 'Male',
      diabetesDurationYears: 6,
      screeningCenter: 'PHC Shirur Sub-District Camp',
      district: 'Pune Rural, Maharashtra',
      operatorName: 'Ramesh Patil (Optometrist / CHW)',
      lastHbA1c: '7.8%',
      hypertensionHistory: true,
      contactNumber: '+91 94230 11982',
      notes: 'Known Type 2 Diabetes for 6 years. Mild blurriness with reading glasses.'
    },
    quality: {
      status: 'ACCEPTED',
      overallScore: 92,
      focusBlurScore: 91,
      illuminationScore: 94,
      contrastScore: 90,
      resolutionScore: 95,
      fieldOfViewScore: 92,
      feedbackReasons: [],
      recommendation: 'Image quality acceptable for microaneurysm detection.'
    },
    structureFindings: {
      opticDiscDetected: true,
      opticDiscConfidence: 98.7,
      opticDiscCoordinates: { x: 250, y: 250, radius: 46 },
      foveaDetected: true,
      foveaConfidence: 97.2,
      foveaCoordinates: { x: 410, y: 255, radius: 25 },
      vesselSegmentationScore: 94.2,
      vesselDensity: 'Normal (17.8%) with mild focal vessel tortuosity',
      candidateLesionsDetected: true,
      lesionCount: {
        microaneurysms: 4,
        hemorrhages: 0,
        hardExudates: 0,
        cottonWoolSpots: 0,
        neovascularization: 0
      },
      lesionMarkers: [
        { id: 'm1', type: 'microaneurysm', x: 360, y: 210, severity: 'low', description: 'Tiny pinpoint capillary outpouching in superior temporal arcade' },
        { id: 'm2', type: 'microaneurysm', x: 385, y: 310, severity: 'low', description: 'Microaneurysm inferior temporal region' },
        { id: 'm3', type: 'microaneurysm', x: 440, y: 200, severity: 'low', description: 'Isolated red dot lesion' },
        { id: 'm4', type: 'microaneurysm', x: 470, y: 280, severity: 'low', description: 'Sub-clinical microaneurysm' }
      ]
    },
    grading: {
      stage: 'MILD_NPDR',
      stageName: 'Mild Non-Proliferative Diabetic Retinopathy',
      stageNumber: 1,
      icdrDescription: 'Microaneurysms only. No hard exudates, cotton wool spots, or hemorrhages detected.',
      confidence: 89.6,
      probabilities: {
        noDR: 7.2,
        mild: 89.6,
        moderate: 2.8,
        severe: 0.3,
        pdr: 0.1
      },
      modelArchitecture: 'EfficientNet-B3 + Spatial Attention (TorchScript v2.2)',
      inferenceLatencyMs: 89
    },
    gradCam: {
      peakActivationRegion: 'Superior and Inferior temporal vascular arcades',
      attentionSummary: 'Grad-CAM shows localized heat intensity around isolated microaneurysm clusters.',
      lesionCorrelationScore: 84,
      clinicalPointers: [
        'Focal attention on superior temporal microaneurysm (x:360, y:210)',
        'Low background retinal noise activation',
        'Macular center remains uninvolved'
      ],
      heatmapPoints: [
        { x: 365, y: 215, intensity: 0.78, radius: 42 },
        { x: 390, y: 315, intensity: 0.65, radius: 38 },
        { x: 445, y: 205, intensity: 0.58, radius: 35 }
      ]
    },
    referral: {
      status: 'NOT_REFERABLE',
      priority: 'LOW',
      referralProbability: 14.5,
      primaryReason: 'Mild NPDR (Microaneurysms only) without signs of diabetic macular edema or high-risk features.',
      suggestedAction: 'Early-stage diabetic eye disease. Reinforce strict HbA1c control (<7.0%), blood pressure management, and repeat screening in 6-12 months.',
      recommendedTimeframe: '6-12 months follow-up screening',
      teleOphthalmologyCenter: 'Sassoon General Hospital Tele-Eye Clinic, Pune'
    }
  },
  {
    id: 'case-moderate-03',
    name: 'Moderate NPDR (Grade 2: Moderate Non-Proliferative DR)',
    shortDescription: 'Multiple microaneurysms, dot-and-blot hemorrhages, and hard exudates in temporal quadrant.',
    canvasSeed: 'seed-mod-03',
    eyeSide: 'Right (OD)',
    patientInfo: {
      patientId: 'NETRA-KA-2026-0428',
      age: 59,
      sex: 'Female',
      diabetesDurationYears: 11,
      screeningCenter: 'PHC Nanjangud Community Eye Camp',
      district: 'Mysuru, Karnataka',
      operatorName: 'Dr. Ananya Rao / Sister Priya (Field Staff)',
      lastHbA1c: '8.9%',
      hypertensionHistory: true,
      contactNumber: '+91 98450 77123',
      notes: 'Long-standing diabetes. Reports intermittent floaters and decreased night contrast.'
    },
    quality: {
      status: 'ACCEPTED',
      overallScore: 94,
      focusBlurScore: 92,
      illuminationScore: 95,
      contrastScore: 93,
      resolutionScore: 96,
      fieldOfViewScore: 94,
      feedbackReasons: [],
      recommendation: 'Excellent diagnostic quality. Lesion boundaries crisply resolved.'
    },
    structureFindings: {
      opticDiscDetected: true,
      opticDiscConfidence: 99.4,
      opticDiscCoordinates: { x: 240, y: 250, radius: 48 },
      foveaDetected: true,
      foveaConfidence: 98.1,
      foveaCoordinates: { x: 415, y: 260, radius: 26 },
      vesselSegmentationScore: 93.8,
      vesselDensity: 'Moderate alteration (19.6%) with early capillary drop-out zones',
      candidateLesionsDetected: true,
      lesionCount: {
        microaneurysms: 12,
        hemorrhages: 7,
        hardExudates: 9,
        cottonWoolSpots: 2,
        neovascularization: 0
      },
      lesionMarkers: [
        { id: 'h1', type: 'hemorrhage', x: 350, y: 190, severity: 'medium', description: 'Dot-and-blot intraretinal hemorrhage' },
        { id: 'h2', type: 'hemorrhage', x: 440, y: 310, severity: 'medium', description: 'Deep retinal hemorrhage cluster' },
        { id: 'h3', type: 'hemorrhage', x: 380, y: 330, severity: 'medium', description: 'Blot hemorrhage near inferior arcade' },
        { id: 'e1', type: 'hardExudate', x: 420, y: 215, severity: 'medium', description: 'Circinate ring hard exudate lipid deposit' },
        { id: 'e2', type: 'hardExudate', x: 435, y: 230, severity: 'medium', description: 'Perimacular waxy yellow lipid accumulation' },
        { id: 'c1', type: 'cottonWool', x: 330, y: 290, severity: 'medium', description: 'Soft exudate (nerve fiber layer infarct)' },
        { id: 'm1', type: 'microaneurysm', x: 370, y: 240, severity: 'medium', description: 'Clustered microaneurysms' }
      ]
    },
    grading: {
      stage: 'MODERATE_NPDR',
      stageName: 'Moderate Non-Proliferative Diabetic Retinopathy',
      stageNumber: 2,
      icdrDescription: 'More than just microaneurysms but less than Severe NPDR. Hard exudates and dot-blot hemorrhages present.',
      confidence: 91.4,
      probabilities: {
        noDR: 2.1,
        mild: 4.8,
        moderate: 91.4,
        severe: 1.4,
        pdr: 0.3
      },
      modelArchitecture: 'EfficientNet-B3 + Spatial Attention (TorchScript v2.2)',
      inferenceLatencyMs: 92
    },
    gradCam: {
      peakActivationRegion: 'Perimacular hard exudate cluster and superior temporal hemorrhages',
      attentionSummary: 'Grad-CAM model strongly activates on both vascular hemorrhages and lipid exudates adjacent to the macula.',
      lesionCorrelationScore: 92,
      clinicalPointers: [
        'Primary peak over circinate lipid exudates (x:425, y:220) [Intensity: 0.94]',
        'Secondary peak over blot hemorrhage clusters in inferior temporal arcade',
        'Spatial evidence directly corresponds with detected lesion coordinates'
      ],
      heatmapPoints: [
        { x: 425, y: 220, intensity: 0.94, radius: 55 },
        { x: 355, y: 195, intensity: 0.86, radius: 48 },
        { x: 440, y: 310, intensity: 0.81, radius: 45 },
        { x: 380, y: 330, intensity: 0.72, radius: 40 }
      ]
    },
    referral: {
      status: 'REFERABLE',
      priority: 'HIGH',
      referralProbability: 87.0,
      primaryReason: 'Moderate NPDR with perimacular hard exudates and multiple intraretinal hemorrhages.',
      suggestedAction: 'Refer to District Tele-Ophthalmologist for OCT assessment (to rule out Center-Involving Diabetic Macular Edema) and dilated slit-lamp fundoscopy.',
      recommendedTimeframe: '2-4 weeks specialist consultation',
      teleOphthalmologyCenter: 'KR Hospital & Mysore Medical College Tele-Ophthalmology Hub'
    }
  },
  {
    id: 'case-severe-04',
    name: 'Severe NPDR (Grade 3: Severe Non-Proliferative DR)',
    shortDescription: 'Extensive 4-quadrant intraretinal hemorrhages, prominent venous beading, and multiple cotton wool spots.',
    canvasSeed: 'seed-sev-04',
    eyeSide: 'Left (OS)',
    patientInfo: {
      patientId: 'NETRA-TN-2026-0915',
      age: 62,
      sex: 'Male',
      diabetesDurationYears: 16,
      screeningCenter: 'PHC Thirukazhukundram Eye Camp',
      district: 'Chengalpattu, Tamil Nadu',
      operatorName: 'M. Selvam (Mobile Screening Officer)',
      lastHbA1c: '10.2%',
      hypertensionHistory: true,
      contactNumber: '+91 97910 88234',
      notes: 'Uncontrolled diabetes for 16 years. Visual acuity 6/24 OS. High risk of progression.'
    },
    quality: {
      status: 'ACCEPTED',
      overallScore: 91,
      focusBlurScore: 90,
      illuminationScore: 92,
      contrastScore: 91,
      resolutionScore: 94,
      fieldOfViewScore: 90,
      feedbackReasons: [],
      recommendation: 'Accepted. High-contrast pathology clearly visible.'
    },
    structureFindings: {
      opticDiscDetected: true,
      opticDiscConfidence: 98.9,
      opticDiscCoordinates: { x: 260, y: 250, radius: 47 },
      foveaDetected: true,
      foveaConfidence: 96.5,
      foveaCoordinates: { x: 425, y: 265, radius: 25 },
      vesselSegmentationScore: 89.2,
      vesselDensity: 'Markedly abnormal (24.1%) with significant venous beading & caliber irregularity',
      candidateLesionsDetected: true,
      lesionCount: {
        microaneurysms: 28,
        hemorrhages: 22,
        hardExudates: 14,
        cottonWoolSpots: 6,
        neovascularization: 0
      },
      lesionMarkers: [
        { id: 'h1', type: 'hemorrhage', x: 210, y: 160, severity: 'high', description: 'Superior nasal quadrant dense blot hemorrhage' },
        { id: 'h2', type: 'hemorrhage', x: 370, y: 160, severity: 'high', description: 'Superior temporal dense intraretinal hemorrhage' },
        { id: 'h3', type: 'hemorrhage', x: 380, y: 350, severity: 'high', description: 'Inferior temporal quadrant hemorrhage' },
        { id: 'h4', type: 'hemorrhage', x: 200, y: 340, severity: 'high', description: 'Inferior nasal quadrant hemorrhage (4-2-1 rule met)' },
        { id: 'c1', type: 'cottonWool', x: 340, y: 220, severity: 'high', description: 'Prominent cotton wool spot (ischemic nerve fiber infarct)' },
        { id: 'c2', type: 'cottonWool', x: 450, y: 290, severity: 'high', description: 'Multiple cotton wool spots' },
        { id: 'e1', type: 'hardExudate', x: 430, y: 210, severity: 'high', description: 'Extensive hard exudate deposits' }
      ]
    },
    grading: {
      stage: 'SEVERE_NPDR',
      stageName: 'Severe Non-Proliferative Diabetic Retinopathy',
      stageNumber: 3,
      icdrDescription: 'Any of: >20 intraretinal hemorrhages in each of 4 quadrants, definite venous beading in ≥2 quadrants, prominent IRMA in ≥1 quadrant.',
      confidence: 94.8,
      probabilities: {
        noDR: 0.2,
        mild: 0.8,
        moderate: 2.9,
        severe: 94.8,
        pdr: 1.3
      },
      modelArchitecture: 'EfficientNet-B3 + Spatial Attention (TorchScript v2.2)',
      inferenceLatencyMs: 95
    },
    gradCam: {
      peakActivationRegion: 'Multi-quadrant retinal ischemia and venous beading zones',
      attentionSummary: 'Broad, high-intensity activation spanning all 4 retinal quadrants correlating with diffuse hemorrhagic load.',
      lesionCorrelationScore: 96,
      clinicalPointers: [
        'Intense heat activations (>0.90) in 4 distinct retinal quadrants',
        'Strong focus on venous caliber irregularity and ischemia',
        '50% risk of progressing to PDR within 12 months without intervention'
      ],
      heatmapPoints: [
        { x: 370, y: 165, intensity: 0.98, radius: 58 },
        { x: 380, y: 350, intensity: 0.95, radius: 55 },
        { x: 210, y: 160, intensity: 0.88, radius: 50 },
        { x: 340, y: 220, intensity: 0.91, radius: 52 },
        { x: 430, y: 210, intensity: 0.86, radius: 46 }
      ]
    },
    referral: {
      status: 'REFERABLE',
      priority: 'HIGH',
      referralProbability: 98.4,
      primaryReason: 'Severe NPDR meeting ICDR 4-2-1 criteria with high impending risk of proliferative conversion.',
      suggestedAction: 'Urgent referral to District Retina Specialist / Tertiary Eye Hospital. Recommend fluorescein angiography (FFA) and close monitoring / prophylactic laser consideration.',
      recommendedTimeframe: 'Within 1-2 weeks',
      teleOphthalmologyCenter: 'Regional Institute of Ophthalmology, Chennai'
    }
  },
  {
    id: 'case-pdr-05',
    name: 'Proliferative DR (Grade 4: PDR)',
    shortDescription: 'Active neovascularization at disc (NVD/NVE), preretinal flame hemorrhages, and vitreous traction risk.',
    canvasSeed: 'seed-pdr-05',
    eyeSide: 'Right (OD)',
    patientInfo: {
      patientId: 'NETRA-RJ-2026-0319',
      age: 58,
      sex: 'Female',
      diabetesDurationYears: 19,
      screeningCenter: 'PHC Lalsot Rural Screening Camp',
      district: 'Dausa, Rajasthan',
      operatorName: 'Vikram Singh (Vision Technician)',
      lastHbA1c: '11.4%',
      hypertensionHistory: true,
      contactNumber: '+91 94140 66345',
      notes: 'Sudden dark web/floaters in right eye. Vision compromised (6/36). High-risk proliferative retinopathy.'
    },
    quality: {
      status: 'ACCEPTED',
      overallScore: 93,
      focusBlurScore: 92,
      illuminationScore: 94,
      contrastScore: 92,
      resolutionScore: 95,
      fieldOfViewScore: 93,
      feedbackReasons: [],
      recommendation: 'Accepted. Proliferative fronds and preretinal hemorrhage clearly visualised.'
    },
    structureFindings: {
      opticDiscDetected: true,
      opticDiscConfidence: 99.2,
      opticDiscCoordinates: { x: 240, y: 250, radius: 48 },
      foveaDetected: true,
      foveaConfidence: 95.8,
      foveaCoordinates: { x: 410, y: 260, radius: 26 },
      vesselSegmentationScore: 84.5,
      vesselDensity: 'Severe pathological neovascular mesh (28.9%)',
      candidateLesionsDetected: true,
      lesionCount: {
        microaneurysms: 35,
        hemorrhages: 30,
        hardExudates: 18,
        cottonWoolSpots: 8,
        neovascularization: 5
      },
      lesionMarkers: [
        { id: 'nv1', type: 'neovascularization', x: 255, y: 235, severity: 'high', description: 'Neovascularization at Optic Disc (NVD) - fragile new vessels' },
        { id: 'nv2', type: 'neovascularization', x: 390, y: 175, severity: 'high', description: 'Neovascularization Elsewhere (NVE) along superior arcade' },
        { id: 'h1', type: 'hemorrhage', x: 310, y: 220, severity: 'high', description: 'Boat-shaped Preretinal Hemorrhage' },
        { id: 'h2', type: 'hemorrhage', x: 430, y: 320, severity: 'high', description: 'Extensive flame and blot hemorrhages' },
        { id: 'c1', type: 'cottonWool', x: 350, y: 280, severity: 'high', description: 'Ischemic nerve fiber layer infarct' }
      ]
    },
    grading: {
      stage: 'PDR',
      stageName: 'Proliferative Diabetic Retinopathy (High Risk)',
      stageNumber: 4,
      icdrDescription: 'Definite neovascularization (NVD ≥ 1/3 disc area or NVE) or preretinal/vitreous hemorrhage.',
      confidence: 96.1,
      probabilities: {
        noDR: 0.1,
        mild: 0.2,
        moderate: 0.5,
        severe: 3.1,
        pdr: 96.1
      },
      modelArchitecture: 'EfficientNet-B3 + Spatial Attention (TorchScript v2.2)',
      inferenceLatencyMs: 98
    },
    gradCam: {
      peakActivationRegion: 'Optic Disc margins (NVD fronds) and preretinal hemorrhage basin',
      attentionSummary: 'Extreme focal Grad-CAM heat intensity centered on anomalous neovascular vessel fronds at optic disc and preretinal bleeding.',
      lesionCorrelationScore: 99,
      clinicalPointers: [
        'Maximum Grad-CAM activation (0.99) directly over optic disc neovascularization (NVD)',
        'Secondary intense heat over boat-shaped preretinal hemorrhage',
        'Sight-threatening condition requiring urgent anti-VEGF or Panretinal Photocoagulation (PRP)'
      ],
      heatmapPoints: [
        { x: 255, y: 235, intensity: 0.99, radius: 65 },
        { x: 310, y: 220, intensity: 0.94, radius: 55 },
        { x: 390, y: 175, intensity: 0.89, radius: 48 },
        { x: 430, y: 320, intensity: 0.82, radius: 44 }
      ]
    },
    referral: {
      status: 'REFERABLE',
      priority: 'EMERGENCY',
      referralProbability: 99.8,
      primaryReason: 'Proliferative Diabetic Retinopathy with active NVD and preretinal hemorrhage (Sight-Threatening Emergency).',
      suggestedAction: 'EMERGENCY REFERRAL to Tertiary Retina Institute for immediate Panretinal Photocoagulation (PRP laser) and/or Intravitreal Anti-VEGF injection to prevent tractional retinal detachment or vitreous hemorrhage.',
      recommendedTimeframe: 'Immediate (within 24-48 hours)',
      teleOphthalmologyCenter: 'SMS Medical College & Hospital Vitreoretinal Unit, Jaipur'
    }
  },
  {
    id: 'case-poor-quality-06',
    name: 'Poor Quality (Recapture Demonstration)',
    shortDescription: 'Severe optical blur, dark illumination artifact, and inadequate field of view requiring recapture.',
    canvasSeed: 'seed-blur-06',
    eyeSide: 'Left (OS)',
    patientInfo: {
      patientId: 'NETRA-WB-2026-0512',
      age: 65,
      sex: 'Male',
      diabetesDurationYears: 8,
      screeningCenter: 'PHC Diamond Harbour Mobile Unit',
      district: 'South 24 Parganas, West Bengal',
      operatorName: 'Kabir Das (Field Health Worker)',
      lastHbA1c: '8.1%',
      hypertensionHistory: true,
      contactNumber: '+91 93300 45192',
      notes: 'Patient blinking during flash. Dense media opacity / small pupil.'
    },
    quality: {
      status: 'REQUIRES_RECAPTURE',
      overallScore: 42,
      focusBlurScore: 38,
      illuminationScore: 45,
      contrastScore: 35,
      resolutionScore: 60,
      fieldOfViewScore: 40,
      feedbackReasons: [
        'Excessive optical blur and camera motion artifact',
        'Sub-optimal illumination (underexposed temporal quadrant)',
        'Low local contrast across vascular arcades',
        'Insufficient retinal field (<30 degrees effective coverage)'
      ],
      recommendation: 'IMAGE REQUIRES RECAPTURE: Dilate pupil with 0.5% Tropicamide (if per protocol), steady patient forehead, and recapture in darkened room.'
    },
    structureFindings: {
      opticDiscDetected: false,
      opticDiscConfidence: 41.2,
      foveaDetected: false,
      foveaConfidence: 33.0,
      vesselSegmentationScore: 39.5,
      vesselDensity: 'Uncertain due to low contrast and illumination shadows',
      candidateLesionsDetected: false,
      lesionCount: {
        microaneurysms: 0,
        hemorrhages: 0,
        hardExudates: 0,
        cottonWoolSpots: 0,
        neovascularization: 0
      },
      lesionMarkers: []
    },
    grading: {
      stage: 'NO_DR',
      stageName: 'Ungradable / Inconclusive',
      stageNumber: 0,
      icdrDescription: 'Image quality score (42/100) below diagnostic reliability threshold. Automated grading withheld for safety.',
      confidence: 38.0,
      probabilities: {
        noDR: 40.0,
        mild: 25.0,
        moderate: 20.0,
        severe: 10.0,
        pdr: 5.0
      },
      modelArchitecture: 'EfficientNet-B3 + Spatial Attention (TorchScript v2.2)',
      inferenceLatencyMs: 76
    },
    gradCam: {
      peakActivationRegion: 'Optical blur artifact zone',
      attentionSummary: 'Grad-CAM heat is diffuse and unreliable due to shadow artifacts and lack of anatomical clarity.',
      lesionCorrelationScore: 18,
      clinicalPointers: [
        'Severe motion blur and dark crescent artifact on temporal margin',
        'Reliable grading not possible without image recapture'
      ],
      heatmapPoints: [
        { x: 300, y: 300, intensity: 0.45, radius: 70 }
      ]
    },
    referral: {
      status: 'REFERABLE',
      priority: 'HIGH',
      referralProbability: 75.0,
      primaryReason: 'Inconclusive / Ungradable screening photograph. Protocol mandates repeat capture or clinical exam.',
      suggestedAction: 'Recapture fundus photograph. If still ungradable due to cataract/corneal opacity, refer to nearest eye center for slit-lamp biomicroscopy.',
      recommendedTimeframe: 'Same-day recapture or 2-week eye clinic visit',
      teleOphthalmologyCenter: 'Calcutta National Medical College Eye Department'
    }
  }
];

export const INITIAL_HISTORICAL_RECORDS: ScreeningRecord[] = [
  {
    id: 'rec-2026-0841',
    patientInfo: DEMO_PRESET_CASES[0].patientInfo,
    createdAt: '2026-08-27 10:45 AM',
    imageUrl: 'seed-normal-01',
    eyeSide: 'Right (OD)',
    quality: DEMO_PRESET_CASES[0].quality,
    structureFindings: DEMO_PRESET_CASES[0].structureFindings,
    grading: DEMO_PRESET_CASES[0].grading,
    gradCam: DEMO_PRESET_CASES[0].gradCam,
    referral: DEMO_PRESET_CASES[0].referral,
    reviewedByDoctor: true,
    doctorNotes: 'Fundus appears normal. Glycemic control reviewed with patient.',
    doctorConfirmedStage: 'NO_DR',
    status: 'REVIEWED'
  },
  {
    id: 'rec-2026-1102',
    patientInfo: DEMO_PRESET_CASES[1].patientInfo,
    createdAt: '2026-08-27 10:15 AM',
    imageUrl: 'seed-mild-02',
    eyeSide: 'Left (OS)',
    quality: DEMO_PRESET_CASES[1].quality,
    structureFindings: DEMO_PRESET_CASES[1].structureFindings,
    grading: DEMO_PRESET_CASES[1].grading,
    gradCam: DEMO_PRESET_CASES[1].gradCam,
    referral: DEMO_PRESET_CASES[1].referral,
    reviewedByDoctor: true,
    doctorNotes: 'Early microaneurysms noted in superior arcade. Follow-up scheduled for 6 months.',
    doctorConfirmedStage: 'MILD_NPDR',
    status: 'REVIEWED'
  },
  {
    id: 'rec-2026-0428',
    patientInfo: DEMO_PRESET_CASES[2].patientInfo,
    createdAt: '2026-08-27 09:30 AM',
    imageUrl: 'seed-mod-03',
    eyeSide: 'Right (OD)',
    quality: DEMO_PRESET_CASES[2].quality,
    structureFindings: DEMO_PRESET_CASES[2].structureFindings,
    grading: DEMO_PRESET_CASES[2].grading,
    gradCam: DEMO_PRESET_CASES[2].gradCam,
    referral: DEMO_PRESET_CASES[2].referral,
    reviewedByDoctor: false,
    status: 'PENDING_REVIEW'
  },
  {
    id: 'rec-2026-0915',
    patientInfo: DEMO_PRESET_CASES[3].patientInfo,
    createdAt: '2026-08-26 03:40 PM',
    imageUrl: 'seed-sev-04',
    eyeSide: 'Left (OS)',
    quality: DEMO_PRESET_CASES[3].quality,
    structureFindings: DEMO_PRESET_CASES[3].structureFindings,
    grading: DEMO_PRESET_CASES[3].grading,
    gradCam: DEMO_PRESET_CASES[3].gradCam,
    referral: DEMO_PRESET_CASES[3].referral,
    reviewedByDoctor: true,
    doctorNotes: 'Severe NPDR confirmed. Patient contacted and expedited for laser clinic appointment on Monday.',
    doctorConfirmedStage: 'SEVERE_NPDR',
    status: 'REVIEWED'
  },
  {
    id: 'rec-2026-0319',
    patientInfo: DEMO_PRESET_CASES[4].patientInfo,
    createdAt: '2026-08-26 01:20 PM',
    imageUrl: 'seed-pdr-05',
    eyeSide: 'Right (OD)',
    quality: DEMO_PRESET_CASES[4].quality,
    structureFindings: DEMO_PRESET_CASES[4].structureFindings,
    grading: DEMO_PRESET_CASES[4].grading,
    gradCam: DEMO_PRESET_CASES[4].gradCam,
    referral: DEMO_PRESET_CASES[4].referral,
    reviewedByDoctor: true,
    doctorNotes: 'High-risk PDR with active NVD. Emergency referral sent to SMS Medical College Vitreo-Retinal unit.',
    doctorConfirmedStage: 'PDR',
    status: 'REVIEWED'
  },
  {
    id: 'rec-2026-0512',
    patientInfo: DEMO_PRESET_CASES[5].patientInfo,
    createdAt: '2026-08-26 11:10 AM',
    imageUrl: 'seed-blur-06',
    eyeSide: 'Left (OS)',
    quality: DEMO_PRESET_CASES[5].quality,
    structureFindings: DEMO_PRESET_CASES[5].structureFindings,
    grading: DEMO_PRESET_CASES[5].grading,
    gradCam: DEMO_PRESET_CASES[5].gradCam,
    referral: DEMO_PRESET_CASES[5].referral,
    reviewedByDoctor: false,
    status: 'RECAPTURE_NEEDED'
  },
  // Two extra baseline (earlier) visits for existing demo patients, reusing
  // the same patientId + eyeSide as an already-defined record above, so the
  // Longitudinal Retinal Progression comparison has something to show out
  // of the box (a follow-up visit is otherwise required before it activates
  // at all -- see RetinalProgressionCompare.tsx). Placed last since array
  // order is this app's recency signal (newest-first) -- see
  // services/progressionAnalysis.ts's comment on why.
  {
    id: 'rec-2026-0841-baseline',
    patientInfo: DEMO_PRESET_CASES[0].patientInfo,
    createdAt: '2026-02-15 09:00 AM',
    imageUrl: 'seed-normal-01-baseline',
    eyeSide: 'Right (OD)', // same eye as rec-2026-0841
    quality: DEMO_PRESET_CASES[1].quality,
    structureFindings: DEMO_PRESET_CASES[1].structureFindings,
    grading: DEMO_PRESET_CASES[1].grading,
    gradCam: DEMO_PRESET_CASES[1].gradCam,
    referral: DEMO_PRESET_CASES[1].referral,
    reviewedByDoctor: true,
    doctorNotes: 'Mild NPDR with isolated microaneurysms. Counselled on strict glycemic control and re-screen in 6 months.',
    doctorConfirmedStage: 'MILD_NPDR',
    status: 'REVIEWED'
  },
  {
    id: 'rec-2026-1102-baseline',
    patientInfo: DEMO_PRESET_CASES[1].patientInfo,
    createdAt: '2026-02-14 02:30 PM',
    imageUrl: 'seed-mild-02-baseline',
    eyeSide: 'Left (OS)', // same eye as rec-2026-1102
    quality: DEMO_PRESET_CASES[0].quality,
    structureFindings: DEMO_PRESET_CASES[0].structureFindings,
    grading: DEMO_PRESET_CASES[0].grading,
    gradCam: DEMO_PRESET_CASES[0].gradCam,
    referral: DEMO_PRESET_CASES[0].referral,
    reviewedByDoctor: true,
    doctorNotes: 'No retinopathy at this visit. Routine annual re-screen advised.',
    doctorConfirmedStage: 'NO_DR',
    status: 'REVIEWED'
  }
];
