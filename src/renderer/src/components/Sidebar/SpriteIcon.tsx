import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../../stores/app-store'

export type SpriteId =
  | 'brain'
  | 'terminal'
  | 'gear'
  | 'bolt'
  | 'hourglass'
  | 'walker'
  | 'cat'
  | 'ghost'
  | 'rocket'
  | 'heart'

interface SpriteProps {
  isWorking: boolean
}

const SPRITE_OPTIONS: { id: SpriteId; name: string }[] = [
  { id: 'brain', name: 'Brain' },
  { id: 'terminal', name: 'Terminal' },
  { id: 'gear', name: 'Gear' },
  { id: 'bolt', name: 'Lightning' },
  { id: 'hourglass', name: 'Hourglass' },
  { id: 'walker', name: 'Walker' },
  { id: 'cat', name: 'Cat' },
  { id: 'ghost', name: 'Ghost' },
  { id: 'rocket', name: 'Rocket' },
  { id: 'heart', name: 'Heart' },
]

function BrainSprite({ isWorking }: SpriteProps) {
  return (
    <svg
      className={`sprite sprite-brain ${isWorking ? 'working' : ''}`}
      width="24"
      height="24"
      viewBox="0 0 16 16"
    >
      <ellipse cx="8" cy="7" rx="4.5" ry="5" fill="#E8A0BF" />
      <line x1="8" y1="2.5" x2="8" y2="11.5" stroke="#C07090" strokeWidth="0.7" />
      <path d="M5.5 5C6.5 4.5 6.5 6 6 6.5" stroke="#C07090" strokeWidth="0.5" fill="none" />
      <path d="M10.5 5C9.5 4.5 9.5 6 10 6.5" stroke="#C07090" strokeWidth="0.5" fill="none" />
      <path d="M5.5 8C6.5 7.5 6.5 9 6 9.5" stroke="#C07090" strokeWidth="0.5" fill="none" />
      <path d="M10.5 8C9.5 7.5 9.5 9 10 9.5" stroke="#C07090" strokeWidth="0.5" fill="none" />
      <rect x="7" y="12" width="2" height="2.5" rx="0.5" fill="#C07090" />
      <g className="sparkle s1">
        <rect x="1" y="2.5" width="2" height="0.7" fill="#FFD700" rx="0.2" />
        <rect x="1.65" y="1.8" width="0.7" height="2" fill="#FFD700" rx="0.2" />
      </g>
      <g className="sparkle s2">
        <rect x="12.5" y="1.5" width="2" height="0.7" fill="#FFD700" rx="0.2" />
        <rect x="13.15" y="0.8" width="0.7" height="2" fill="#FFD700" rx="0.2" />
      </g>
      <g className="sparkle s3">
        <rect x="13" y="10" width="1.5" height="0.5" fill="#FFD700" rx="0.15" />
        <rect x="13.5" y="9.5" width="0.5" height="1.5" fill="#FFD700" rx="0.15" />
      </g>
    </svg>
  )
}

function TerminalSprite({ isWorking }: SpriteProps) {
  return (
    <svg
      className={`sprite sprite-terminal ${isWorking ? 'working' : ''}`}
      width="24"
      height="24"
      viewBox="0 0 16 16"
    >
      <rect x="1" y="2" width="14" height="12" rx="2" fill="#1E1E2E" stroke="#555" strokeWidth="0.7" />
      <path
        d="M4 7L6.5 9L4 11"
        stroke="#50FA7B"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect className="terminal-cursor" x="8" y="9" width="3" height="1.2" rx="0.3" fill="#F8F8F2" />
    </svg>
  )
}

function GearSprite({ isWorking }: SpriteProps) {
  return (
    <svg
      className={`sprite sprite-gear ${isWorking ? 'working' : ''}`}
      width="24"
      height="24"
      viewBox="0 0 16 16"
    >
      <g className="gear-cog">
        <circle cx="8" cy="8" r="3.5" fill="#8899AA" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <rect
            key={angle}
            x="7"
            y="1.5"
            width="2"
            height="2.5"
            rx="0.5"
            fill="#8899AA"
            transform={`rotate(${angle} 8 8)`}
          />
        ))}
        <circle cx="8" cy="8" r="2" fill="#556677" />
        <circle cx="8" cy="8" r="0.8" fill="#8899AA" />
      </g>
    </svg>
  )
}

function BoltSprite({ isWorking }: SpriteProps) {
  return (
    <svg
      className={`sprite sprite-bolt ${isWorking ? 'working' : ''}`}
      width="24"
      height="24"
      viewBox="0 0 16 16"
    >
      <path
        className="bolt-shape"
        d="M9.5 1L4 8.5H7.5L6 15L12.5 7H8.5Z"
        fill="#FFD700"
        stroke="#DAA520"
        strokeWidth="0.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function HourglassSprite({ isWorking }: SpriteProps) {
  return (
    <svg
      className={`sprite sprite-hourglass ${isWorking ? 'working' : ''}`}
      width="24"
      height="24"
      viewBox="0 0 16 16"
    >
      <g className="hourglass-body">
        <rect x="3" y="1" width="10" height="1.5" rx="0.5" fill="#B8860B" />
        <rect x="3" y="13.5" width="10" height="1.5" rx="0.5" fill="#B8860B" />
        <path d="M4.5 2.5L8 7.5L11.5 2.5Z" fill="#87CEEB" opacity="0.5" />
        <path d="M4.5 13.5L8 8.5L11.5 13.5Z" fill="#87CEEB" opacity="0.5" />
        <path d="M6 3.5L8 6.5L10 3.5Z" fill="#DEB887" />
        <path d="M6.5 12.5L8 10L9.5 12.5Z" fill="#DEB887" />
        <rect x="7.5" y="7" width="1" height="2" fill="#DEB887" opacity="0.6" />
      </g>
    </svg>
  )
}

function WalkerSprite({ isWorking }: SpriteProps) {
  const skin = '#FFD5A0'
  const hair = '#5C3317'
  const shirt = '#4A90D9'
  const pants = '#3B3B5C'
  const shoe = '#2A2A2A'

  return (
    <svg
      className={`sprite sprite-walker ${isWorking ? 'working' : ''}`}
      width="24"
      height="24"
      viewBox="0 0 16 16"
    >
      <g className="pixel-walker-strip">
        <g>
          <rect x="5" y="0" width="6" height="2" fill={hair} />
          <rect x="5" y="2" width="6" height="4" fill={skin} />
          <rect x="7" y="3" width="1" height="1" fill="#333" />
          <rect x="9" y="3" width="1" height="1" fill="#333" />
          <rect x="5" y="6" width="6" height="4" fill={shirt} />
          <rect x="3" y="6" width="2" height="3" fill={shirt} />
          <rect x="11" y="6" width="2" height="3" fill={shirt} />
          <rect x="5" y="10" width="6" height="3" fill={pants} />
          <rect x="5" y="13" width="6" height="2" fill={shoe} />
        </g>
        <g transform="translate(0, 16)">
          <rect x="5" y="0" width="6" height="2" fill={hair} />
          <rect x="5" y="2" width="6" height="4" fill={skin} />
          <rect x="7" y="3" width="1" height="1" fill="#333" />
          <rect x="9" y="3" width="1" height="1" fill="#333" />
          <rect x="5" y="6" width="6" height="4" fill={shirt} />
          <rect x="3" y="7" width="2" height="2" fill={shirt} />
          <rect x="11" y="6" width="2" height="2" fill={shirt} />
          <rect x="5" y="10" width="3" height="3" fill={pants} />
          <rect x="8" y="10" width="3" height="3" fill={pants} />
          <rect x="4" y="13" width="3" height="2" fill={shoe} />
          <rect x="9" y="13" width="3" height="2" fill={shoe} />
        </g>
        <g transform="translate(0, 32)">
          <rect x="5" y="0" width="6" height="2" fill={hair} />
          <rect x="5" y="2" width="6" height="4" fill={skin} />
          <rect x="7" y="3" width="1" height="1" fill="#333" />
          <rect x="9" y="3" width="1" height="1" fill="#333" />
          <rect x="5" y="6" width="6" height="4" fill={shirt} />
          <rect x="3" y="6" width="2" height="3" fill={shirt} />
          <rect x="11" y="6" width="2" height="3" fill={shirt} />
          <rect x="5" y="10" width="6" height="3" fill={pants} />
          <rect x="5" y="13" width="6" height="2" fill={shoe} />
        </g>
        <g transform="translate(0, 48)">
          <rect x="5" y="0" width="6" height="2" fill={hair} />
          <rect x="5" y="2" width="6" height="4" fill={skin} />
          <rect x="7" y="3" width="1" height="1" fill="#333" />
          <rect x="9" y="3" width="1" height="1" fill="#333" />
          <rect x="5" y="6" width="6" height="4" fill={shirt} />
          <rect x="3" y="6" width="2" height="2" fill={shirt} />
          <rect x="11" y="7" width="2" height="2" fill={shirt} />
          <rect x="5" y="10" width="3" height="3" fill={pants} />
          <rect x="8" y="10" width="3" height="3" fill={pants} />
          <rect x="9" y="13" width="3" height="2" fill={shoe} />
          <rect x="4" y="13" width="3" height="2" fill={shoe} />
        </g>
      </g>
    </svg>
  )
}

function CatSprite({ isWorking }: SpriteProps) {
  return (
    <svg
      className={`sprite sprite-cat ${isWorking ? 'working' : ''}`}
      width="24"
      height="24"
      viewBox="0 0 16 16"
    >
      <g className="cat-body">
        <path d="M3 7L5 2L7 7" fill="#F4A460" />
        <path d="M9 7L11 2L13 7" fill="#F4A460" />
        <path d="M3.8 7L5 3.5L6.2 7" fill="#FFB6C1" />
        <path d="M9.8 7L11 3.5L12.2 7" fill="#FFB6C1" />
        <circle cx="8" cy="9.5" r="5" fill="#F4A460" />
        <ellipse cx="6" cy="9" rx="0.9" ry="1.1" fill="#333" />
        <ellipse cx="10" cy="9" rx="0.9" ry="1.1" fill="#333" />
        <circle cx="6.3" cy="8.7" r="0.35" fill="#FFF" />
        <circle cx="10.3" cy="8.7" r="0.35" fill="#FFF" />
        <path d="M7.5 10.8L8 10.3L8.5 10.8" fill="#FF6B6B" stroke="#FF6B6B" strokeWidth="0.2" />
        <path d="M8 11V11.5" stroke="#333" strokeWidth="0.4" />
      </g>
      <path
        className="cat-tail"
        d="M14 12Q16 9 14 6"
        stroke="#F4A460"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}

function GhostSprite({ isWorking }: SpriteProps) {
  return (
    <svg
      className={`sprite sprite-ghost ${isWorking ? 'working' : ''}`}
      width="24"
      height="24"
      viewBox="0 0 16 16"
    >
      <g className="ghost-body">
        <path
          d="M4 14V7C4 3.7 5.8 1 8 1C10.2 1 12 3.7 12 7V14L10.5 12L8 14L5.5 12Z"
          fill="white"
          stroke="#DDD"
          strokeWidth="0.3"
        />
        <circle cx="6.5" cy="6.5" r="1.2" fill="#333" />
        <circle cx="9.5" cy="6.5" r="1.2" fill="#333" />
        <circle cx="6.8" cy="6.2" r="0.4" fill="white" />
        <circle cx="9.8" cy="6.2" r="0.4" fill="white" />
        <ellipse cx="8" cy="9.5" rx="1" ry="0.8" fill="#333" />
      </g>
    </svg>
  )
}

function RocketSprite({ isWorking }: SpriteProps) {
  return (
    <svg
      className={`sprite sprite-rocket ${isWorking ? 'working' : ''}`}
      width="24"
      height="24"
      viewBox="0 0 16 16"
    >
      <g className="rocket-body">
        <path d="M8 1C8 1 5.5 4 5.5 8V11.5H10.5V8C10.5 4 8 1 8 1Z" fill="#E8E8E8" stroke="#CCC" strokeWidth="0.3" />
        <path d="M8 1C7 3 6.2 5 6.2 5H9.8C9.8 5 9 3 8 1Z" fill="#FF4444" />
        <circle cx="8" cy="7.5" r="1.3" fill="#87CEEB" stroke="#666" strokeWidth="0.3" />
        <path d="M5.5 9.5L3 13H5.5Z" fill="#FF4444" />
        <path d="M10.5 9.5L13 13H10.5Z" fill="#FF4444" />
      </g>
      <g className="rocket-flame">
        <path d="M6 11.5L8 15.5L10 11.5" fill="#FF8C00" />
        <path d="M6.8 11.5L8 14.5L9.2 11.5" fill="#FFD700" />
      </g>
    </svg>
  )
}

function HeartSprite({ isWorking }: SpriteProps) {
  return (
    <svg
      className={`sprite sprite-heart ${isWorking ? 'working' : ''}`}
      width="24"
      height="24"
      viewBox="0 0 16 16"
    >
      <path
        className="heart-shape"
        d="M8 14S1 9.5 1 5.5C1 3 3 1 5 1C6.5 1 7.5 2 8 3C8.5 2 9.5 1 11 1C13 1 15 3 15 5.5C15 9.5 8 14 8 14Z"
        fill="#FF4444"
        stroke="#CC0000"
        strokeWidth="0.3"
      />
      <ellipse cx="5.5" cy="5" rx="1.5" ry="1" fill="#FF7777" opacity="0.5" transform="rotate(-20 5.5 5)" />
    </svg>
  )
}

const SPRITE_COMPONENTS: Record<SpriteId, React.FC<SpriteProps>> = {
  brain: BrainSprite,
  terminal: TerminalSprite,
  gear: GearSprite,
  bolt: BoltSprite,
  hourglass: HourglassSprite,
  walker: WalkerSprite,
  cat: CatSprite,
  ghost: GhostSprite,
  rocket: RocketSprite,
  heart: HeartSprite,
}

export function SpriteIcon({ isWorking }: SpriteProps) {
  const [showPicker, setShowPicker] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const selectedSprite = useAppStore((s) => s.selectedSprite) as SpriteId
  const setSprite = useAppStore((s) => s.setSprite)

  useEffect(() => {
    if (!showPicker) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showPicker])

  const SpriteComponent = SPRITE_COMPONENTS[selectedSprite] || BrainSprite

  return (
    <div className="sprite-container" ref={containerRef}>
      <div
        className="sprite-clickable"
        onClick={(e) => {
          e.stopPropagation()
          setShowPicker(!showPicker)
        }}
      >
        <SpriteComponent isWorking={isWorking} />
      </div>
      {showPicker && (
        <div className="sprite-picker" onClick={(e) => e.stopPropagation()}>
          {SPRITE_OPTIONS.map((opt) => {
            const Preview = SPRITE_COMPONENTS[opt.id]
            return (
              <div
                key={opt.id}
                className={`sprite-option ${opt.id === selectedSprite ? 'selected' : ''}`}
                onClick={() => {
                  setSprite(opt.id)
                  setShowPicker(false)
                }}
                title={opt.name}
              >
                <Preview isWorking={false} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
