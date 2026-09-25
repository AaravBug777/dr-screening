import { DRStage, RetinalStructureFinding, GradCAMAnalysis } from '../types';

export interface RenderFundusOptions {
  seed: string;
  stage?: DRStage;
  width?: number;
  height?: number;
  enhanced?: boolean;
  showOpticDisc?: boolean;
  showFovea?: boolean;
  showVessels?: boolean;
  showLesions?: boolean;
  showGradCam?: boolean;
  gradCamOpacity?: number; // 0.0 to 1.0
  qualityStatus?: 'ACCEPTED' | 'REQUIRES_RECAPTURE';
  isBlurry?: boolean;
  structureFindings?: RetinalStructureFinding;
  gradCamData?: GradCAMAnalysis;
}

// Pseudo-random deterministic generator based on string seed
function createSeededRandom(seedStr: string) {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i);
    hash |= 0;
  }
  return function () {
    hash = (hash * 9301 + 49297) % 233280;
    return Math.abs(hash / 233280);
  };
}

export function drawFundusOnCanvas(
  canvas: HTMLCanvasElement,
  options: RenderFundusOptions
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = options.width || 600;
  const height = options.height || 600;
  canvas.width = width;
  canvas.height = height;

  const rng = createSeededRandom(options.seed || 'default-fundus');
  const isBlurry = options.isBlurry || options.qualityStatus === 'REQUIRES_RECAPTURE' || options.seed.includes('blur');
  const enhanced = !!options.enhanced;

  // 1. Fill outer background black (eyepiece frame)
  ctx.fillStyle = '#060709';
  ctx.fillRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.45;

  // Clip circular aperture
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.clip();

  // 2. Base Retinal Orange-Red Gradient
  const baseGrad = ctx.createRadialGradient(
    centerX - radius * 0.2,
    centerY - radius * 0.1,
    radius * 0.1,
    centerX,
    centerY,
    radius
  );

  if (isBlurry && !enhanced) {
    baseGrad.addColorStop(0, '#5a1c11');
    baseGrad.addColorStop(0.5, '#40120a');
    baseGrad.addColorStop(0.85, '#260905');
    baseGrad.addColorStop(1, '#110302');
  } else if (enhanced) {
    // CLAHE & High-contrast enhanced colors
    baseGrad.addColorStop(0, '#c7441c');
    baseGrad.addColorStop(0.4, '#a83212');
    baseGrad.addColorStop(0.75, '#781c08');
    baseGrad.addColorStop(1, '#3b0c03');
  } else {
    // Standard clinical fundus orange-red
    baseGrad.addColorStop(0, '#b83f1d');
    baseGrad.addColorStop(0.4, '#942b10');
    baseGrad.addColorStop(0.8, '#631806');
    baseGrad.addColorStop(1, '#2a0802');
  }

  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, width, height);

  // 3. Choroidal striae / subtle background texture
  ctx.save();
  ctx.globalAlpha = enhanced ? 0.25 : 0.12;
  for (let i = 0; i < 35; i++) {
    ctx.strokeStyle = i % 2 === 0 ? '#450d03' : '#db582a';
    ctx.lineWidth = 1 + rng() * 3;
    ctx.beginPath();
    const sx = centerX - radius + rng() * radius * 2;
    const sy = centerY - radius + rng() * radius * 2;
    ctx.moveTo(sx, sy);
    ctx.bezierCurveTo(
      sx + (rng() - 0.5) * 80,
      sy + (rng() - 0.5) * 80,
      sx + (rng() - 0.5) * 120,
      sy + (rng() - 0.5) * 120,
      sx + (rng() - 0.5) * 180,
      sy + (rng() - 0.5) * 180
    );
    ctx.stroke();
  }
  ctx.restore();

  // 4. Optic Disc (Nasal side position)
  const discX = centerX - radius * 0.42;
  const discY = centerY + radius * 0.02;
  const discR = radius * 0.2;

  // Optic disc halo
  const discGrad = ctx.createRadialGradient(
    discX,
    discY,
    discR * 0.2,
    discX,
    discY,
    discR
  );
  discGrad.addColorStop(0, enhanced ? '#fff0b8' : '#fce8a4');
  discGrad.addColorStop(0.5, enhanced ? '#fab84e' : '#e69837');
  discGrad.addColorStop(0.85, enhanced ? '#d96c21' : '#b85116');
  discGrad.addColorStop(1, 'transparent');

  ctx.fillStyle = discGrad;
  ctx.beginPath();
  ctx.arc(discX, discY, discR, 0, Math.PI * 2);
  ctx.fill();

  // Physiological cup (central bright depression)
  ctx.fillStyle = enhanced ? '#fffde8' : '#fff5cc';
  ctx.beginPath();
  ctx.ellipse(discX - 2, discY, discR * 0.4, discR * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  // 5. Macula Lutea & Fovea Centralis (Temporal side position)
  const maculaX = centerX + radius * 0.28;
  const maculaY = centerY + radius * 0.04;
  const maculaR = radius * 0.24;

  const maculaGrad = ctx.createRadialGradient(
    maculaX,
    maculaY,
    maculaR * 0.1,
    maculaX,
    maculaY,
    maculaR
  );
  maculaGrad.addColorStop(0, enhanced ? '#420d04' : '#4d1205');
  maculaGrad.addColorStop(0.4, enhanced ? '#6e1d08' : '#731e08');
  maculaGrad.addColorStop(1, 'transparent');

  ctx.fillStyle = maculaGrad;
  ctx.beginPath();
  ctx.arc(maculaX, maculaY, maculaR, 0, Math.PI * 2);
  ctx.fill();

  // Foveal reflex (tiny central dark pinpoint)
  ctx.fillStyle = '#210501';
  ctx.beginPath();
  ctx.arc(maculaX, maculaY, 4, 0, Math.PI * 2);
  ctx.fill();

  // 6. Major Retinal Blood Vessels (Arcades arching from optic disc around macula)
  ctx.save();
  if (isBlurry && !enhanced) {
    ctx.filter = 'blur(4px)';
    ctx.globalAlpha = 0.55;
  }

  // Draw vessel branches helper
  const drawVesselTree = (
    startX: number,
    startY: number,
    ctrl1X: number,
    ctrl1Y: number,
    ctrl2X: number,
    ctrl2Y: number,
    endX: number,
    endY: number,
    baseWidth: number,
    isArtery = false
  ) => {
    // Veins are darker crimson/purplish, Arteries are brighter vermilion with central light reflex
    const vesselColor = isArtery
      ? enhanced ? '#e6391d' : '#bd2911'
      : enhanced ? '#660b0b' : '#570808';

    ctx.strokeStyle = vesselColor;
    ctx.lineWidth = baseWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(ctrl1X, ctrl1Y, ctrl2X, ctrl2Y, endX, endY);
    ctx.stroke();

    if (isArtery && enhanced && baseWidth > 2) {
      // Arteriolar light reflex (bright central highlight)
      ctx.strokeStyle = 'rgba(255, 230, 200, 0.4)';
      ctx.lineWidth = baseWidth * 0.3;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.bezierCurveTo(ctrl1X, ctrl1Y, ctrl2X, ctrl2Y, endX, endY);
      ctx.stroke();
    }
  };

  // Superior Temporal Arcade
  drawVesselTree(discX, discY, discX + 30, discY - 110, maculaX - 30, discY - 140, maculaX + 110, discY - 85, 4.8, false);
  drawVesselTree(discX + 2, discY - 2, discX + 25, discY - 100, maculaX - 25, discY - 130, maculaX + 100, discY - 80, 3.2, true);

  // Sub-branches superior temporal
  drawVesselTree(discX + 50, discY - 80, discX + 90, discY - 130, discX + 130, discY - 150, discX + 160, discY - 160, 2.2, false);
  drawVesselTree(maculaX - 10, discY - 135, maculaX + 20, discY - 160, maculaX + 50, discY - 170, maculaX + 80, discY - 175, 1.8, true);

  // Inferior Temporal Arcade
  drawVesselTree(discX, discY, discX + 30, discY + 110, maculaX - 30, discY + 140, maculaX + 110, discY + 85, 5.0, false);
  drawVesselTree(discX + 2, discY + 2, discX + 25, discY + 100, maculaX - 25, discY + 130, maculaX + 100, discY + 80, 3.4, true);

  // Sub-branches inferior temporal
  drawVesselTree(discX + 45, discY + 80, discX + 85, discY + 130, discX + 120, discY + 155, discX + 155, discY + 165, 2.0, false);
  drawVesselTree(maculaX - 5, discY + 135, maculaX + 30, discY + 160, maculaX + 60, discY + 170, maculaX + 90, discY + 175, 1.8, true);

  // Nasal Superior & Inferior branches
  drawVesselTree(discX, discY, discX - 60, discY - 70, discX - 100, discY - 100, discX - 130, discY - 120, 3.6, false);
  drawVesselTree(discX, discY, discX - 50, discY - 60, discX - 90, discY - 85, discX - 120, discY - 100, 2.4, true);
  drawVesselTree(discX, discY, discX - 60, discY + 70, discX - 100, discY + 100, discX - 130, discY + 120, 3.8, false);
  drawVesselTree(discX, discY, discX - 50, discY + 60, discX - 90, discY + 85, discX - 120, discY + 100, 2.5, true);

  // Perimacular capillaries (small terminal vessels framing the FAZ)
  for (let a = 0; a < 14; a++) {
    const angle = (a / 14) * Math.PI * 2;
    const innerDist = maculaR * 0.45 + rng() * 15;
    const outerDist = maculaR * 1.1 + rng() * 30;
    ctx.strokeStyle = '#6e1106';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(maculaX + Math.cos(angle) * outerDist, maculaY + Math.sin(angle) * outerDist);
    ctx.lineTo(maculaX + Math.cos(angle) * innerDist, maculaY + Math.sin(angle) * innerDist);
    ctx.stroke();
  }
  ctx.restore();

  // 7. Retinopathy Lesions (Stage specific)
  const stage = options.stage || 'NO_DR';
  const seed = options.seed;

  if (stage !== 'NO_DR' && !isBlurry) {
    ctx.save();

    // A. Microaneurysms (Grade 1, 2, 3, 4)
    if (stage === 'MILD_NPDR' || stage === 'MODERATE_NPDR' || stage === 'SEVERE_NPDR' || stage === 'PDR') {
      const maCount = stage === 'MILD_NPDR' ? 5 : stage === 'MODERATE_NPDR' ? 14 : stage === 'SEVERE_NPDR' ? 28 : 35;
      for (let i = 0; i < maCount; i++) {
        const maX = centerX - radius * 0.3 + rng() * radius * 0.9;
        const maY = centerY - radius * 0.5 + rng() * radius * 1.0;
        const maRad = 1.2 + rng() * 1.8;

        ctx.fillStyle = '#8f0707';
        ctx.beginPath();
        ctx.arc(maX, maY, maRad, 0, Math.PI * 2);
        ctx.fill();

        // Tiny dark core
        ctx.fillStyle = '#470202';
        ctx.beginPath();
        ctx.arc(maX, maY, maRad * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // B. Hard Exudates (Waxy yellow lipid deposits) - Grade 2, 3, 4
    if (stage === 'MODERATE_NPDR' || stage === 'SEVERE_NPDR' || stage === 'PDR') {
      const exCount = stage === 'MODERATE_NPDR' ? 12 : stage === 'SEVERE_NPDR' ? 22 : 18;
      // Clustered near macula
      for (let i = 0; i < exCount; i++) {
        const exX = maculaX - 45 + rng() * 90;
        const exY = maculaY - 55 + rng() * 110;
        const exRad = 1.8 + rng() * 3.5;

        // Circinate ring or fleck
        ctx.fillStyle = enhanced ? '#fffab0' : '#faea87';
        ctx.beginPath();
        ctx.ellipse(exX, exY, exRad, exRad * (0.6 + rng() * 0.8), rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(exX, exY, exRad * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // C. Intraretinal Hemorrhages (Blot & Dot hemorrhages) - Grade 2, 3, 4
    if (stage === 'MODERATE_NPDR' || stage === 'SEVERE_NPDR' || stage === 'PDR') {
      const hemCount = stage === 'MODERATE_NPDR' ? 8 : stage === 'SEVERE_NPDR' ? 24 : 18;
      for (let i = 0; i < hemCount; i++) {
        const hx = centerX - radius * 0.4 + rng() * radius * 1.0;
        const hy = centerY - radius * 0.6 + rng() * radius * 1.2;
        const hr = 2.5 + rng() * 6.0;

        ctx.fillStyle = '#5c0808';
        ctx.beginPath();
        ctx.ellipse(hx, hy, hr, hr * (0.7 + rng() * 0.6), rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();

        // Irregular margins
        ctx.fillStyle = '#8a0d0d';
        ctx.beginPath();
        ctx.arc(hx + 1, hy, hr * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // D. Cotton Wool Spots (Soft exudates / micro-infarcts) - Grade 3, 4
    if (stage === 'SEVERE_NPDR' || stage === 'PDR') {
      const cwsCount = stage === 'SEVERE_NPDR' ? 6 : 5;
      for (let i = 0; i < cwsCount; i++) {
        const cx = centerX - radius * 0.3 + rng() * radius * 0.8;
        const cy = centerY - radius * 0.4 + rng() * radius * 0.8;
        const cr = 7 + rng() * 10;

        const cwsGrad = ctx.createRadialGradient(cx, cy, 1, cx, cy, cr);
        cwsGrad.addColorStop(0, enhanced ? 'rgba(255, 255, 255, 0.75)' : 'rgba(240, 240, 230, 0.6)');
        cwsGrad.addColorStop(0.5, enhanced ? 'rgba(220, 220, 200, 0.45)' : 'rgba(200, 200, 180, 0.35)');
        cwsGrad.addColorStop(1, 'transparent');

        ctx.fillStyle = cwsGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // E. Proliferative Neovascularization & Preretinal Hemorrhage - Grade 4 (PDR)
    if (stage === 'PDR') {
      // 1. Neovascular fronds at Optic Disc (NVD)
      ctx.strokeStyle = '#c42312';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let f = 0; f < 25; f++) {
        const angle = rng() * Math.PI * 2;
        const frondDist = discR * 0.7 + rng() * discR * 0.9;
        const fx = discX + Math.cos(angle) * frondDist;
        const fy = discY + Math.sin(angle) * frondDist;
        ctx.moveTo(discX, discY);
        ctx.lineTo(fx + (rng() - 0.5) * 10, fy + (rng() - 0.5) * 10);
      }
      ctx.stroke();

      // 2. Large boat-shaped preretinal hemorrhage
      const boatX = maculaX - 60;
      const boatY = maculaY - 30;
      ctx.fillStyle = '#4a0505';
      ctx.beginPath();
      ctx.moveTo(boatX - 35, boatY);
      ctx.lineTo(boatX + 35, boatY);
      ctx.bezierCurveTo(boatX + 35, boatY + 28, boatX - 35, boatY + 28, boatX - 35, boatY);
      ctx.fill();

      // Flat fluid level
      ctx.strokeStyle = '#851212';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(boatX - 35, boatY);
      ctx.lineTo(boatX + 35, boatY);
      ctx.stroke();
    }

    ctx.restore();
  }

  // 8. Poor Quality Artifacts (if applicable)
  if (isBlurry) {
    ctx.save();
    // Motion blur overlay
    ctx.fillStyle = 'rgba(10, 4, 3, 0.45)';
    ctx.fillRect(0, 0, width, height);

    // Dark shadow crescent (poor illumination)
    const shadowGrad = ctx.createLinearGradient(0, 0, width, height);
    shadowGrad.addColorStop(0, 'rgba(0,0,0,0.85)');
    shadowGrad.addColorStop(0.35, 'rgba(0,0,0,0.4)');
    shadowGrad.addColorStop(0.7, 'transparent');
    ctx.fillStyle = shadowGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.restore();
  }

  // 9. CLAHE enhancement overlay (if enhanced)
  if (enhanced) {
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(255, 230, 180, 0.15)';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // 10. Optic Disc & Fovea Overlays (if enabled)
  if (options.showOpticDisc) {
    ctx.save();
    ctx.strokeStyle = '#facc15'; // yellow
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(discX, discY, discR * 1.1, 0, Math.PI * 2);
    ctx.stroke();

    // Label
    ctx.setLineDash([]);
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('OPTIC DISC [OD]', discX - 45, discY - discR * 1.25);
    ctx.restore();
  }

  if (options.showFovea) {
    ctx.save();
    ctx.strokeStyle = '#38bdf8'; // sky blue / cyan
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Crosshair fovea
    ctx.arc(maculaX, maculaY, maculaR * 0.6, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(maculaX - 12, maculaY);
    ctx.lineTo(maculaX + 12, maculaY);
    ctx.moveTo(maculaX, maculaY - 12);
    ctx.lineTo(maculaX, maculaY + 12);
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('FOVEA / MACULA', maculaX - 42, maculaY - maculaR * 0.75);
    ctx.restore();
  }

  // 11. Vessel Segmentation Overlay (if enabled)
  if (options.showVessels) {
    ctx.save();
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.75)'; // emerald green vessel mask
    ctx.lineWidth = 2;
    // Draw vessel segmentation trace
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.7, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('VESSEL TREE: SEGMENTED (18.4% DENSITY)', centerX - 120, centerY + radius * 0.85);
    ctx.restore();
  }

  // 12. Candidate Lesions Overlay (if enabled)
  if (options.showLesions && options.structureFindings?.lesionMarkers) {
    ctx.save();
    options.structureFindings.lesionMarkers.forEach((lesion) => {
      // Scale coordinates to canvas width/height
      const lx = (lesion.x / 500) * width;
      const ly = (lesion.y / 500) * height;

      let color = '#ef4444';
      if (lesion.type === 'hardExudate') color = '#eab308';
      if (lesion.type === 'cottonWool') color = '#38bdf8';
      if (lesion.type === 'neovascularization') color = '#ec4899';

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(lx, ly, 14, 0, Math.PI * 2);
      ctx.stroke();

      // Tag
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lx, ly, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // 13. Grad-CAM Thermal Heatmap Overlay (if enabled)
  if (options.showGradCam && options.gradCamData) {
    ctx.save();
    const opacity = options.gradCamOpacity !== undefined ? options.gradCamOpacity : 0.65;
    ctx.globalAlpha = opacity;

    options.gradCamData.heatmapPoints.forEach((point) => {
      const px = (point.x / 500) * width;
      const py = (point.y / 500) * height;
      const pr = (point.radius / 500) * width * 1.5;

      const heatGrad = ctx.createRadialGradient(px, py, 1, px, py, pr);
      // Jet/Turbo thermal heatmap colors
      heatGrad.addColorStop(0, 'rgba(239, 68, 68, 0.95)'); // Bright Red
      heatGrad.addColorStop(0.3, 'rgba(249, 115, 22, 0.85)'); // Orange
      heatGrad.addColorStop(0.6, 'rgba(234, 179, 8, 0.7)'); // Yellow
      heatGrad.addColorStop(0.85, 'rgba(34, 197, 94, 0.45)'); // Green
      heatGrad.addColorStop(1, 'transparent'); // Dissolve to background

      ctx.fillStyle = heatGrad;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  // Restore clipping
  ctx.restore();

  // 14. Outer aperture border ring
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();
}
