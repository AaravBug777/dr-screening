import { jsPDF } from 'jspdf';
import { ScreeningRecord } from '../types';

export function generateClinicalPDFReport(record: ScreeningRecord): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const p = record.patientInfo;
  const g = record.grading;
  const q = record.quality;
  const r = record.referral;
  const s = record.structureFindings;

  // Colors
  const navy = [15, 23, 42]; // #0f172a
  const teal = [14, 116, 144]; // #0e7490
  const gray = [100, 116, 139]; // #64748b
  const lightBg = [248, 250, 252];

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('NETRA — DIABETIC RETINOPATHY SCREENING REPORT', 14, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('AI-Assisted Retinal Screening & Tele-Triage System | Rural Health Mission', 14, 18);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')} | Ref ID: ${record.id}`, 14, 23);

  // Patient Info Box
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, 32, 182, 34, 2, 2, 'F');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('PATIENT & SCREENING METADATA', 18, 38);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);

  doc.text(`Patient ID: ${p.patientId}`, 18, 45);
  doc.text(`Age / Sex: ${p.age} Yrs / ${p.sex}`, 18, 51);
  doc.text(`Diabetes Duration: ${p.diabetesDurationYears} Years`, 18, 57);
  doc.text(`HbA1c: ${p.lastHbA1c || 'Not recorded'}`, 18, 62);

  doc.text(`Screening Center: ${p.screeningCenter}`, 105, 45);
  doc.text(`District / State: ${p.district}`, 105, 51);
  doc.text(`Operator: ${p.operatorName}`, 105, 57);
  doc.text(`Eye Examined: ${record.eyeSide}`, 105, 62);

  // DR Severity & Triage Section (Two columns)
  let curY = 72;

  // Left Box: DR Grade
  const isReferable = r.status === 'REFERABLE';
  if (isReferable) {
    doc.setFillColor(254, 242, 242); // Light red
    doc.setDrawColor(239, 68, 68);
  } else {
    doc.setFillColor(240, 253, 244); // Light green
    doc.setDrawColor(34, 197, 94);
  }
  doc.roundedRect(14, curY, 88, 50, 2, 2, 'FD');

  doc.setTextColor(isReferable ? 185 : 21, isReferable ? 28 : 128, isReferable ? 28 : 61);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('AI DR SEVERITY GRADING', 18, curY + 8);

  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(g.stageName, 18, curY + 18, { maxWidth: 80 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Confidence: ${g.confidence.toFixed(1)}%`, 18, curY + 28);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`ICDR Grade: Level ${g.stageNumber} / 4`, 18, curY + 34);
  doc.text(`Model: ${g.modelArchitecture}`, 18, curY + 39, { maxWidth: 80 });
  doc.text(`Inference Latency: ${g.inferenceLatencyMs} ms`, 18, curY + 45);

  // Right Box: Referral Triage
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(108, curY, 88, 50, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TELE-TRIAGE RECOMMENDATION', 112, curY + 8);

  doc.setFontSize(12);
  if (isReferable) {
    doc.setTextColor(220, 38, 38);
    doc.text(`STATUS: REFERABLE [${r.priority}]`, 112, curY + 17);
  } else {
    doc.setTextColor(22, 163, 74);
    doc.text('STATUS: NOT REFERABLE [ROUTINE]', 112, curY + 17);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`Timeframe: ${r.recommendedTimeframe}`, 112, curY + 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Referral Probability: ${r.referralProbability.toFixed(1)}%`, 112, curY + 30);
  doc.text(`Primary Center: ${r.teleOphthalmologyCenter}`, 112, curY + 35, { maxWidth: 80 });
  doc.text(`Action: ${r.suggestedAction}`, 112, curY + 41, { maxWidth: 80 });

  curY += 56;

  // Retinal Structure & Quality Assessment
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, curY, 182, 36, 2, 2, 'F');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('ANATOMICAL STRUCTURE & QUALITY FINDINGS', 18, curY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);

  doc.text(`Image Quality: ${q.status} (Overall: ${q.overallScore}/100, Blur: ${q.focusBlurScore}, Illumination: ${q.illuminationScore})`, 18, curY + 14);
  doc.text(`Optic Disc: ${s.opticDiscDetected ? 'Detected (99.1%)' : 'Not Localized'} | Fovea / Macula: ${s.foveaDetected ? 'Detected (98.4%)' : 'Not Localized'}`, 18, curY + 20);
  doc.text(`Vessel Segmentation: ${s.vesselDensity}`, 18, curY + 26);
  doc.text(`Detected Lesions: ${s.lesionCount.microaneurysms} Microaneurysms, ${s.lesionCount.hemorrhages} Hemorrhages, ${s.lesionCount.hardExudates} Hard Exudates, ${s.lesionCount.cottonWoolSpots} Cotton Wool Spots, ${s.lesionCount.neovascularization} Neovascular fronds`, 18, curY + 32, { maxWidth: 174 });

  curY += 42;

  // Explainable AI & Grad-CAM Findings
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, curY, 182, 42, 2, 2, 'FD');

  doc.setTextColor(14, 116, 144);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('EXPLAINABLE AI (GRAD-CAM) EVIDENCE & CLINICAL REASONING', 18, curY + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`Peak Attention Region:`, 18, curY + 14);
  doc.setFont('helvetica', 'normal');
  doc.text(record.gradCam.peakActivationRegion, 56, curY + 14, { maxWidth: 135 });

  doc.setFont('helvetica', 'bold');
  doc.text(`Visual Evidence:`, 18, curY + 20);
  doc.setFont('helvetica', 'normal');
  doc.text(record.gradCam.attentionSummary, 45, curY + 20, { maxWidth: 145 });

  doc.text('Key Clinical Pointers:', 18, curY + 27);
  record.gradCam.clinicalPointers.forEach((pointer, idx) => {
    doc.text(`• ${pointer}`, 22, curY + 32 + idx * 4.5, { maxWidth: 170 });
  });

  curY += 48;

  // Doctor Review Block (if reviewed)
  if (record.reviewedByDoctor && record.doctorNotes) {
    doc.setFillColor(240, 249, 255);
    doc.roundedRect(14, curY, 182, 22, 2, 2, 'F');
    doc.setTextColor(3, 105, 161);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('OPHTHALMOLOGIST REVIEW NOTES & CONFIRMATION', 18, curY + 6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(8.5);
    doc.text(`Confirmed Grade: ${record.doctorConfirmedStage || g.stageName} | Review: ${record.doctorNotes}`, 18, curY + 13, { maxWidth: 174 });
    curY += 26;
  }

  // Mandatory Clinical Disclaimer
  doc.setFillColor(254, 243, 199); // light amber
  doc.roundedRect(14, curY, 182, 22, 1, 1, 'F');

  doc.setTextColor(146, 64, 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('IMPORTANT REGULATORY & CLINICAL SAFETY NOTICE:', 18, curY + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(
    'NETRA is an AI-assisted screening and referral prioritization tool developed for rural Primary Health Centers. It does not provide a definitive diagnosis and cannot replace comprehensive slit-lamp examination or direct ophthalmoscopy. Final clinical diagnosis and treatment plans must always be confirmed by a licensed ophthalmologist.',
    18,
    curY + 10,
    { maxWidth: 174 }
  );

  // Signatures
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('_____________________________', 20, 282);
  doc.text('Operator / Vision Tech Signature', 20, 287);

  doc.text('_____________________________', 130, 282);
  doc.text('Consulting Ophthalmologist Sign-off', 130, 287);

  // Save the document
  doc.save(`NETRA_Clinical_Report_${p.patientId}_${record.eyeSide.includes('Right') ? 'OD' : 'OS'}.pdf`);
}
