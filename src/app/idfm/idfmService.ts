import type { Language, PlaceSuggestion, RouteData } from '../types';
import {
    cleanDisplayName,
    formatFullStationList,
    formatLineLabel,
    formatNavitiaTime,
    getSectionDirection,
    getTransportLogoPath,
    sanitizeMessage
} from './idfmCommon';
import { buildSearchQueries, placeToNavitiaLocation, scorePlaceMatch } from './idfmPlaceSearch';
import { IdfmNextDepartures } from './idfmNextDepartures';
import { t } from '../i18n';
import {
    IDFM_API_STATUS_CACHE_KEY,
    IDFM_API_STATUS_ERROR_TTL_MS,
    IDFM_API_STATUS_OK_TTL_MS,
    IDFM_API_STATUS_UNAUTHORIZED_TTL_MS
} from '../constants';

type ApiConnectionStatus = 'ok' | 'unauthorized' | 'error';

interface ApiStatusCacheEntry {
    status: ApiConnectionStatus;
    timestamp: number;
}

interface BanFeatureProperties {
    label?: string;
    name?: string;
    city?: string;
    postcode?: string;
}

interface BanFeatureGeometry {
    coordinates?: [number, number];
}

interface BanFeature {
    properties?: BanFeatureProperties;
    geometry?: BanFeatureGeometry;
}

interface BanSearchResponse {
    features?: BanFeature[];
}

export class IdfmService {
    private readonly apiKey: string;
    private readonly language: Language;
    private readonly baseUrl = 'https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia';
    private readonly nextDeparturesService: IdfmNextDepartures;

    constructor(apiKey: string, language: Language) {
        this.apiKey = apiKey;
        this.language = language;
        this.nextDeparturesService = new IdfmNextDepartures(apiKey, this.baseUrl, language);
    }

    private getStatusTtl(status: ApiConnectionStatus): number {
        if (status === 'ok') return IDFM_API_STATUS_OK_TTL_MS;
        if (status === 'unauthorized') return IDFM_API_STATUS_UNAUTHORIZED_TTL_MS;
        return IDFM_API_STATUS_ERROR_TTL_MS;
    }

    private readCachedStatus(): ApiConnectionStatus | null {
        try {
            const raw = localStorage.getItem(IDFM_API_STATUS_CACHE_KEY);
            if (!raw) return null;

            const parsed = JSON.parse(raw) as ApiStatusCacheEntry;
            if (!parsed || typeof parsed.timestamp !== 'number') return null;
            if (parsed.status !== 'ok' && parsed.status !== 'unauthorized' && parsed.status !== 'error') return null;

            const ttl = this.getStatusTtl(parsed.status);
            if (Date.now() - parsed.timestamp > ttl) return null;
            return parsed.status;
        } catch {
            return null;
        }
    }

    private writeCachedStatus(status: ApiConnectionStatus): void {
        try {
            const payload: ApiStatusCacheEntry = { status, timestamp: Date.now() };
            localStorage.setItem(IDFM_API_STATUS_CACHE_KEY, JSON.stringify(payload));
        } catch {
            // Ignore storage errors (private mode, storage disabled, quota exceeded).
        }
    }

    private statusFromHttpCode(status: number): ApiConnectionStatus {
        if (status === 401 || status === 403) return 'unauthorized';
        if (status >= 200 && status < 300) return 'ok';
        return 'error';
    }

    private async fetchSearchResults(endpoint: 'places' | 'pt_objects', currentQuery: string): Promise<any[]> {
        if (!this.apiKey || this.apiKey.trim().length === 0) return [];

        const queryParams = endpoint === 'pt_objects'
            ? `q=${encodeURIComponent(currentQuery)}&count=20&type[]=stop_area&type[]=stop_point&type[]=address&type[]=poi&depth=1`
            : `q=${encodeURIComponent(currentQuery)}&count=20&depth=1`;
        const url = `${this.baseUrl}/${endpoint}?${queryParams}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'apikey': this.apiKey }
        });

        this.writeCachedStatus(this.statusFromHttpCode(response.status));

        if (!response.ok) return [];

        const data = await response.json();
        const results = data?.places || data?.pt_objects || data?.objects || [];
        return Array.isArray(results) ? results : [];
    }

    private async fetchBanAddressSuggestions(query: string, maxResults = 8): Promise<PlaceSuggestion[]> {
        const trimmed = query.trim();
        if (trimmed.length < 2) return [];

        try {
            const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(trimmed)}&limit=${Math.max(1, maxResults)}&autocomplete=1`;
            const response = await fetch(url, { method: 'GET' });
            if (!response.ok) return [];

            const data = await response.json() as BanSearchResponse;
            const features = Array.isArray(data?.features) ? data.features : [];

            return features
                .map((feature) => {
                    const coordinates = feature?.geometry?.coordinates;
                    const lon = coordinates?.[0];
                    const lat = coordinates?.[1];
                    const label =
                        (feature?.properties?.label && feature.properties.label.trim().length > 0 ? feature.properties.label.trim() : '') ||
                        [
                            feature?.properties?.name,
                            feature?.properties?.postcode,
                            feature?.properties?.city,
                        ].filter(Boolean).join(' ')
                            .trim();

                    if (!label || typeof lon !== 'number' || typeof lat !== 'number') return null;

                    return {
                        label,
                        location: `${lon};${lat}`,
                    };
                })
                .filter((item): item is PlaceSuggestion => item !== null);
        } catch {
            return [];
        }
    }

    private getPlaceLabel(place: any): string {
        const candidate =
            (typeof place?.label === 'string' && place.label.trim().length > 0 ? place.label.trim() : '') ||
            (typeof place?.name === 'string' && place.name.trim().length > 0 ? place.name.trim() : '') ||
            '';
        return candidate.length > 0 ? candidate : 'Lieu sans nom';
    }

    private async rankPlaces(query: string): Promise<Array<{ place: any; score: number; location: string }>> {
        const queryVariants = buildSearchQueries(query);
        const rankedCandidates = new Map<string, { place: any; score: number }>();

        for (const variant of queryVariants) {
            const currentQuery = variant.text;
            for (const endpoint of ['places', 'pt_objects'] as const) {
                const candidates = await this.fetchSearchResults(endpoint, currentQuery);
                for (const candidate of candidates) {
                    const location = placeToNavitiaLocation(candidate);
                    if (!location) continue;

                    const exactScore = scorePlaceMatch(query, candidate);
                    const variantScore = scorePlaceMatch(currentQuery, candidate) * variant.weight;
                    const score = Math.max(exactScore, variantScore);
                    const existing = rankedCandidates.get(location);

                    if (!existing || score > existing.score) {
                        rankedCandidates.set(location, { place: candidate, score });
                    }
                }
            }
        }

        return Array.from(rankedCandidates.entries())
            .map(([location, value]) => ({
                place: value.place,
                score: value.score,
                location
            }))
            .sort((a, b) => b.score - a.score);
    }

    async searchPlace(query: string): Promise<string | null> {
        try {
            const best = (await this.rankPlaces(query))[0];
            if (best?.location) return best.location;

            const banFallback = await this.fetchBanAddressSuggestions(query, 1);
            if (banFallback[0]?.location) return banFallback[0].location;

            return null;
        } catch {
            return null;
        }
    }

    async searchPlaceSuggestions(query: string, maxResults = 7): Promise<PlaceSuggestion[]> {
        if (!query || query.trim().length < 2) return [];

        try {
            const [banSuggestions, ranked] = await Promise.all([
                this.fetchBanAddressSuggestions(query, Math.max(1, maxResults)),
                this.rankPlaces(query),
            ]);

            const navitiaSuggestions = ranked
                .slice(0, Math.max(1, maxResults))
                .map((item) => ({
                    label: this.getPlaceLabel(item.place),
                    location: item.location,
                }));

            const merged = [...banSuggestions, ...navitiaSuggestions];
            const deduped = new Map<string, PlaceSuggestion>();
            for (const suggestion of merged) {
                const key = `${suggestion.location}|${suggestion.label.toLowerCase()}`;
                if (!deduped.has(key)) {
                    deduped.set(key, suggestion);
                }
            }

            return Array.from(deduped.values()).slice(0, Math.max(1, maxResults));
        } catch {
            return [];
        }
    }

    async checkApiStatus(): Promise<ApiConnectionStatus> {
        if (!this.apiKey || this.apiKey.trim().length === 0) {
            this.writeCachedStatus('unauthorized');
            return 'unauthorized';
        }

        const cached = this.readCachedStatus();
        if (cached) {
            return cached;
        }

        try {
            // Use a simple search query to verify API status instead of _geo_status endpoint
            // which may not be available or accessible. Query for a common station.
            const url = `${this.baseUrl}/places?q=paris&count=1&depth=1`;
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'apikey': this.apiKey }
            });

            console.debug(`[IDFM API Check] Status: ${response.status}, URL: ${url}`);

            const status = this.statusFromHttpCode(response.status);
            this.writeCachedStatus(status);
            if (status === 'unauthorized') {
                console.warn(`[IDFM API Check] Unauthorized (${response.status})`);
            } else if (status === 'error') {
                console.warn(`[IDFM API Check] Error status: ${response.status}`);
            }
            return status;
        } catch (err) {
            console.error(`[IDFM API Check] Network error:`, err);
            this.writeCachedStatus('error');
            return 'error';
        }
    }

    async getJourney(fromCoords: string, toCoords: string): Promise<RouteData | null> {
        const journeys = await this.getJourneyOptions(fromCoords, toCoords, 1);
        return journeys[0] ?? null;
    }

    private async parseJourneyResponse(journey: any, allDisruptions: any[]): Promise<RouteData> {
        const heureDepart = formatNavitiaTime(journey.departure_date_time);
        const heureArrivee = formatNavitiaTime(journey.arrival_date_time);

        const shortSteps: string[] = [];
        const detailedSteps: string[] = [];
        const stepLogos: Array<string | null> = [];
        const usedLinesById = new Map<string, string>();
        const transportLabels: string[] = [];
        let totalWalkMin = 0;

        for (const section of journey.sections || []) {
            if (section.type === 'public_transport') {
                const info = section.display_informations;
                const logoPath = getTransportLogoPath(section);
                const lineLabel = formatLineLabel(info);
                const sectionDepartureTime = formatNavitiaTime(section.departure_date_time);
                const sectionArrivalTime = formatNavitiaTime(section.arrival_date_time);
                const fullStationList = formatFullStationList(section);
                const sectionDirection = getSectionDirection(section);
                const shouldFetchNextDepartures = shortSteps.length === 0;
                const nextDepartures = shouldFetchNextDepartures
                    ? await Promise.race<string>([
                        this.nextDeparturesService.getNextDepartures(
                            section,
                            section.departure_date_time,
                            section.links?.find((l: any) => l.type === 'line')?.id,
                            sectionDirection
                        ),
                        new Promise<string>((resolve) => {
                            setTimeout(() => resolve(''), 2500);
                        })
                    ])
                    : '';
                const stopCount = Array.isArray(section.stop_date_times) ? Math.max(0, section.stop_date_times.length - 1) : 0;
                shortSteps.push(`${sectionDepartureTime ? `${sectionDepartureTime} ` : ''}${lineLabel}${stopCount > 0 ? ` · ${stopCount} ${t(this.language, 'stops')}` : ''}`.trim());
                if (section.links) {
                    const lineLink = section.links.find((l: any) => l.type === 'line');
                    if (lineLink?.id) usedLinesById.set(lineLink.id, lineLabel);
                }
                detailedSteps.push([
                    `${sectionDepartureTime ? `${sectionDepartureTime} ` : ''}${t(this.language, 'line')} ${lineLabel}`,
                    sectionArrivalTime ? `${t(this.language, 'arrivedAt')} : ${sectionArrivalTime}` : null,
                    info.network ? `${t(this.language, 'network')} : ${info.network}` : null,
                    sectionDirection ? `${t(this.language, 'direction')} : ${sectionDirection.substring(0, 40)}` : null,
                    '',
                    `${t(this.language, 'departureLabel')} : ${cleanDisplayName(section.from.name)}${sectionDepartureTime ? ` (${sectionDepartureTime})` : ''}`,
                    nextDepartures ? `${t(this.language, 'nextDepartures')} :\n${nextDepartures}` : null,
                    '',
                    fullStationList ? `${t(this.language, 'stations')} :\n${fullStationList}` : null,
                    '',
                    `${t(this.language, 'getOff')} : ${cleanDisplayName(section.to.name)}`
                ].filter((item) => item !== null).join('\n'));
                stepLogos.push(logoPath);
            } else if (section.type === 'street_network' || section.type === 'transfer') {
                const walkMin = Math.round(section.duration / 60);
                if (walkMin > 0) {
                    totalWalkMin += walkMin;
                    shortSteps.push(`${t(this.language, 'walk')} (${walkMin} ${t(this.language, 'min')})`);
                    detailedSteps.push(`${t(this.language, 'walk')}\n${t(this.language, 'towards')} : ${section.to.name}`);
                    stepLogos.push(null);
                }
            }
        }

        const relevantDisruptions: string[] = [];
        if (allDisruptions) {
            const disruptionsByLine = new Map<string, Set<string>>();

            for (const disruption of allDisruptions) {
                const impactedLineLabels = new Set<string>();

                for (const obj of disruption.impacted_objects || []) {
                    const lineId = obj?.pt_object?.id;
                    const lineLabel = typeof lineId === 'string' ? usedLinesById.get(lineId) : undefined;
                    if (lineLabel) impactedLineLabels.add(lineLabel);
                }

                if (impactedLineLabels.size > 0 && disruption.messages) {
                    const msg = disruption.messages.find((m: any) => m.channel === 'web' || m.channel === 'mobile')?.text || disruption.messages[0]?.text;
                    if (!msg) continue;

                    const cleanMessage = sanitizeMessage(msg);
                    for (const lineLabel of impactedLineLabels) {
                        if (!disruptionsByLine.has(lineLabel)) {
                            disruptionsByLine.set(lineLabel, new Set<string>());
                        }
                        disruptionsByLine.get(lineLabel)!.add(cleanMessage);
                    }
                }
            }

            for (const [lineLabel, messages] of disruptionsByLine.entries()) {
                relevantDisruptions.push([
                    `${lineLabel}`,
                    ...Array.from(messages).map((message) => `• ${message}`)
                ].join('\n'));
            }
        }

        const durationMin = Math.round((journey.duration || 0) / 60);
        const summary = `${t(this.language, 'routeFound')}\n${heureDepart} -> ${heureArrivee}\n${durationMin} ${t(this.language, 'min')} • ${relevantDisruptions.length > 0 ? t(this.language, 'trafficInfo') : t(this.language, 'trafficSmooth')}`;

        shortSteps.push(t(this.language, 'arrived'));
        detailedSteps.push(t(this.language, 'arrived'));
        stepLogos.push(null);

        for (const label of usedLinesById.values()) {
            if (!transportLabels.includes(label)) {
                transportLabels.push(label);
            }
        }

        return {
            summary,
            departureTime: heureDepart,
            arrivalTime: heureArrivee,
            durationMin,
            transportLabels,
            walkMin: totalWalkMin,
            shortSteps,
            detailedSteps,
            relevantDisruptions,
            stepLogos,
        };
    }

    async getJourneyOptions(fromCoords: string, toCoords: string, maxJourneys = 3): Promise<RouteData[]> {
        if (!this.apiKey || this.apiKey.trim().length === 0) return [];

        try {
            const url = `${this.baseUrl}/journeys?from=${encodeURIComponent(fromCoords)}&to=${encodeURIComponent(toCoords)}&max_nb_journeys=${Math.max(1, maxJourneys)}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'apikey': this.apiKey }
            });

            this.writeCachedStatus(this.statusFromHttpCode(response.status));

            if (!response.ok) return [];
            const data = await response.json();

            if (!Array.isArray(data.journeys) || data.journeys.length === 0) return [];

            const results: RouteData[] = [];
            for (const journey of data.journeys.slice(0, Math.max(1, maxJourneys))) {
                const parsed = await this.parseJourneyResponse(journey, data.disruptions || []);
                results.push(parsed);
            }

            return results;
        } catch {
            return [];
        }
    }
}
