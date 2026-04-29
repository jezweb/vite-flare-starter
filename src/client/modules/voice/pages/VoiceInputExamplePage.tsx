/**
 * VoiceInputExample — minimal React page demonstrating the
 * `@cloudflare/voice` + `useVoiceInput` React hook pattern.
 *
 * Talks to the `VoiceInputExample` Durable Object
 * (src/server/modules/voice/voice-agent.ts) over a WebSocket. Shows
 * real-time interim transcript + accumulated final transcript.
 *
 * Gated behind the `voiceAgent` feature flag (default OFF). Set
 * `VITE_FEATURE_VOICE_AGENT=true` in `.dev.vars` to enable.
 *
 * To build on this: rename the DO, replace `onTranscript` server-side
 * with your own logic, swap the UI for whatever your product needs.
 */
import { useMemo, useState } from 'react'
import { useVoiceInput } from '@cloudflare/voice/react'
import { Mic, Square } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function VoiceInputExamplePage() {
  // One DO instance per session. In a real app, bind this to something
  // stable (session id from a POST, user id, room id, etc.) rather than
  // generating on mount.
  const [sessionId] = useState(() => crypto.randomUUID())

  const {
    transcript,
    interimTranscript,
    audioLevel,
    isMuted,
    error,
    start,
    stop,
    toggleMute,
    clear,
  } = useVoiceInput({
    agent: 'VoiceInputExample',
    name: sessionId,
  })

  const [isActive, setIsActive] = useState(false)

  const handleStart = async () => {
    try {
      await start()
      setIsActive(true)
    } catch {
      /* error surfaces via `error` */
    }
  }

  const handleStop = () => {
    stop()
    setIsActive(false)
  }

  const combined = useMemo(
    () => transcript + (interimTranscript ? ` ${interimTranscript}` : ''),
    [transcript, interimTranscript],
  )

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Voice Input Example</h1>
        <p className="mt-1 text-muted-foreground">
          Reference scaffold for the{' '}
          <code className="px-1 py-0.5 rounded bg-muted font-mono text-sm">
            @cloudflare/voice
          </code>{' '}
          + <code className="px-1 py-0.5 rounded bg-muted font-mono text-sm">agents</code>{' '}
          SDK pattern. Session id{' '}
          <code className="font-mono text-xs">{sessionId.slice(0, 8)}</code>.
        </p>
      </div>

      <Card>
        <CardContent className="py-6 space-y-4">
          <div className="flex items-center justify-between">
            <Badge variant={isActive ? 'default' : 'secondary'}>
              {isActive ? (isMuted ? 'muted' : 'listening') : 'idle'}
            </Badge>
            <div className="flex-1 mx-4">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-[width] duration-75"
                  style={{ width: `${Math.max(2, audioLevel * 100)}%` }}
                />
              </div>
            </div>
            <span className="text-xs text-muted-foreground font-mono tabular-nums">
              level {audioLevel.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {!isActive ? (
              <Button onClick={handleStart} className="gap-2">
                <Mic className="h-4 w-4" />
                Start listening
              </Button>
            ) : (
              <>
                <Button onClick={handleStop} variant="destructive" className="gap-2">
                  <Square className="h-4 w-4 fill-current" />
                  Stop
                </Button>
                <Button onClick={toggleMute} variant="outline">
                  {isMuted ? 'Unmute' : 'Mute'}
                </Button>
              </>
            )}
            <Button
              onClick={clear}
              variant="ghost"
              disabled={!combined}
              className="ml-auto"
            >
              Clear transcript
            </Button>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Transcript
          </p>
          {combined ? (
            <p className="leading-relaxed whitespace-pre-wrap">
              <span className="text-foreground">{transcript}</span>
              {interimTranscript && (
                <span className="italic text-muted-foreground"> {interimTranscript}</span>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {isActive ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size="sm" />
                  Waiting for your voice…
                </span>
              ) : (
                'Tap Start to begin.'
              )}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="py-4 text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">How this works</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              Browser opens a WebSocket to{' '}
              <code className="font-mono text-xs">
                /agents/voice-input-example/{sessionId.slice(0, 8)}…
              </code>
            </li>
            <li>
              <code className="font-mono text-xs">routeAgentRequest</code> in the Worker
              entry routes it to the <code className="font-mono text-xs">VoiceInputExample</code>{' '}
              Durable Object
            </li>
            <li>
              The DO's transcriber (Workers AI Deepgram Nova 3) streams audio in,
              emits turn-detected utterances via{' '}
              <code className="font-mono text-xs">onTranscript</code>
            </li>
            <li>
              Server broadcasts each utterance back over the same WS — this page
              just renders the final + interim strings from the hook.
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
