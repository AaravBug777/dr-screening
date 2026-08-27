import { Suspense, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import useReducedMotion from '../hooks/useReducedMotion'

// Netra brand hues, reused here so the WebGL orb never drifts from the
// rest of the app's palette -- see tailwind.config.js's `scope` colors.
const TONE_COLORS = {
  trust: '#6F9285',
  accent: '#E85D3D',
}

function OrbScene({ mode, tone, reducedMotion }) {
  const orbRef = useRef()
  const ringRef = useRef()
  const glowRef = useRef()
  const gaze = useRef({ x: 0, y: 0 })

  const accent = TONE_COLORS[tone] || TONE_COLORS.trust

  useFrame((state, delta) => {
    if (!orbRef.current) return

    // Deliberately NOT a continuously-accumulating rotation (an earlier
    // version did `autoAngle += delta * speed` forever) -- past a few
    // degrees the flat iris rings go edge-on to the camera and foreshorten
    // into slivers/streaks that swept across each other and the pupil,
    // reading as visual noise rather than an eye, worst during "analyzing"
    // where the faster spin made it a near-constant smear. The iris stays
    // put facing the camera instead; "alive" motion is a small BOUNDED sway
    // (sin wave, never travels far enough to go edge-on) plus pointer
    // parallax, and "scanning" motion is carried entirely by the outer
    // ring below and the emissive pulse, not by spinning the eye itself.
    const t = state.clock.elapsedTime
    const swayAmplitude = mode === 'analyzing' ? 0.05 : 0.09
    const swayX = reducedMotion ? 0 : Math.sin(t * 0.35) * swayAmplitude * 0.4
    const swayY = reducedMotion ? 0 : Math.sin(t * 0.22) * swayAmplitude

    // Pointer parallax -- state.pointer is normalized -1..1 across the
    // canvas, so the orb visibly turns toward wherever you're pointing,
    // layered on top of the gentle idle sway above.
    gaze.current.x += (state.pointer.y * 0.16 - gaze.current.x) * 0.06
    gaze.current.y += (state.pointer.x * 0.2 - gaze.current.y) * 0.06
    orbRef.current.rotation.x = swayX + gaze.current.x
    orbRef.current.rotation.y = swayY + gaze.current.y

    if (ringRef.current && !reducedMotion) {
      ringRef.current.rotation.z += delta * 1.1
    }
    if (glowRef.current) {
      glowRef.current.intensity = mode === 'analyzing' && !reducedMotion
        ? 1.3 + Math.sin(t * 3) * 0.5
        : 1
    }
  })

  return (
    <>
      <ambientLight intensity={0.85} />
      <pointLight position={[3, 3, 4]} intensity={2.2} color="#F7F4EE" />
      <pointLight ref={glowRef} position={[-2, -1, 2.5]} intensity={1.4} color={accent} />

      {/* Procedural studio lighting for the glass reflections -- rendered
          into an offscreen env map from simple light shapes, no external
          HDRI fetch, so this works fully offline. Ring-shaped formers only
          (no flat rects): a rect lightformer reflected in this material as
          a hard-edged flat "card" shape sitting on the glass -- looked like
          broken geometry rather than a highlight, at every rotation angle
          tested. Rings blend into soft curved highlights instead. */}
      <Environment resolution={512}>
        <Lightformer form="ring" color="#E85D3D" intensity={3} position={[3, 2, 2]} scale={5} />
        <Lightformer form="ring" color="#6F9285" intensity={2} position={[-3, -2, -2]} scale={5} />
        <Lightformer form="circle" color="#FFFFFF" intensity={0.7} position={[0, 4, 2]} scale={7} />
      </Environment>

      <group ref={orbRef}>
        {/* the layered iris -- sits forward, near the front of the glass
            dome, facing the camera directly (a torus already faces the
            camera by default -- no extra rotation needed, or it goes
            edge-on and reads as a sliver instead of a ring). */}
        {[0.95, 0.7, 0.45].map((r, i) => (
          <mesh key={r} position={[0, 0, 0.4 + i * 0.12]}>
            <torusGeometry args={[r, 0.045, 16, 64]} />
            <meshStandardMaterial
              color={i === 2 ? accent : '#F7F4EE'}
              emissive={mode === 'analyzing' && i === 2 ? accent : '#000000'}
              emissiveIntensity={mode === 'analyzing' ? 1.1 : 0}
              metalness={0.25}
              roughness={0.45}
            />
          </mesh>
        ))}

        {/* pupil */}
        <mesh position={[0, 0, 0.75]}>
          <sphereGeometry args={[0.32, 32, 32]} />
          <meshStandardMaterial color="#05080D" roughness={0.4} metalness={0.2} />
        </mesh>

        {/* the glass dome -- real transmission, not chrome, so the iris
            reads clearly through it instead of being sealed inside an
            opaque metal shell. Roughness raised from an earlier near-mirror
            0.08 (every studio light reflected as a small, sharp hot spot)
            but NOT all the way to the 0.22/0.25 first tried when fixing
            that -- once the actual culprit (flat rect Lightformers) was
            removed above, that much roughness was overkill and just made
            the whole dome read as hazy/frosted rather than glass. 0.14/0.16
            is the settled middle: soft reflections, no hard-edged shapes,
            without fogging up the iris underneath. thickness lowered
            slightly too -- meshPhysicalMaterial's transmission has no real
            scene to refract behind this canvas (alpha:true, page background
            shows through), so thicker glass here just reads as more blur,
            not more "glass". */}
        <mesh>
          <sphereGeometry args={[1.35, 64, 64]} />
          <meshPhysicalMaterial
            color="#EDF1F4"
            metalness={0.1}
            roughness={0.14}
            clearcoat={0.7}
            clearcoatRoughness={0.16}
            transmission={0.85}
            ior={1.5}
            thickness={0.9}
            envMapIntensity={1.3}
          />
        </mesh>
      </group>

      {/* outer scanning halo, analyzing only -- tilted enough to read as a
          ring in perspective, not so far it goes edge-on into a sliver.
          This is the ONLY element that spins freely -- carrying the entire
          "scanning" motion read on its own, since the iris above no longer
          rotates far enough to do so itself. */}
      {mode === 'analyzing' && (
        <mesh ref={ringRef} rotation={[1.0, 0, 0]}>
          <torusGeometry args={[1.75, 0.02, 8, 100]} />
          <meshBasicMaterial color={accent} transparent opacity={0.85} />
        </mesh>
      )}
    </>
  )
}

/**
 * The 3D glass/chrome "lens orb" -- the idle and analyzing states' visual
 * centerpiece. Deliberately not used for the `done` state: once there's a
 * real fundus photo, Grad-CAM overlay, or structural overlay to show, the
 * app shows that actual image, not a decorative stand-in for it.
 */
export default function EyeOrb3D({ mode = 'idle', tone = 'trust', className = '' }) {
  const reducedMotion = useReducedMotion()

  return (
    <Canvas
      className={className}
      dpr={[1, 2]}
      camera={{ position: [0, 0, 4.2], fov: 38 }}
      gl={{ alpha: true, antialias: true }}
      frameloop={reducedMotion ? 'demand' : 'always'}
    >
      <Suspense fallback={null}>
        <OrbScene mode={mode} tone={tone} reducedMotion={reducedMotion} />
      </Suspense>
    </Canvas>
  )
}
