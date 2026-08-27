import { useEffect, useRef } from 'react'
import useReducedMotion from '../hooks/useReducedMotion'

// Soft, slow-drifting light -- like out-of-focus bokeh through a lens --
// used as ambient depth behind the hero. Canvas rather than a pile of
// absolutely-positioned blurred divs: cheaper for a few dozen drifting,
// pulsing radial gradients, and it never fights layout.
const COLORS = ['rgba(232, 93, 61, 0.09)', 'rgba(111, 146, 133, 0.11)', 'rgba(15, 27, 45, 0.05)']

export default function AmbientField({ className = '' }) {
  const canvasRef = useRef(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf = null
    let particles = []
    let width = 0
    let height = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const initParticles = () => {
      const count = Math.max(7, Math.min(16, Math.round((width * height) / 55000)))
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 50 + Math.random() * 110,
        vx: (Math.random() - 0.5) * 0.1,
        vy: (Math.random() - 0.5) * 0.1,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        phase: Math.random() * Math.PI * 2,
      }))
    }

    resize()
    initParticles()

    const paint = (t) => {
      ctx.clearRect(0, 0, width, height)
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < -p.r) p.x = width + p.r
        if (p.x > width + p.r) p.x = -p.r
        if (p.y < -p.r) p.y = height + p.r
        if (p.y > height + p.r) p.y = -p.r

        const pulse = reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(t / 2200 + p.phase)
        const radius = p.r * pulse
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius)
        grad.addColorStop(0, p.color)
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const loop = (t) => {
      paint(t)
      raf = requestAnimationFrame(loop)
    }

    if (reducedMotion) {
      paint(0)
    } else {
      raf = requestAnimationFrame(loop)
    }

    const handleResize = () => {
      resize()
      initParticles()
      if (reducedMotion) paint(0)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('resize', handleResize)
    }
  }, [reducedMotion])

  return <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full ${className}`} aria-hidden="true" />
}
