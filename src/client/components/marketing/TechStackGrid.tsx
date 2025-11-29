import { cn } from '@/lib/utils'
import {
  SiReact,
  SiTypescript,
  SiVite,
  SiTailwindcss,
  SiShadcnui,
  SiHono,
  SiCloudflare,
  SiDrizzle,
} from 'react-icons/si'

interface TechItem {
  name: string
  description: string
  icon: React.ReactNode
  color?: string
}

interface TechStackGridProps {
  items: TechItem[]
  className?: string
}

export function TechStackGrid({ items, className }: TechStackGridProps) {
  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4', className)}>
      {items.map((item) => (
        <div
          key={item.name}
          className="group relative flex flex-col items-center p-6 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-lg transition-all duration-200"
        >
          <div className={cn(
            'flex h-14 w-14 items-center justify-center rounded-lg mb-4 transition-transform group-hover:scale-110',
            item.color || 'bg-muted text-foreground'
          )}>
            {item.icon}
          </div>
          <h3 className="font-semibold text-sm text-center">{item.name}</h3>
          <p className="text-xs text-muted-foreground text-center mt-1">{item.description}</p>
        </div>
      ))}
    </div>
  )
}

// Pre-configured tech stack for Vite Flare Stack
export const techStackItems: TechItem[] = [
  {
    name: 'React 19',
    description: 'Modern UI library',
    icon: <SiReact className="h-8 w-8" />,
    color: 'bg-[#61DAFB]/10 text-[#61DAFB]',
  },
  {
    name: 'TypeScript',
    description: 'Type-safe code',
    icon: <SiTypescript className="h-8 w-8" />,
    color: 'bg-[#3178C6]/10 text-[#3178C6]',
  },
  {
    name: 'Vite',
    description: 'Fast dev & build',
    icon: <SiVite className="h-8 w-8" />,
    color: 'bg-[#646CFF]/10 text-[#646CFF]',
  },
  {
    name: 'Tailwind CSS',
    description: 'Utility-first CSS',
    icon: <SiTailwindcss className="h-8 w-8" />,
    color: 'bg-[#06B6D4]/10 text-[#06B6D4]',
  },
  {
    name: 'shadcn/ui',
    description: 'UI components',
    icon: <SiShadcnui className="h-8 w-8" />,
    color: 'bg-foreground/10 text-foreground',
  },
  {
    name: 'Hono',
    description: 'Fast web framework',
    icon: <SiHono className="h-8 w-8" />,
    color: 'bg-[#E36002]/10 text-[#E36002]',
  },
  {
    name: 'Cloudflare',
    description: 'Edge platform',
    icon: <SiCloudflare className="h-8 w-8" />,
    color: 'bg-[#F38020]/10 text-[#F38020]',
  },
  {
    name: 'Drizzle ORM',
    description: 'Type-safe queries',
    icon: <SiDrizzle className="h-8 w-8" />,
    color: 'bg-[#C5F74F]/10 text-[#C5F74F]',
  },
]
