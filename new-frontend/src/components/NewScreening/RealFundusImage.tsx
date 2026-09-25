import React from 'react';

interface RealFundusImageProps {
  // Either a data: URI (base64 from the backend) or a blob:/http(s) URL
  // (e.g. URL.createObjectURL(file) for the raw upload).
  src: string;
  title?: string;
  badge?: string;
  className?: string;
}

// Displays a REAL fundus image (the actual upload, or a real base64 image
// the backend returned -- Grad-CAM overlay, enhanced view, MATLAB
// structures overlay) in the same circular-aperture card frame the old
// FundusCanvasViewer used for its procedurally-drawn fake eyes. This
// component intentionally does none of that drawing -- it just shows the
// real image the backend actually produced.
export function RealFundusImage({ src, title, badge }: RealFundusImageProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
      {(title || badge) && (
        <div className="p-2.5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
          {title && (
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{title}</span>
          )}
          {badge && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-black rounded uppercase tracking-wider">
              {badge}
            </span>
          )}
        </div>
      )}
      <div className="aspect-square w-full bg-slate-950 flex items-center justify-center overflow-hidden">
        <img src={src} alt={title || 'Fundus image'} className="w-full h-full object-contain" />
      </div>
    </div>
  );
}
