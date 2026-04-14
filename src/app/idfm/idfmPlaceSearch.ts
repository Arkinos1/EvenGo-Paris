import { normalizeText } from './idfmCommon';

function extractPlaceName(place: any): string {
    return typeof place?.name === 'string' && place.name.trim().length > 0
        ? place.name.trim()
        : typeof place?.label === 'string' && place.label.trim().length > 0
            ? place.label.trim()
            : '';
}

function getPlaceTypeScore(place: any): number {
    const type = String(place?.embedded_type || place?.type || '').toLowerCase();
    if (type.includes('stop_area')) return 40;
    if (type.includes('stop_point')) return 35;
    if (type.includes('address')) return 30;
    if (type.includes('poi')) return 20;
    if (type.includes('administrative_region')) return 10;
    return 0;
}

function levenshteinDistance(left: string, right: string): number {
    if (left === right) return 0;
    if (!left.length) return right.length;
    if (!right.length) return left.length;

    const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

    for (let i = 1; i <= left.length; i++) {
        const currentRow = [i];
        for (let j = 1; j <= right.length; j++) {
            const insertion = (currentRow[j - 1] ?? 0) + 1;
            const deletion = (previousRow[j] ?? 0) + 1;
            const substitution = (previousRow[j - 1] ?? 0) + (left[i - 1] === right[j - 1] ? 0 : 1);
            currentRow.push(Math.min(insertion, deletion, substitution));
        }

        for (let j = 0; j < previousRow.length; j++) {
            previousRow[j] = currentRow[j] ?? 0;
        }
    }

    return previousRow[right.length] ?? 0;
}

function tokenOverlapScore(queryTokens: string[], candidateTokens: string[]): number {
    if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;

    const candidateSet = new Set(candidateTokens);
    const matched = queryTokens.filter((token) => candidateSet.has(token)).length;
    return (matched / queryTokens.length) * 100;
}

function sequenceScore(queryTokens: string[], candidateTokens: string[]): number {
    if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;

    let sequenceIndex = 0;
    for (const token of candidateTokens) {
        if (token === queryTokens[sequenceIndex]) {
            sequenceIndex++;
            if (sequenceIndex === queryTokens.length) break;
        }
    }

    return (sequenceIndex / queryTokens.length) * 60;
}

export function scorePlaceMatch(query: string, place: any): number {
    const normalizedQuery = normalizeText(query);
    const name = normalizeText(extractPlaceName(place));

    if (!name) return 0;
    if (name === normalizedQuery) return 120;
    if (name.startsWith(normalizedQuery)) return 90;
    if (name.includes(normalizedQuery)) return 70;

    const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const candidateTokens = name.split(/\s+/).filter(Boolean);
    const overlapScore = tokenOverlapScore(queryTokens, candidateTokens);
    const orderScore = sequenceScore(queryTokens, candidateTokens);
    const similarity = 1 - (levenshteinDistance(normalizedQuery, name) / Math.max(normalizedQuery.length, name.length));
    const similarityScore = Math.max(0, similarity) * 80;
    return overlapScore + orderScore + similarityScore + getPlaceTypeScore(place);
}

export function buildSearchQueries(query: string): Array<{ text: string; weight: number }> {
    const normalized = normalizeText(query);
    const stopWords = new Set(['gare', 'station', 'arret', 'arrêt', 'paris', 'de', 'du', 'des', 'la', 'le', 'les', 'metro', 'métro', 'rer', 'tram', 'bus', 'train']);
    const tokens = normalized.split(/\s+/).filter(Boolean);
    const meaningfulTokens = tokens.filter((token) => !stopWords.has(token));
    const variants = new Map<string, number>();

    const addVariant = (text: string, weight: number) => {
        const value = text.trim();
        if (!value) return;
        variants.set(value, Math.max(variants.get(value) || 0, weight));
    };

    addVariant(query.trim(), 1.2);
    addVariant(normalized, 1.0);

    if (meaningfulTokens.length > 0) {
        addVariant(meaningfulTokens.join(' '), 0.95);
        addVariant(`paris ${meaningfulTokens.join(' ')}`, 0.9);
        if (meaningfulTokens.length >= 2) {
            addVariant(meaningfulTokens.slice(0, 2).join(' '), 0.85);
        }
    }

    if (tokens.includes('gare')) {
        addVariant(tokens.filter((token) => token !== 'gare').join(' '), 0.8);
        addVariant(`paris ${tokens.filter((token) => token !== 'gare').join(' ')}`.trim(), 0.82);
    }

    if (tokens.length > 1) {
        addVariant(tokens.slice(0, 2).join(' '), 0.75);
        addVariant(tokens.slice(-2).join(' '), 0.75);
    }

    return Array.from(variants.entries()).map(([text, weight]) => ({ text, weight }));
}

export function placeToNavitiaLocation(place: any): string | null {
    const directCoord = place?.coord;
    const embeddedCoord =
        place?.stop_area?.coord ||
        place?.stop_point?.coord ||
        place?.address?.coord ||
        place?.poi?.coord ||
        place?.administrative_region?.coord;

    const coord = directCoord || embeddedCoord;
    if (coord?.lon && coord?.lat) {
        return `${coord.lon};${coord.lat}`;
    }

    if (typeof place?.id === 'string' && place.id.length > 0) {
        return place.id;
    }

    return null;
}
