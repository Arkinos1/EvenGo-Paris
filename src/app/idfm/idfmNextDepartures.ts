import { cleanDisplayName, formatNavitiaTime, normalizeText } from './idfmCommon';
import { t } from '../i18n';
import type { Language } from '../types';

export class IdfmNextDepartures {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly language: Language;
    private readonly vehicleJourneyStopsCache = new Map<string, any[]>();

    constructor(apiKey: string, baseUrl: string, language: Language) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.language = language;
    }

    private getSectionDeparturesUri(section: any): string | null {
        if (section?.from?.stop_area?.id) return `stop_areas/${section.from.stop_area.id}`;
        if (section?.from?.stop_point?.id) return `stop_points/${section.from.stop_point.id}`;
        if (section?.from?.id) return `places/${section.from.id}`;
        return null;
    }

    private formatDepartureLabel(candidate: any): string {
        const info = candidate?.display_informations || candidate?.route?.display_informations || {};
        const route = candidate?.route || {};
        const stopDateTime = candidate?.stop_date_time || {};
        const label = typeof info?.label === 'string' && info.label.trim().length > 0 ? info.label.trim() : '';
        const serviceName = typeof info?.name === 'string' && info.name.trim().length > 0 ? info.name.trim() : '';
        const routeName = typeof route?.name === 'string' && route.name.trim().length > 0 ? route.name.trim() : '';
        const routeShortName = typeof route?.short_name === 'string' && route.short_name.trim().length > 0 ? route.short_name.trim() : '';
        const tripShortName = typeof stopDateTime?.trip_short_name === 'string' && stopDateTime.trip_short_name.trim().length > 0 ? stopDateTime.trip_short_name.trim() : '';
        const vehicleJourneyName = typeof stopDateTime?.vehicle_journey_name === 'string' && stopDateTime.vehicle_journey_name.trim().length > 0 ? stopDateTime.vehicle_journey_name.trim() : '';
        const trainName = typeof stopDateTime?.train_name === 'string' && stopDateTime.train_name.trim().length > 0 ? stopDateTime.train_name.trim() : '';
        const headsign = typeof info?.headsign === 'string' && info.headsign.trim().length > 0 ? info.headsign.trim() : '';
        const direction = typeof info?.direction === 'string' && info.direction.trim().length > 0 ? info.direction.trim() : '';
        const code = typeof info?.code === 'string' && info.code.trim().length > 0 ? info.code.trim() : '';
        const network = typeof info?.network === 'string' && info.network.trim().length > 0 ? info.network.trim() : '';

        if (label) return label;
        if (serviceName) return serviceName;
        if (routeName) return routeName;
        if (routeShortName) return routeShortName;
        if (tripShortName) return tripShortName;
        if (vehicleJourneyName) return vehicleJourneyName;
        if (trainName) return trainName;
        if (headsign) return headsign;
        if (direction) return direction;
        if (code && network) return `${network} ${code}`;
        if (code) return code;
        if (network) return network;
        return t(this.language, 'trainFallback');
    }

    private extractDepartureTime(candidate: any): string {
        return formatNavitiaTime(
            candidate?.stop_date_time?.departure_date_time ||
            candidate?.departure_date_time ||
            candidate?.date_time ||
            candidate?.stop_date_time?.base_departure_date_time
        );
    }

    private extractDirection(candidate: any): string {
        return cleanDisplayName(
            candidate?.display_informations?.direction ||
            candidate?.route?.display_informations?.direction ||
            candidate?.display_informations?.headsign ||
            candidate?.route?.display_informations?.headsign ||
            candidate?.destination?.name ||
            candidate?.stop_date_time?.destination?.name ||
            candidate?.stop_date_time?.destination ||
            ''
        );
    }

    private extractDepartureCandidates(data: any): any[] {
        const departures = Array.isArray(data?.departures) ? data.departures : [];
        const nextDepartures = Array.isArray(data?.next_departures) ? data.next_departures : [];
        const stopSchedules = Array.isArray(data?.stop_schedules) ? data.stop_schedules : [];

        const fromSchedules = stopSchedules.flatMap((schedule: any) => {
            const dateTimes = Array.isArray(schedule?.date_times) ? schedule.date_times : [];
            return dateTimes.map((dateTime: any) => ({
                stop_date_time: dateTime,
                display_informations: schedule?.display_informations,
                route: schedule?.route,
                links: [
                    ...(Array.isArray(schedule?.links) ? schedule.links : []),
                    ...(Array.isArray(dateTime?.links) ? dateTime.links : [])
                ]
            }));
        });

        return [...departures, ...nextDepartures, ...fromSchedules];
    }

    private getVehicleJourneyId(candidate: any): string {
        const links = [
            ...(Array.isArray(candidate?.links) ? candidate.links : []),
            ...(Array.isArray(candidate?.stop_date_time?.links) ? candidate.stop_date_time.links : [])
        ];

        const vehicleJourneyLink = links.find((link: any) => link?.type === 'vehicle_journey' && typeof link?.id === 'string');
        if (vehicleJourneyLink?.id) return vehicleJourneyLink.id;

        const directVehicleJourneyId = candidate?.stop_date_time?.vehicle_journey || candidate?.vehicle_journey;
        return typeof directVehicleJourneyId === 'string' ? directVehicleJourneyId : '';
    }

    private async getVehicleJourneyStops(vehicleJourneyId: string): Promise<any[]> {
        if (!vehicleJourneyId) return [];
        if (this.vehicleJourneyStopsCache.has(vehicleJourneyId)) {
            return this.vehicleJourneyStopsCache.get(vehicleJourneyId) || [];
        }

        try {
            const url = `${this.baseUrl}/vehicle_journeys/${encodeURIComponent(vehicleJourneyId)}/stop_times?count=300`;
            const response = await fetch(url, { method: 'GET', headers: { 'apikey': this.apiKey } });
            if (!response.ok) {
                this.vehicleJourneyStopsCache.set(vehicleJourneyId, []);
                return [];
            }

            const data = await response.json();
            const stopTimes = Array.isArray(data?.stop_times) ? data.stop_times : [];
            this.vehicleJourneyStopsCache.set(vehicleJourneyId, stopTimes);
            return stopTimes;
        } catch {
            this.vehicleJourneyStopsCache.set(vehicleJourneyId, []);
            return [];
        }
    }

    private async candidateServesDestination(candidate: any, section: any): Promise<boolean> {
        const targetStopPointId = typeof section?.to?.stop_point?.id === 'string' ? section.to.stop_point.id : '';
        const targetStopAreaId = typeof section?.to?.stop_area?.id === 'string' ? section.to.stop_area.id : '';
        const targetName = cleanDisplayName(section?.to?.name || '');

        const vehicleJourneyId = this.getVehicleJourneyId(candidate);
        if (!vehicleJourneyId) return false;

        const stopTimes = await this.getVehicleJourneyStops(vehicleJourneyId);
        if (stopTimes.length === 0) return false;

        return stopTimes.some((stopTime: any) => {
            const stopPointId = stopTime?.stop_point?.id;
            const stopAreaId = stopTime?.stop_point?.stop_area?.id || stopTime?.stop_area?.id;
            const stopName = cleanDisplayName(stopTime?.stop_point?.name || stopTime?.stop_area?.name || '');

            if (targetStopPointId && stopPointId === targetStopPointId) return true;
            if (targetStopAreaId && stopAreaId === targetStopAreaId) return true;
            if (targetName && stopName && normalizeText(stopName) === normalizeText(targetName)) return true;
            return false;
        });
    }

    private matchesDepartureDirection(candidate: any, expectedDirection: string): boolean {
        if (!expectedDirection) return true;

        const direction = cleanDisplayName(
            candidate?.display_informations?.direction ||
            candidate?.route?.display_informations?.direction ||
            candidate?.display_informations?.headsign ||
            candidate?.route?.display_informations?.headsign ||
            candidate?.destination?.name ||
            candidate?.stop_date_time?.destination?.name ||
            candidate?.stop_date_time?.destination ||
            ''
        );

        if (!direction) return false;

        const normalizedExpected = normalizeText(expectedDirection);
        const normalizedDirection = normalizeText(direction);

        return normalizedDirection.includes(normalizedExpected) || normalizedExpected.includes(normalizedDirection);
    }

    async getNextDepartures(section: any, fromDateTime?: string, lineId?: string, expectedDirection?: string): Promise<string> {
        const departuresUri = this.getSectionDeparturesUri(section);
        if (!departuresUri) return '';

        const queryParts = new URLSearchParams();
        queryParts.set('count', '15');
        queryParts.set('items_per_schedule', '15');
        queryParts.set('data_freshness', 'realtime');
        if (fromDateTime) queryParts.set('from_datetime', fromDateTime);
        if (lineId) queryParts.set('filter', `line.id==${lineId}`);

        const tryFetch = async (useLineFilter: boolean): Promise<string> => {
            const params = new URLSearchParams(queryParts);
            if (!useLineFilter) params.delete('filter');
            const url = `${this.baseUrl}/${departuresUri}/departures?${params.toString()}`;
            const response = await fetch(url, { method: 'GET', headers: { 'apikey': this.apiKey } });
            if (!response.ok) return '';

            const data = await response.json();
            const candidates = this.extractDepartureCandidates(data);
            const directionFiltered = candidates.filter((candidate: any) => this.matchesDepartureDirection(candidate, expectedDirection || ''));
            const pool = directionFiltered.length > 0 ? directionFiltered : candidates;

            const matchingDestination: any[] = [];
            for (const candidate of pool) {
                if (await this.candidateServesDestination(candidate, section)) {
                    matchingDestination.push(candidate);
                }
                if (matchingDestination.length >= 6) break;
            }

            const usableCandidates = matchingDestination.length > 0 ? matchingDestination : pool;

            return usableCandidates
                .map((candidate: any) => {
                    const time = this.extractDepartureTime(candidate);
                    const label = this.formatDepartureLabel(candidate);
                    const direction = this.extractDirection(candidate);
                    const displayLabel = direction && label && direction !== label ? `${label} → ${direction}` : label;
                    return time ? `${time} ${displayLabel}` : '';
                })
                .filter((item: string) => item.length > 0)
                .slice(0, 3)
                .map((item) => `- ${item}`)
                .join('\n');
        };

        try {
            const filteredDepartures = lineId ? await tryFetch(true) : '';
            const departures = filteredDepartures.length > 0 ? filteredDepartures : await tryFetch(false);
            return departures;
        } catch {
            return '';
        }
    }
}
