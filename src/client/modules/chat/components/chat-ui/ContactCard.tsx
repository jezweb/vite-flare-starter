import { Phone, Mail, MapPin, User } from 'lucide-react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'

interface Props {
  name: string
  title?: string
  phone?: string
  email?: string
  address?: string
  image?: string
}

export function ContactCard({ name, title, phone, email, address, image }: Props) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <div className="rounded-lg border border-border p-3 max-w-sm">
      <div className="flex items-start gap-3">
        <Avatar className="size-12 shrink-0">
          {image && <AvatarImage src={image} alt={name} />}
          <AvatarFallback>{initials || <User className="size-5" />}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{name}</div>
          {title && <div className="text-xs text-muted-foreground truncate">{title}</div>}
          <div className="mt-2 space-y-1 text-xs">
            {phone && (
              <a
                href={`tel:${phone.replace(/\s/g, '')}`}
                className="flex items-center gap-1.5 text-foreground hover:text-primary"
              >
                <Phone className="size-3" /> {phone}
              </a>
            )}
            {email && (
              <a
                href={`mailto:${email}`}
                className="flex items-center gap-1.5 text-foreground hover:text-primary"
              >
                <Mail className="size-3" /> {email}
              </a>
            )}
            {address && (
              <div className="flex items-start gap-1.5 text-muted-foreground">
                <MapPin className="size-3 shrink-0 mt-0.5" /> <span>{address}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
