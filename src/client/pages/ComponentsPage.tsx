import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Calendar } from '@/components/ui/calendar'
import { Separator } from '@/components/ui/separator'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { DatePicker } from '@/components/ui/date-picker'
import { AudioRecorder } from '@/client/components/AudioRecorder'
import { EmptyState } from '@/client/components/EmptyState'
import { MarkdownField } from '@/client/components/MarkdownField'
import { toast } from 'sonner'
import { AlertCircle, Check, Info, MoreHorizontal, Terminal, Inbox, PanelRight } from 'lucide-react'

/**
 * Components showcase page
 * Displays all available shadcn/ui components for reference
 * Useful for both human developers and AI agents
 */
export function ComponentsPage() {
  const [date, setDate] = useState<Date | undefined>(new Date())
  const [pickerDate, setPickerDate] = useState<Date | undefined>(new Date())
  const [sliderValue, setSliderValue] = useState([50])
  const [switchEnabled, setSwitchEnabled] = useState(false)
  const [checkboxChecked, setCheckboxChecked] = useState(false)
  const [radioValue, setRadioValue] = useState('comfortable')

  return (
    <PageContainer type="form" maxWidth="6xl">
      <PageHeader
        title="Components"
        subtitle="Live examples of every shadcn/ui primitive plus the starter's custom components. Builder-mode reference page."
      />

      <Tabs defaultValue="buttons" className="w-full">
        <TabsList className="flex w-full overflow-x-auto">
          <TabsTrigger value="buttons">Buttons</TabsTrigger>
          <TabsTrigger value="inputs">Inputs</TabsTrigger>
          <TabsTrigger value="display">Display</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
          <TabsTrigger value="overlay">Overlay</TabsTrigger>
          <TabsTrigger value="custom">Custom</TabsTrigger>
        </TabsList>

        {/* Buttons Tab */}
        <TabsContent value="buttons" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Button Variants</CardTitle>
              <CardDescription>Different button styles for various use cases</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              {(
                [
                  { variant: 'default', label: 'Default' },
                  { variant: 'secondary', label: 'Secondary' },
                  { variant: 'destructive', label: 'Destructive' },
                  { variant: 'outline', label: 'Outline' },
                  { variant: 'ghost', label: 'Ghost' },
                  { variant: 'link', label: 'Link' },
                ] as const
              ).map(({ variant, label }) => (
                <div
                  key={variant}
                  className="flex flex-col items-center gap-1.5 rounded-md border border-dashed border-border/60 p-3"
                >
                  <Button variant={variant}>{label}</Button>
                  <code className="text-[10px] text-muted-foreground">
                    variant=&quot;{variant}&quot;
                  </code>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Button Sizes</CardTitle>
              <CardDescription>Different button sizes</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-4">
              {(
                [
                  { size: 'sm', content: 'Small' },
                  { size: 'default', content: 'Default' },
                  { size: 'lg', content: 'Large' },
                  { size: 'icon', content: <Check className="h-4 w-4" /> },
                ] as const
              ).map(({ size, content }) => (
                <div
                  key={size}
                  className="flex flex-col items-center gap-1.5 rounded-md border border-dashed border-border/60 p-3"
                >
                  <Button size={size} aria-label={size === 'icon' ? 'Icon size button' : undefined}>
                    {content}
                  </Button>
                  <code className="text-[10px] text-muted-foreground">size=&quot;{size}&quot;</code>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Button States</CardTitle>
              <CardDescription>Loading and disabled states</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <Button disabled>Disabled</Button>
              <Button disabled>
                <Spinner size="md" className="mr-2" />
                Loading
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inputs Tab */}
        <TabsContent value="inputs" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Text Inputs</CardTitle>
              <CardDescription>Standard form inputs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="Enter your email" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="message">Message</Label>
                <Textarea id="message" placeholder="Type your message here" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Select</CardTitle>
              <CardDescription>Dropdown selection component</CardDescription>
            </CardHeader>
            <CardContent>
              <Select>
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue placeholder="Select a fruit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="apple">Apple</SelectItem>
                  <SelectItem value="banana">Banana</SelectItem>
                  <SelectItem value="orange">Orange</SelectItem>
                  <SelectItem value="grape">Grape</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Toggle Controls</CardTitle>
              <CardDescription>Checkbox and switch components</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="terms"
                  checked={checkboxChecked}
                  onCheckedChange={(checked) => setCheckboxChecked(checked as boolean)}
                />
                <Label htmlFor="terms">Accept terms and conditions</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="airplane-mode"
                  checked={switchEnabled}
                  onCheckedChange={setSwitchEnabled}
                />
                <Label htmlFor="airplane-mode">Airplane Mode</Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Slider</CardTitle>
              <CardDescription>Range selection component</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Slider
                  value={sliderValue}
                  onValueChange={setSliderValue}
                  max={100}
                  step={1}
                  className="w-full max-w-sm"
                />
                <p className="text-sm text-muted-foreground">Value: {sliderValue[0]}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Radio Group</CardTitle>
              <CardDescription>Single selection from a set of options</CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup value={radioValue} onValueChange={setRadioValue}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="default" id="r1" />
                  <Label htmlFor="r1">Default</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="comfortable" id="r2" />
                  <Label htmlFor="r2">Comfortable</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="compact" id="r3" />
                  <Label htmlFor="r3">Compact</Label>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Date Picker</CardTitle>
              <CardDescription>Popover-based date selection</CardDescription>
            </CardHeader>
            <CardContent>
              <DatePicker value={pickerDate} onChange={setPickerDate} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Calendar</CardTitle>
              <CardDescription>
                Inline calendar for date ranges or always-visible selection
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md border"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Display Tab */}
        <TabsContent value="display" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Badges</CardTitle>
              <CardDescription>Status and label indicators</CardDescription>
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
              <CardTitle>Avatar</CardTitle>
              <CardDescription>User profile images with fallback</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-4">
              <Avatar>
                <AvatarImage src="https://github.com/shadcn.png" />
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
              <CardTitle>Progress</CardTitle>
              <CardDescription>Progress indicator</CardDescription>
            </CardHeader>
            <CardContent>
              <Progress value={66} className="w-full max-w-sm" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Skeleton</CardTitle>
              <CardDescription>Loading placeholder</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center space-x-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-[250px]" />
                <Skeleton className="h-4 w-[200px]" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Table</CardTitle>
              <CardDescription>Data table component</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableCaption>A list of recent invoices</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>INV001</TableCell>
                    <TableCell>
                      <Badge>Paid</Badge>
                    </TableCell>
                    <TableCell className="text-right">$250.00</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>INV002</TableCell>
                    <TableCell>
                      <Badge variant="secondary">Pending</Badge>
                    </TableCell>
                    <TableCell className="text-right">$150.00</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Accordion</CardTitle>
              <CardDescription>Collapsible content sections</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger>Is it accessible?</AccordionTrigger>
                  <AccordionContent>
                    Yes. It adheres to the WAI-ARIA design pattern.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger>Is it styled?</AccordionTrigger>
                  <AccordionContent>
                    Yes. It comes with default styles that match the other components.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Feedback Tab */}
        <TabsContent value="feedback" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Alerts</CardTitle>
              <CardDescription>Informational messages</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Terminal className="h-4 w-4" />
                <AlertTitle>Heads up!</AlertTitle>
                <AlertDescription>
                  You can add components to your app using the CLI.
                </AlertDescription>
              </Alert>
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>Your session has expired. Please log in again.</AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tooltip</CardTitle>
              <CardDescription>Contextual information on hover</CardDescription>
            </CardHeader>
            <CardContent>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline">
                    <Info className="mr-2 h-4 w-4" />
                    Hover me
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>This is a tooltip</p>
                </TooltipContent>
              </Tooltip>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Toast (Sonner)</CardTitle>
              <CardDescription>Notification toasts for success, error, and info</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => toast.success('Item saved successfully')}>
                Success
              </Button>
              <Button variant="outline" onClick={() => toast.error('Something went wrong')}>
                Error
              </Button>
              <Button variant="outline" onClick={() => toast.info('New update available')}>
                Info
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  toast('Event created', { description: 'Monday, January 3 at 6:00 PM' })
                }
              >
                With description
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Overlay Tab */}
        <TabsContent value="overlay" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Dialog</CardTitle>
              <CardDescription>Modal dialog for user interactions</CardDescription>
            </CardHeader>
            <CardContent>
              <Dialog>
                <DialogTrigger asChild>
                  <Button>Open Dialog</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Are you sure?</DialogTitle>
                    <DialogDescription>
                      This action cannot be undone. This will permanently delete your account.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline">Cancel</Button>
                    <Button>Continue</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Alert Dialog</CardTitle>
              <CardDescription>Confirmation dialog for destructive actions</CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">Delete Account</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete your account.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction>Yes, delete account</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dropdown Menu</CardTitle>
              <CardDescription>Contextual menu for actions</CardDescription>
            </CardHeader>
            <CardContent>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Profile</DropdownMenuItem>
                  <DropdownMenuItem>Settings</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sheet</CardTitle>
              <CardDescription>
                Slide-over panel from the edge — great for mobile drawers and detail views
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline">
                    <PanelRight className="mr-2 h-4 w-4" />
                    Open Sheet
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Sheet Title</SheetTitle>
                    <SheetDescription>
                      This is a slide-over panel. Use it for detail views, forms, or mobile
                      navigation.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="py-6 space-y-4">
                    <div className="grid gap-2">
                      <Label htmlFor="sheet-name">Name</Label>
                      <Input id="sheet-name" placeholder="Enter a name" />
                    </div>
                    <Button className="w-full">Save changes</Button>
                  </div>
                </SheetContent>
              </Sheet>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Command</CardTitle>
              <CardDescription>
                Searchable command palette — the building block behind Cmd+K
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Command className="rounded-lg border">
                <CommandInput placeholder="Type a command or search..." />
                <CommandList>
                  <CommandEmpty>No results found.</CommandEmpty>
                  <CommandGroup heading="Suggestions">
                    <CommandItem>Calendar</CommandItem>
                    <CommandItem>Search Emoji</CommandItem>
                    <CommandItem>Calculator</CommandItem>
                  </CommandGroup>
                  <CommandGroup heading="Settings">
                    <CommandItem>Profile</CommandItem>
                    <CommandItem>Billing</CommandItem>
                    <CommandItem>Preferences</CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Custom Components Tab */}
        <TabsContent value="custom" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Audio Recorder</CardTitle>
              <CardDescription>Voice input — full and compact modes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Full mode</Label>
                <AudioRecorder
                  onRecordingComplete={(_blob, ms) => alert(`Recorded ${(ms / 1000).toFixed(1)}s`)}
                />
              </div>
              <Separator />
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">
                  Compact mode (for toolbars)
                </Label>
                <AudioRecorder
                  compact
                  onRecordingComplete={(_b, ms) => alert(`Recorded ${(ms / 1000).toFixed(1)}s`)}
                />
              </div>
              <Separator />
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">
                  Streaming chunks (1s cadence for demo) — live counter below
                </Label>
                <AudioRecorderChunkDemo />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Empty State</CardTitle>
              <CardDescription>Placeholder for empty lists and pages</CardDescription>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={Inbox}
                title="No items yet"
                description="Get started by creating your first item."
                action={{ label: 'Create item', onClick: () => alert('Create clicked') }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Markdown Field</CardTitle>
              <CardDescription>
                Preview/edit toggle, rich copy (formatted paste into Outlook / Docs), and .md/.txt
                export. Read-only when no onChange is passed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">
                  Editable (onChange provided)
                </Label>
                <MarkdownFieldDemo />
              </div>
              <Separator />
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">
                  Read-only (preview + copy + export, no Edit toggle)
                </Label>
                <MarkdownField
                  value={
                    '## Release notes\n\n- Shipped **rich copy**\n- Added `<MarkdownField>`\n\nPaste this into a doc to see the formatting survive.'
                  }
                  exportName="release-notes"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Separator</CardTitle>
              <CardDescription>Visual divider between content sections</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm">Content above</p>
                <Separator className="my-4" />
                <p className="text-sm">Content below</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm">Left</span>
                <Separator orientation="vertical" className="h-6" />
                <span className="text-sm">Right</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}

/** Demo wrapper for the editable MarkdownField — holds the draft state. */
function MarkdownFieldDemo() {
  const [draft, setDraft] = useState(
    '# Meeting notes\n\nDiscussed the **Q3 roadmap**:\n\n1. Ship the inbox\n2. Wire up _routines_\n3. Audit the [docs](https://example.com)\n\n> Toggle **Edit** to see the raw markdown.'
  )
  return <MarkdownField value={draft} onChange={setDraft} exportName="meeting-notes" />
}

/**
 * Demo wrapper for the AudioRecorder streaming-chunk mode. Counts chunks
 * as they arrive and renders the live count. 1-second cadence is for
 * demo visibility — production streaming typically uses 30-60s chunks.
 */
function AudioRecorderChunkDemo() {
  const [chunkCount, setChunkCount] = useState(0)
  const [totalBytes, setTotalBytes] = useState(0)
  const [lastDuration, setLastDuration] = useState<number | null>(null)

  return (
    <div className="space-y-2">
      <AudioRecorder
        chunkDurationMs={1000}
        maxDuration={60}
        onChunk={(chunk) => {
          setChunkCount((n) => n + 1)
          setTotalBytes((b) => b + chunk.size)
        }}
        onRecordingComplete={(_blob, ms) => {
          // Demo page: we just track the duration. A real consumer would
          // keep the blob for archive / upload / transcription.
          setLastDuration(ms)
        }}
      />
      <div className="text-xs text-muted-foreground font-mono tabular-nums">
        chunks: {chunkCount} · bytes: {totalBytes.toLocaleString()}
        {lastDuration != null && ` · last recording: ${(lastDuration / 1000).toFixed(1)}s`}
      </div>
    </div>
  )
}
