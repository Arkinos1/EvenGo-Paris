export function normalizeText(input: string): string {
    return input
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[’'`´-]/g, ' ')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

export function cleanDisplayName(value: string | undefined): string {
    if (typeof value !== 'string') return '';

    const trimmed = value.trim();
    const match = trimmed.match(/^(.*?)(?:\s*\((.*)\))?$/);
    if (!match || !match[1]) return trimmed;

    const base = (match[1] || '').trim();
    const extra = (match[2] || '').trim();
    if (!base) return trimmed;
    if (!extra) return base;

    const normalizedBase = normalizeText(base);
    const normalizedExtra = normalizeText(extra);
    if (normalizedBase && normalizedBase === normalizedExtra) return base;

    return trimmed;
}

export function sanitizeMessage(raw: string): string {
    const decoded = new DOMParser().parseFromString(raw, 'text/html').body.textContent || raw;
    return decoded
        .replace(/\s+/g, ' ')
        .replace(/\s+([.,;:!?])/g, '$1')
        .trim();
}

export function formatNavitiaTime(raw: string | undefined): string {
    if (!raw) return '';

    const rawText = String(raw);
    const timeMatch = rawText.match(/T(\d{2})(\d{2})/i);
    if (timeMatch) {
        return `${timeMatch[1]}h${timeMatch[2]}`;
    }

    const digits = rawText.replace(/\D/g, '');
    if (digits.length === 6) {
        return `${digits.slice(0, 2)}h${digits.slice(2, 4)}`;
    }

    if (digits.length >= 14) {
        return `${digits.slice(8, 10)}h${digits.slice(10, 12)}`;
    }

    if (digits.length >= 4) {
        return `${digits.slice(0, 2)}h${digits.slice(2, 4)}`;
    }

    return String(raw);
}

export function formatLineLabel(info: any): string {
    const network = typeof info?.network === 'string' ? info.network.trim() : '';
    const code = typeof info?.code === 'string' ? info.code.trim() : '';
    const label = `${network} ${code}`.trim();
    if (label) return label;
    if (typeof info?.name === 'string' && info.name.trim().length > 0) return info.name.trim();
    return 'Ligne';
}

export function getSectionDirection(section: any): string {
    const info = section?.display_informations || {};
    return cleanDisplayName(
        typeof info?.direction === 'string' && info.direction.trim().length > 0
            ? info.direction
            : typeof info?.headsign === 'string' && info.headsign.trim().length > 0
                ? info.headsign
                : typeof section?.to?.name === 'string'
                    ? section.to.name
                    : ''
    );
}

function normalizeLineCodeForLogo(code: string): string {
    const compact = code.replace(/\s+/g, '').trim();
    const lowered = normalizeText(compact);
    if (lowered === '3bis') return '3bis';
    if (lowered === '7bis') return '7bis';
    const metroMatch = compact.match(/^m\s*0*([0-9]+)$/i);
    if (metroMatch?.[1]) return metroMatch[1];
    return compact;
}

export function getTransportLogoPath(section: any): string | null {
    const info = section?.display_informations || {};
    const codeRaw = typeof info?.code === 'string' ? info.code.trim() : '';
    if (!codeRaw) return null;

    const hints = normalizeText([
        info?.commercial_mode,
        info?.physical_mode,
        info?.network,
        info?.name,
        info?.label,
    ]
        .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
        .join(' '));

    if (hints.includes('rer')) {
        return `/logo/RER_${codeRaw.toUpperCase()}.svg`;
    }

    const isMetroLine = hints.includes('metro') || (hints.includes('ratp') && (/^\d+$/.test(codeRaw) || /^(3bis|7bis)$/i.test(codeRaw)));

    if (isMetroLine) {
        const code = normalizeLineCodeForLogo(codeRaw);
        return `/logo/Métro_${code}.svg`;
    }

    if (hints.includes('tram')) {
        const normalized = normalizeText(codeRaw);
        const code = normalized.startsWith('t') ? normalized.slice(1) : normalized;
        return `/logo/Tram_${code}.svg`;
    }

    if (hints.includes('transilien') || hints.includes('train') || hints.includes('sncf')) {
        return `/logo/Train_${codeRaw.toUpperCase()}.svg`;
    }

    if (hints.includes('cable')) {
        return `/logo/Câble_${codeRaw}.svg`;
    }

    return null;
}

export function formatFullStationList(section: any): string {
    const stopDateTimes = Array.isArray(section?.stop_date_times) ? section.stop_date_times : [];
    const stationNames = stopDateTimes
        .map((stopDateTime: any) => stopDateTime?.stop_point?.name)
        .filter((name: unknown): name is string => typeof name === 'string' && name.trim().length > 0);

    return stationNames.map((name: string) => `- ${name}`).join('\n');
}
