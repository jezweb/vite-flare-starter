import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ThemeScheme, ThemeMode } from '@/shared/schemas/preferences.schema'
import { applyTheme } from '@/lib/themes'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Slider } from '@/components/ui/slider'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  AlertCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  Settings,
  User,
  LogOut,
  Home,
  Mail,
  FileText,
  Image,
  Download,
  Upload,
  Search,
  Star,
  Heart,
  Share2,
  Trash,
  Edit,
  Plus,
  Minus,
  X,
  Check,
  ChevronRight,
  CalendarIcon,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowRight,
  Clock,
  Phone,
  Users,
  Building2,
  Target,
  ListTodo,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react'

/**
 * Style Guide Page
 * Showcases all UI components for development reference and client demos
 */
export function StyleGuidePage() {
  // Form component state
  const [checkboxChecked, setCheckboxChecked] = useState(false)
  const [switchEnabled, setSwitchEnabled] = useState(false)
  const [radioValue, setRadioValue] = useState('option1')
  const [sliderValue, setSliderValue] = useState([50])
  const [date, setDate] = useState<Date | undefined>(new Date())
  const [togglePressed, setTogglePressed] = useState(false)
  const [toggleGroupValue, setToggleGroupValue] = useState('center')
  const [comboboxOpen, setComboboxOpen] = useState(false)
  const [comboboxValue, setComboboxValue] = useState('')

  // Theme selector state
  const [currentScheme, setCurrentScheme] = useState<ThemeScheme>('default')
  const [currentMode, setCurrentMode] = useState<ThemeMode>('system')

  // Color scheme options (8 color themes)
  const COLOR_SCHEMES = [
    {
      value: 'default' as ThemeScheme,
      label: 'Default',
      description: 'Neutral gray tones',
      preview: { primary: '#18181b', accent: '#f4f4f5', background: '#ffffff' },
    },
    {
      value: 'blue' as ThemeScheme,
      label: 'Blue',
      description: 'Professional blue',
      preview: { primary: '#3b82f6', accent: '#dbeafe', background: '#ffffff' },
    },
    {
      value: 'green' as ThemeScheme,
      label: 'Green',
      description: 'Natural green',
      preview: { primary: '#22c55e', accent: '#dcfce7', background: '#ffffff' },
    },
    {
      value: 'orange' as ThemeScheme,
      label: 'Orange',
      description: 'Warm orange',
      preview: { primary: '#f97316', accent: '#ffedd5', background: '#ffffff' },
    },
    {
      value: 'red' as ThemeScheme,
      label: 'Red',
      description: 'Bold red',
      preview: { primary: '#ef4444', accent: '#fee2e2', background: '#ffffff' },
    },
    {
      value: 'rose' as ThemeScheme,
      label: 'Rose',
      description: 'Elegant rose',
      preview: { primary: '#f43f5e', accent: '#ffe4e6', background: '#ffffff' },
    },
    {
      value: 'violet' as ThemeScheme,
      label: 'Violet',
      description: 'Royal violet',
      preview: { primary: '#8b5cf6', accent: '#ede9fe', background: '#ffffff' },
    },
    {
      value: 'yellow' as ThemeScheme,
      label: 'Yellow',
      description: 'Bright yellow',
      preview: { primary: '#eab308', accent: '#fef9c3', background: '#ffffff' },
    },
  ]

  // Display mode options (Light/Dark/System)
  const DISPLAY_MODES = [
    { value: 'light' as ThemeMode, label: 'Light', icon: <Sun className="h-5 w-5" /> },
    { value: 'dark' as ThemeMode, label: 'Dark', icon: <Moon className="h-5 w-5" /> },
    { value: 'system' as ThemeMode, label: 'System', icon: <Monitor className="h-5 w-5" /> },
  ]

  // Handler functions
  const handleSchemeChange = (scheme: ThemeScheme) => {
    setCurrentScheme(scheme)
    applyTheme(scheme, currentMode)
  }

  const handleModeChange = (mode: ThemeMode) => {
    setCurrentMode(mode)
    applyTheme(currentScheme, mode)
  }

  return (
    <div className="container mx-auto space-y-12 py-8">
      {/* Theme Preview Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Theme Preview</CardTitle>
          <CardDescription>
            Test all color schemes and display modes. Changes apply to the entire app but are not saved to your preferences.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Color Scheme Selector */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-1">Color Scheme</h3>
              <p className="text-xs text-muted-foreground">
                Choose from 8 color themes
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {COLOR_SCHEMES.map((scheme) => (
                <button
                  key={scheme.value}
                  onClick={() => handleSchemeChange(scheme.value)}
                  className={cn(
                    'group relative flex flex-col items-start gap-2 rounded-lg border-2 p-3 text-left transition-all hover:border-muted-foreground/50',
                    currentScheme === scheme.value
                      ? 'border-primary bg-accent'
                      : 'border-muted'
                  )}
                >
                  {/* Color preview circles */}
                  <div className="flex gap-1.5">
                    <div
                      className="h-5 w-5 rounded-full ring-1 ring-border"
                      style={{ backgroundColor: scheme.preview.primary }}
                    />
                    <div
                      className="h-5 w-5 rounded-full ring-1 ring-border"
                      style={{ backgroundColor: scheme.preview.accent }}
                    />
                    <div
                      className="h-5 w-5 rounded-full ring-1 ring-border"
                      style={{ backgroundColor: scheme.preview.background }}
                    />
                  </div>

                  {/* Label */}
                  <div className="space-y-0.5">
                    <div className="text-sm font-semibold">{scheme.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {scheme.description}
                    </div>
                  </div>

                  {/* Active indicator */}
                  {currentScheme === scheme.value && (
                    <div className="absolute top-2 right-2">
                      <Check className="h-4 w-4 text-primary" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Display Mode Selector */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-1">Display Mode</h3>
              <p className="text-xs text-muted-foreground">
                Toggle between light, dark, or system preference
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {DISPLAY_MODES.map((mode) => (
                <Button
                  key={mode.value}
                  variant={currentMode === mode.value ? 'default' : 'outline'}
                  className={cn(
                    'justify-start h-auto py-4 px-4',
                    currentMode === mode.value && 'ring-2 ring-ring ring-offset-2'
                  )}
                  onClick={() => handleModeChange(mode.value)}
                >
                  <div className="flex items-center gap-3">
                    {mode.icon}
                    <span className="font-semibold">{mode.label}</span>
                  </div>
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold">UI Component Library</h1>
        <p className="text-lg text-muted-foreground">
          Comprehensive showcase of all available UI components built with shadcn/ui and
          Tailwind CSS
        </p>
      </div>

      <Separator />

      {/* Typography */}
      <section className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Typography</h2>
          <p className="text-muted-foreground">Text styles and hierarchy</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Headings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h1 className="text-4xl font-bold">Heading 1</h1>
              <code className="text-xs text-muted-foreground">text-4xl font-bold</code>
            </div>
            <div>
              <h2 className="text-3xl font-bold">Heading 2</h2>
              <code className="text-xs text-muted-foreground">text-3xl font-bold</code>
            </div>
            <div>
              <h3 className="text-2xl font-semibold">Heading 3</h3>
              <code className="text-xs text-muted-foreground">text-2xl font-semibold</code>
            </div>
            <div>
              <h4 className="text-xl font-semibold">Heading 4</h4>
              <code className="text-xs text-muted-foreground">text-xl font-semibold</code>
            </div>
            <div>
              <p className="text-base">Body text - Base</p>
              <code className="text-xs text-muted-foreground">text-base</code>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Small text - Muted</p>
              <code className="text-xs text-muted-foreground">text-sm text-muted-foreground</code>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Extra small text</p>
              <code className="text-xs text-muted-foreground">text-xs</code>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Text Colors</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-foreground">Default foreground</p>
            <p className="text-muted-foreground">Muted foreground</p>
            <p className="text-primary">Primary color</p>
            <p className="text-destructive">Destructive color</p>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* Buttons */}
      <section className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Buttons</h2>
          <p className="text-muted-foreground">Button variants and sizes</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Button Variants</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Button Sizes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon">
              <Settings className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Button States</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <Button>Normal</Button>
            <Button disabled>Disabled</Button>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* Form Controls */}
      <section className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Form Controls</h2>
          <p className="text-muted-foreground">Input fields and form elements</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Text Inputs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="input-default">Default Input</Label>
              <Input id="input-default" placeholder="Enter text..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="input-disabled">Disabled Input</Label>
              <Input id="input-disabled" placeholder="Disabled" disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="input-email">Email Input</Label>
              <Input id="input-email" type="email" placeholder="email@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="input-password">Password Input</Label>
              <Input id="input-password" type="password" placeholder="••••••••" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Textarea</CardTitle>
          </CardHeader>
          <CardContent className="max-w-md">
            <Textarea placeholder="Enter longer text..." rows={4} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Select</CardTitle>
          </CardHeader>
          <CardContent className="max-w-md space-y-4">
            <div className="space-y-2">
              <Label>Select Option</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an option..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="option1">Option 1</SelectItem>
                  <SelectItem value="option2">Option 2</SelectItem>
                  <SelectItem value="option3">Option 3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Checkbox</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="checkbox-example"
                checked={checkboxChecked}
                onCheckedChange={(checked) => setCheckboxChecked(checked === true)}
              />
              <Label
                htmlFor="checkbox-example"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Accept terms and conditions
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="checkbox-disabled" disabled />
              <Label
                htmlFor="checkbox-disabled"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Disabled checkbox
              </Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Switch</CardTitle>
            <CardDescription>Toggle switches for on/off states</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="switch-example"
                checked={switchEnabled}
                onCheckedChange={setSwitchEnabled}
              />
              <Label htmlFor="switch-example">Enable notifications</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch id="switch-disabled" disabled />
              <Label htmlFor="switch-disabled">Disabled switch</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Use Switch for settings that take effect immediately (vs Checkbox for form selections).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Radio Group</CardTitle>
            <CardDescription>Single selection from a list of options</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup value={radioValue} onValueChange={setRadioValue}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="option1" id="r1" />
                <Label htmlFor="r1">Option 1 - Default selection</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="option2" id="r2" />
                <Label htmlFor="r2">Option 2 - Alternative choice</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="option3" id="r3" />
                <Label htmlFor="r3">Option 3 - Another option</Label>
              </div>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              Currently selected: <code className="text-xs bg-muted px-1 py-0.5 rounded">{radioValue}</code>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Slider</CardTitle>
            <CardDescription>Range input for numeric values</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Volume: {sliderValue[0]}%</Label>
                <Slider
                  value={sliderValue}
                  onValueChange={setSliderValue}
                  max={100}
                  step={1}
                  className="w-full max-w-md"
                />
              </div>
              <div className="space-y-2">
                <Label>Disabled Slider</Label>
                <Slider defaultValue={[33]} max={100} step={1} disabled className="w-full max-w-md" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Use Slider for ranges, volumes, or any continuous numeric input (0-100, prices, etc).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Date Picker</CardTitle>
            <CardDescription>Calendar date selection with popover</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Select a date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full max-w-sm justify-start text-left font-normal',
                      !date && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, 'PPP') : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-xs text-muted-foreground">
              Common for booking forms, scheduling, date filters. Requires Popover + Calendar components.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Combobox</CardTitle>
            <CardDescription>Searchable dropdown selection</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={comboboxOpen}
                  className="w-full max-w-md justify-between"
                >
                  {comboboxValue
                    ? ['active', 'pending', 'inactive'].find((status) => status === comboboxValue)
                    : 'Select status...'}
                  <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full max-w-md p-0">
                <Command>
                  <CommandInput placeholder="Search status..." />
                  <CommandList>
                    <CommandEmpty>No status found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="active"
                        onSelect={() => {
                          setComboboxValue('active')
                          setComboboxOpen(false)
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            comboboxValue === 'active' ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        Active
                      </CommandItem>
                      <CommandItem
                        value="pending"
                        onSelect={() => {
                          setComboboxValue('pending')
                          setComboboxOpen(false)
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            comboboxValue === 'pending' ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        Pending
                      </CommandItem>
                      <CommandItem
                        value="inactive"
                        onSelect={() => {
                          setComboboxValue('inactive')
                          setComboboxOpen(false)
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            comboboxValue === 'inactive' ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        Inactive
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              Better than Select for long lists (countries, users, etc). Requires Command + Popover.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Toggle</CardTitle>
            <CardDescription>Two-state button (pressed/unpressed)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Toggle
                aria-label="Toggle italic"
                pressed={togglePressed}
                onPressedChange={setTogglePressed}
              >
                <Italic className="h-4 w-4" />
              </Toggle>
              <Toggle aria-label="Toggle bold">
                <Bold className="h-4 w-4" />
              </Toggle>
              <Toggle aria-label="Toggle underline">
                <Underline className="h-4 w-4" />
              </Toggle>
              <Toggle aria-label="Toggle disabled" disabled>
                <Bold className="h-4 w-4" />
              </Toggle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Toggle variant="outline" aria-label="Toggle italic">
                <Italic className="h-4 w-4" />
              </Toggle>
              <Toggle variant="outline" aria-label="Toggle bold">
                <Bold className="h-4 w-4" />
              </Toggle>
            </div>
            <p className="text-xs text-muted-foreground">
              Use for toolbar buttons (formatting, filters). Similar to Switch but visually a button.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Toggle Group</CardTitle>
            <CardDescription>Single or multiple toggle selection</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Text Alignment (Single Select)</Label>
              <ToggleGroup
                type="single"
                value={toggleGroupValue}
                onValueChange={(value) => value && setToggleGroupValue(value)}
              >
                <ToggleGroupItem value="left" aria-label="Align left">
                  <AlignLeft className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="center" aria-label="Align center">
                  <AlignCenter className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="right" aria-label="Align right">
                  <AlignRight className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="space-y-2">
              <Label>Text Formatting (Multiple Select)</Label>
              <ToggleGroup type="multiple">
                <ToggleGroupItem value="bold" aria-label="Toggle bold">
                  <Bold className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="italic" aria-label="Toggle italic">
                  <Italic className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="underline" aria-label="Toggle underline">
                  <Underline className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <p className="text-xs text-muted-foreground">
              Use for mutually exclusive options (single) or independent selections (multiple).
            </p>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* Data Display */}
      <section className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Data Display</h2>
          <p className="text-muted-foreground">Components for displaying information</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Cards</CardTitle>
            <CardDescription>Versatile container component for grouping related content</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Basic card */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Basic Card (Header + Content)</p>
              <Card>
                <CardHeader>
                  <CardTitle>Card Title</CardTitle>
                  <CardDescription>Optional description text</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">
                    This is the most common card pattern. Use for displaying grouped information.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Card with footer */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Card with Footer (Actions)</p>
              <Card>
                <CardHeader>
                  <CardTitle>Complete Task</CardTitle>
                  <CardDescription>Confirm or cancel this action</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">Footer section is useful for action buttons.</p>
                </CardContent>
                <CardFooter className="flex justify-between border-t pt-6">
                  <Button variant="outline">Cancel</Button>
                  <Button>Confirm</Button>
                </CardFooter>
              </Card>
            </div>

            {/* Stat card */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Stat Card (Metrics Dashboard)</p>
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">1,234</div>
                    <p className="text-xs text-muted-foreground">+12% from last month</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Revenue</CardTitle>
                    <Target className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">$45,231</div>
                    <p className="text-xs text-muted-foreground">+5% from last month</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Usage notes */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-mono">
                {'<Card><CardHeader><CardTitle>...</CardTitle></CardHeader></Card>'}
              </p>
              <p className="text-xs text-muted-foreground">
                AI Usage: CardHeader + CardTitle are required. CardDescription and CardFooter are optional.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Badges</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="outline">Outline</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Avatars</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
            <Avatar>
              <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
              <AvatarFallback>CN</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>AB</AvatarFallback>
            </Avatar>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Table</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableCaption>A list of sample data</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">John Doe</TableCell>
                  <TableCell>
                    <Badge variant="outline">Active</Badge>
                  </TableCell>
                  <TableCell>Admin</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Jane Smith</TableCell>
                  <TableCell>
                    <Badge variant="secondary">Pending</Badge>
                  </TableCell>
                  <TableCell>User</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Bob Johnson</TableCell>
                  <TableCell>
                    <Badge>Active</Badge>
                  </TableCell>
                  <TableCell>User</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* Feedback */}
      <section className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Feedback</h2>
          <p className="text-muted-foreground">User feedback and notifications</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <div className="ml-2">
                <h5 className="font-medium">Info Alert</h5>
                <p className="text-sm">This is an informational alert message.</p>
              </div>
            </Alert>
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <div className="ml-2">
                <h5 className="font-medium">Success Alert</h5>
                <p className="text-sm">Your action was completed successfully.</p>
              </div>
            </Alert>
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <div className="ml-2">
                <h5 className="font-medium">Warning Alert</h5>
                <p className="text-sm">Please review this warning message.</p>
              </div>
            </Alert>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <div className="ml-2">
                <h5 className="font-medium">Error Alert</h5>
                <p className="text-sm">An error occurred while processing your request.</p>
              </div>
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Toast Notifications</CardTitle>
            <CardDescription>Click buttons to see toast notifications</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={() => toast('Default toast notification')}>Default Toast</Button>
            <Button
              variant="secondary"
              onClick={() => toast.success('Action completed successfully')}
            >
              Success Toast
            </Button>
            <Button
              variant="destructive"
              onClick={() => toast.error('An error occurred')}
            >
              Error Toast
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast('Event created', {
                  description: 'Your event has been scheduled for tomorrow',
                  action: {
                    label: 'Undo',
                    onClick: () => toast('Event cancelled'),
                  },
                })
              }
            >
              Toast with Action
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dialog</CardTitle>
            <CardDescription>Modal dialog for important interactions</CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog>
              <DialogTrigger asChild>
                <Button>Open Dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Dialog Title</DialogTitle>
                  <DialogDescription>
                    This is a dialog description. Dialogs are great for focused tasks and
                    confirmations.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <p className="text-sm">Dialog content goes here.</p>
                </div>
                <DialogFooter>
                  <Button variant="outline">Cancel</Button>
                  <Button>Confirm</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sheet</CardTitle>
            <CardDescription>Slide-out panel from the side</CardDescription>
          </CardHeader>
          <CardContent>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline">Open Sheet</Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Sheet Title</SheetTitle>
                  <SheetDescription>
                    Sheets are useful for displaying additional information or forms without
                    leaving the current page.
                  </SheetDescription>
                </SheetHeader>
                <div className="py-4">
                  <p className="text-sm">Sheet content goes here.</p>
                </div>
              </SheetContent>
            </Sheet>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* Navigation */}
      <section className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Navigation</h2>
          <p className="text-muted-foreground">Navigation components and menus</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tabs</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="tab1" className="w-full">
              <TabsList>
                <TabsTrigger value="tab1">Tab 1</TabsTrigger>
                <TabsTrigger value="tab2">Tab 2</TabsTrigger>
                <TabsTrigger value="tab3">Tab 3</TabsTrigger>
              </TabsList>
              <TabsContent value="tab1" className="mt-4">
                <p className="text-sm text-muted-foreground">Content for Tab 1</p>
              </TabsContent>
              <TabsContent value="tab2" className="mt-4">
                <p className="text-sm text-muted-foreground">Content for Tab 2</p>
              </TabsContent>
              <TabsContent value="tab3" className="mt-4">
                <p className="text-sm text-muted-foreground">Content for Tab 3</p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dropdown Menu</CardTitle>
          </CardHeader>
          <CardContent>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Open Menu</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* Layout */}
      <section className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Layout</h2>
          <p className="text-muted-foreground">Layout utilities and helpers</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Separator</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm">Content above separator</p>
              <Separator className="my-4" />
              <p className="text-sm">Content below separator</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* Loading States */}
      <section className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Loading States</h2>
          <p className="text-muted-foreground">Skeleton loaders for async content</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Skeleton</CardTitle>
            <CardDescription>Use while data is loading</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Card skeleton example */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Card Layout</p>
              <div className="space-y-2">
                <Skeleton className="h-4 w-[250px]" />
                <Skeleton className="h-4 w-[200px]" />
                <Skeleton className="h-4 w-[150px]" />
              </div>
            </div>

            {/* List skeleton example */}
            <div className="space-y-2">
              <p className="text-sm font-medium">List Items</p>
              <div className="space-y-2">
                <div className="flex items-center space-x-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-[200px]" />
                    <Skeleton className="h-4 w-[150px]" />
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-[200px]" />
                    <Skeleton className="h-4 w-[150px]" />
                  </div>
                </div>
              </div>
            </div>

            {/* Code example for AI agents */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-mono">
                {'<Skeleton className="h-4 w-[250px]" />'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Empty States</CardTitle>
            <CardDescription>Show when there's no data to display</CardDescription>
          </CardHeader>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ListTodo className="h-8 w-8" />
                </EmptyMedia>
                <EmptyTitle>No items found</EmptyTitle>
                <EmptyDescription>
                  Get started by creating your first item.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>

            <div className="mt-4 space-y-2">
              <p className="text-xs text-muted-foreground">
                Usage: Display when lists/tables/grids are empty
              </p>
              <p className="text-xs text-muted-foreground font-mono">
                {'<Empty><EmptyHeader>...</EmptyHeader></Empty>'}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* Confirmation Dialogs */}
      <section className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Confirmation</h2>
          <p className="text-muted-foreground">AlertDialog for destructive actions</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>AlertDialog</CardTitle>
            <CardDescription>
              Use for confirming destructive actions (delete, remove, etc.)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Delete Item</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the item
                    from our servers.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Usage: Always use for DELETE operations and destructive actions
              </p>
              <p className="text-xs text-muted-foreground">
                Pattern: Cancel (left) + Destructive Action (right, red button)
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* Scrollable Areas */}
      <section className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Scrollable Content</h2>
          <p className="text-muted-foreground">ScrollArea for overflow content</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>ScrollArea</CardTitle>
            <CardDescription>
              Custom styled scrollbars for long content
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-72 w-full rounded-md border p-4">
              <div className="space-y-4">
                {Array.from({ length: 20 }).map((_, i) => (
                  <p key={i} className="text-sm">
                    This is scrollable content item {i + 1}. The ScrollArea component
                    provides custom-styled scrollbars that match your design system.
                  </p>
                ))}
              </div>
              <ScrollBar orientation="vertical" />
            </ScrollArea>

            <div className="mt-4 space-y-1">
              <p className="text-xs text-muted-foreground">
                Usage: Long lists, code blocks, fixed-height containers
              </p>
              <p className="text-xs text-muted-foreground font-mono">
                {'<ScrollArea className="h-72"><ScrollBar /></ScrollArea>'}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* Design System - Colors */}
      <section className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Design System</h2>
          <p className="text-muted-foreground">Core design tokens and utilities</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Color Palette</CardTitle>
            <CardDescription>Semantic color tokens</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="h-20 rounded-md bg-background border flex items-center justify-center text-sm font-medium">
                  background
                </div>
                <code className="text-xs">bg-background</code>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-md bg-foreground flex items-center justify-center text-sm font-medium text-background">
                  foreground
                </div>
                <code className="text-xs">bg-foreground</code>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-md bg-primary flex items-center justify-center text-sm font-medium text-primary-foreground">
                  primary
                </div>
                <code className="text-xs">bg-primary</code>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-md bg-secondary flex items-center justify-center text-sm font-medium">
                  secondary
                </div>
                <code className="text-xs">bg-secondary</code>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-md bg-muted flex items-center justify-center text-sm font-medium">
                  muted
                </div>
                <code className="text-xs">bg-muted</code>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-md bg-accent flex items-center justify-center text-sm font-medium">
                  accent
                </div>
                <code className="text-xs">bg-accent</code>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-md bg-destructive flex items-center justify-center text-sm font-medium text-destructive-foreground">
                  destructive
                </div>
                <code className="text-xs">bg-destructive</code>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-md bg-border border-4 flex items-center justify-center text-sm font-medium">
                  border
                </div>
                <code className="text-xs">border</code>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-md bg-card border flex items-center justify-center text-sm font-medium">
                  card
                </div>
                <code className="text-xs">bg-card</code>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              AI Usage: Use semantic tokens (primary, destructive) not specific colors (red, blue)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Icons Library</CardTitle>
            <CardDescription>Common Lucide icons used in this project</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 md:grid-cols-8 gap-4">
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <Home className="h-6 w-6" />
                <span className="text-xs">Home</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <Settings className="h-6 w-6" />
                <span className="text-xs">Settings</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <User className="h-6 w-6" />
                <span className="text-xs">User</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <Users className="h-6 w-6" />
                <span className="text-xs">Users</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <Mail className="h-6 w-6" />
                <span className="text-xs">Mail</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <Phone className="h-6 w-6" />
                <span className="text-xs">Phone</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <CalendarIcon className="h-6 w-6" />
                <span className="text-xs">Calendar</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <Clock className="h-6 w-6" />
                <span className="text-xs">Clock</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <Search className="h-6 w-6" />
                <span className="text-xs">Search</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <Edit className="h-6 w-6" />
                <span className="text-xs">Edit</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <Trash className="h-6 w-6" />
                <span className="text-xs">Trash</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <Plus className="h-6 w-6" />
                <span className="text-xs">Plus</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <Minus className="h-6 w-6" />
                <span className="text-xs">Minus</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <X className="h-6 w-6" />
                <span className="text-xs">X</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <Check className="h-6 w-6" />
                <span className="text-xs">Check</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <Star className="h-6 w-6" />
                <span className="text-xs">Star</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <Heart className="h-6 w-6" />
                <span className="text-xs">Heart</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <Share2 className="h-6 w-6" />
                <span className="text-xs">Share2</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <Download className="h-6 w-6" />
                <span className="text-xs">Download</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <Upload className="h-6 w-6" />
                <span className="text-xs">Upload</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <FileText className="h-6 w-6" />
                <span className="text-xs">FileText</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <Image className="h-6 w-6" />
                <span className="text-xs">Image</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <Building2 className="h-6 w-6" />
                <span className="text-xs">Building2</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <Target className="h-6 w-6" />
                <span className="text-xs">Target</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <ChevronRight className="h-6 w-6" />
                <span className="text-xs">ChevronRight</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <ArrowRight className="h-6 w-6" />
                <span className="text-xs">ArrowRight</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <AlertCircle className="h-6 w-6" />
                <span className="text-xs">AlertCircle</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-2 rounded hover:bg-muted">
                <CheckCircle2 className="h-6 w-6" />
                <span className="text-xs">CheckCircle2</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              AI Usage: Import from 'lucide-react'. Always provide className="h-4 w-4" (or h-5/h-6 for larger)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spacing Scale</CardTitle>
            <CardDescription>Tailwind spacing utilities</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-20 text-xs font-mono text-muted-foreground">gap-1</div>
                <div className="flex gap-1">
                  <div className="h-8 w-8 bg-primary"></div>
                  <div className="h-8 w-8 bg-primary"></div>
                  <div className="h-8 w-8 bg-primary"></div>
                </div>
                <code className="text-xs text-muted-foreground">4px</code>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-20 text-xs font-mono text-muted-foreground">gap-2</div>
                <div className="flex gap-2">
                  <div className="h-8 w-8 bg-primary"></div>
                  <div className="h-8 w-8 bg-primary"></div>
                  <div className="h-8 w-8 bg-primary"></div>
                </div>
                <code className="text-xs text-muted-foreground">8px</code>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-20 text-xs font-mono text-muted-foreground">gap-4</div>
                <div className="flex gap-4">
                  <div className="h-8 w-8 bg-primary"></div>
                  <div className="h-8 w-8 bg-primary"></div>
                  <div className="h-8 w-8 bg-primary"></div>
                </div>
                <code className="text-xs text-muted-foreground">16px</code>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-20 text-xs font-mono text-muted-foreground">gap-6</div>
                <div className="flex gap-6">
                  <div className="h-8 w-8 bg-primary"></div>
                  <div className="h-8 w-8 bg-primary"></div>
                  <div className="h-8 w-8 bg-primary"></div>
                </div>
                <code className="text-xs text-muted-foreground">24px</code>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-20 text-xs font-mono text-muted-foreground">gap-8</div>
                <div className="flex gap-8">
                  <div className="h-8 w-8 bg-primary"></div>
                  <div className="h-8 w-8 bg-primary"></div>
                  <div className="h-8 w-8 bg-primary"></div>
                </div>
                <code className="text-xs text-muted-foreground">32px</code>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              AI Usage: Use gap-2 (tight), gap-4 (default), gap-6 (comfortable), gap-8 (spacious)
            </p>
            <p className="text-xs text-muted-foreground">
              Common patterns: space-y-4 (vertical), space-x-2 (horizontal), p-4 (padding)
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <div className="py-8 text-center text-sm text-muted-foreground">
        <p>Style Guide • Vite Flare Stack • Built with shadcn/ui and Tailwind CSS</p>
        <p className="mt-2 text-xs">
          Reference for developers and AI coding agents
        </p>
      </div>
    </div>
  )
}
