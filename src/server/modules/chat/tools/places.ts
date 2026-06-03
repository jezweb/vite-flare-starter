/**
 * Places Tools — search local businesses via Google Places API (New)
 *
 * Pairs with the show_map inline UI tool to render map answers.
 * Requires GOOGLE_PLACES_API_KEY. Without it, these tools are silently omitted
 * from the toolkit (the agent.ts nudge also won't fire).
 *
 * API docs: https://developers.google.com/maps/documentation/places/web-service
 * Get a key: https://console.cloud.google.com → enable "Places API (New)".
 */
import { z } from 'zod'
import { MapPin, Info } from 'lucide-react'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

interface PlacesEnv {
  GOOGLE_PLACES_API_KEY?: string
}

function getPlacesEnv(ctx: AgentContext): PlacesEnv {
  return ctx.env as unknown as PlacesEnv
}

const BASIC_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.shortFormattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'places.location',
  'places.businessStatus',
].join(',')

const DETAIL_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'shortFormattedAddress',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'googleMapsUri',
  'rating',
  'userRatingCount',
  'priceLevel',
  'primaryType',
  'primaryTypeDisplayName',
  'location',
  'regularOpeningHours',
  'currentOpeningHours',
  'editorialSummary',
  'reviews',
].join(',')

const NormalisedPlaceSchema = z.object({
  placeId: z.string(),
  name: z.string(),
  address: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  googleMapsUrl: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  rating: z.number().optional(),
  reviewCount: z.number().optional(),
  priceLevel: z.string().optional(),
  type: z.string().optional(),
  types: z.array(z.string()).optional(),
  status: z.string().optional(),
})

export type NormalisedPlace = z.infer<typeof NormalisedPlaceSchema>

const PlacesSearchOutput = z.union([
  z.object({ count: z.number(), places: z.array(NormalisedPlaceSchema) }),
  z.object({ error: z.string() }),
])
export type PlacesSearchOutput = z.infer<typeof PlacesSearchOutput>

const PlaceDetailsOutput = z.union([
  NormalisedPlaceSchema.extend({
    hours: z
      .object({
        openNow: z.boolean().optional(),
        weekdayDescriptions: z.array(z.string()).optional(),
      })
      .optional(),
    reviews: z
      .array(
        z.object({
          author: z.string().optional(),
          rating: z.number().optional(),
          text: z.string().optional(),
          time: z.string().optional(),
        })
      )
      .optional(),
    editorialSummary: z.string().optional(),
  }),
  z.object({ error: z.string() }),
])
export type PlaceDetailsOutput = z.infer<typeof PlaceDetailsOutput>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalise(place: any): NormalisedPlace {
  return {
    placeId: place.id,
    name: place.displayName?.text ?? '',
    address: place.formattedAddress || place.shortFormattedAddress,
    phone: place.nationalPhoneNumber || place.internationalPhoneNumber,
    website: place.websiteUri,
    googleMapsUrl: place.googleMapsUri,
    lat: place.location?.latitude,
    lng: place.location?.longitude,
    rating: place.rating,
    reviewCount: place.userRatingCount,
    priceLevel: place.priceLevel,
    type: place.primaryTypeDisplayName?.text || place.primaryType,
    types: place.types,
    status: place.businessStatus,
  }
}

async function textSearch(
  apiKey: string,
  query: string,
  opts: {
    lat?: number
    lng?: number
    radius?: number
    maxResults?: number
    openNow?: boolean
    type?: string
    region?: string
  }
): Promise<NormalisedPlace[]> {
  const body: {
    textQuery: string
    maxResultCount: number
    regionCode: string
    locationBias?: { circle: { center: { latitude: number; longitude: number }; radius: number } }
    openNow?: boolean
    includedType?: string
  } = {
    textQuery: query,
    maxResultCount: Math.min(opts.maxResults ?? 8, 20),
    regionCode: opts.region ?? 'AU',
  }
  if (opts.lat != null && opts.lng != null) {
    body.locationBias = {
      circle: { center: { latitude: opts.lat, longitude: opts.lng }, radius: opts.radius ?? 50000 },
    }
  }
  if (opts.openNow) body.openNow = true
  if (opts.type) body.includedType = opts.type

  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': BASIC_FIELD_MASK,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Places API error ${response.status}: ${text.slice(0, 200)}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await response.json()) as { places?: any[] }
  return (data.places ?? []).map(normalise)
}

async function placeDetails(
  apiKey: string,
  placeId: string
): Promise<
  NormalisedPlace & {
    hours?: { openNow?: boolean; weekdayDescriptions?: string[] }
    reviews?: Array<{ author?: string; rating?: number; text?: string; time?: string }>
    editorialSummary?: string
  }
> {
  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': DETAIL_FIELD_MASK,
      },
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Places API error ${response.status}: ${text.slice(0, 200)}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const place = (await response.json()) as any
  const base = normalise(place)
  return {
    ...base,
    editorialSummary: place.editorialSummary?.text,
    hours: place.regularOpeningHours
      ? {
          openNow: place.currentOpeningHours?.openNow ?? place.regularOpeningHours?.openNow,
          weekdayDescriptions: place.regularOpeningHours.weekdayDescriptions,
        }
      : undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reviews: place.reviews?.map((r: any) => ({
      author: r.authorAttribution?.displayName,
      rating: r.rating,
      text: r.text?.text,
      time: r.relativePublishTimeDescription || r.publishTime,
    })),
  }
}

// ─── Tool Definitions ───────────────────────────────────────────────────

export const placesSearchDefinition: ToolDefinition<
  {
    query: string
    lat?: number
    lng?: number
    radius?: number
    max_results?: number
    open_now?: boolean
    type?: string
    region?: string
  },
  PlacesSearchOutput
> = {
  name: 'places_search',
  description:
    'Search for local businesses or points of interest by text query. Uses Google Places API (New). ' +
    'Returns name, location (lat/lng), address, phone, website, rating, review count, and type for each result. ' +
    'Pair the results with the `show_map` UI tool to render a map + card list in chat. ' +
    'Always include the suburb or city in the query (e.g. "wreckers Newcastle NSW", not just "wreckers").',
  inputSchema: z.object({
    query: z.string().describe('Search query — include suburb/city (e.g. "plumber Newcastle NSW")'),
    lat: z.number().optional().describe('Latitude to bias the search around'),
    lng: z.number().optional().describe('Longitude to bias the search around'),
    radius: z.number().optional().describe('Bias radius in metres (default 50000)'),
    max_results: z.number().optional().describe('Max results 1-20 (default 8)'),
    open_now: z.boolean().optional().describe('Only return places currently open'),
    type: z
      .string()
      .optional()
      .describe('Filter by Google place type (e.g. "restaurant", "car_repair")'),
    region: z.string().optional().describe('ISO country code for region bias (default "AU")'),
  }),
  outputSchema: PlacesSearchOutput,
  isAvailable: (ctx) => !!getPlacesEnv(ctx).GOOGLE_PLACES_API_KEY,
  execute: async (args, ctx) => {
    const apiKey = getPlacesEnv(ctx).GOOGLE_PLACES_API_KEY!
    try {
      const places = await textSearch(apiKey, args.query, {
        lat: args.lat,
        lng: args.lng,
        radius: args.radius,
        maxResults: args.max_results,
        openNow: args.open_now,
        type: args.type,
        region: args.region,
      })
      return { count: places.length, places }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  },
  render: {
    icon: MapPin,
    displayName: 'Places Search',
    summary: (output) => {
      if (!output) return null
      if ('error' in output) return 'failed'
      return `${output.count} ${output.count === 1 ? 'place' : 'places'}`
    },
  },
}

export const placesDetailsDefinition: ToolDefinition<{ place_id: string }, PlaceDetailsOutput> = {
  name: 'places_details',
  description:
    'Get full details for a specific place — opening hours, reviews, editorial summary, full address. ' +
    'Requires a place_id from `places_search`. Use sparingly; `places_search` already returns most fields.',
  inputSchema: z.object({
    place_id: z.string().describe('Google Place ID (from places_search results)'),
  }),
  outputSchema: PlaceDetailsOutput,
  isAvailable: (ctx) => !!getPlacesEnv(ctx).GOOGLE_PLACES_API_KEY,
  execute: async (args, ctx) => {
    const apiKey = getPlacesEnv(ctx).GOOGLE_PLACES_API_KEY!
    try {
      return await placeDetails(apiKey, args.place_id)
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  },
  render: { icon: Info, displayName: 'Place Details' },
}

export const placesDefinitions = [
  placesSearchDefinition,
  placesDetailsDefinition,
] as ToolDefinition<unknown, unknown>[]
