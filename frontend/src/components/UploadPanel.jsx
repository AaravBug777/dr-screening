import { useRef, useState } from 'react'
import { motion } from 'framer-motion'

export default function UploadPanel({ onFileSelected, onFilesSelected, disabled }) {
  const inputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)

  // onFilesSelected (plural, optional) enables batch mode -- a PHC
  // operator photographs many patients per session, not one at a time.
  // Falls back to the original single-file callback when not provided, so
  // existing call sites keep working unchanged.
  const handleFiles = (fileList) => {
    if (!fileList || fileList.length === 0) return
    if (onFilesSelected) {
      onFilesSelected(Array.from(fileList))
    } else if (onFileSelected) {
      onFileSelected(fileList[0])
    }
  }

  return (
    <motion.div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragging(false)
        handleFiles(e.dataTransfer.files)
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      animate={isDragging ? { scale: 1.015 } : { scale: 1 }}
      whileHover={disabled ? undefined : { scale: 1.008 }}
      whileTap={disabled ? undefined : { scale: 0.99 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={`w-full rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer backdrop-blur-sm transition-colors
        ${isDragging ? 'border-scope-accent bg-scope-accentSoft/10' : 'border-scope-line bg-white/70'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-scope-accent/60'}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        multiple={!!onFilesSelected}
        className="hidden"
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="font-body text-sm text-scope-text/80">
        <span className="font-medium text-scope-accent">Choose {onFilesSelected ? 'fundus images' : 'a fundus image'}</span> or drag {onFilesSelected ? 'them' : 'one'} here
      </p>
      <p className="font-mono text-[11px] text-scope-text/40 mt-2 uppercase tracking-wide">
        PNG or JPEG{onFilesSelected ? ' · multiple files supported' : ''}
      </p>
    </motion.div>
  )
}
