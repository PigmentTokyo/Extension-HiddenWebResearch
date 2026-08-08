export const RESULT_INJECTION_POSITIONS = Object.freeze([
    'chat',
    'before_prompt',
    'after_prompt',
    'variable',
]);

export const RESULT_INJECTION_ROLES = Object.freeze([
    'system',
    'user',
    'assistant',
]);

export const RESULT_VARIABLE_SCOPES = Object.freeze([
    'local',
    'global',
]);

export const DEFAULT_RESULT_VARIABLE_NAME = 'p1g_search_result';
const RESERVED_RESULT_VARIABLE_NAMES = new Set(['__proto__', 'prototype', 'constructor']);

export function neutralizeSillyTavernMacros(value) {
    return String(value ?? '')
        .replaceAll('{{', '｛｛')
        .replaceAll('}}', '｝｝');
}

export function normalizeResultInjectionPosition(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return RESULT_INJECTION_POSITIONS.includes(normalized) ? normalized : 'chat';
}

export function normalizeResultInjectionRole(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return RESULT_INJECTION_ROLES.includes(normalized) ? normalized : 'user';
}

export function normalizeResultInjectionDepth(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
}

export function normalizeResultVariableScope(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return RESULT_VARIABLE_SCOPES.includes(normalized) ? normalized : 'local';
}

export function isValidResultVariableName(value) {
    const normalized = String(value || '').normalize('NFKC').trim();
    return Boolean(
        normalized
        && normalized.length <= 64
        && !/[{}:\s]/u.test(normalized)
        && !RESERVED_RESULT_VARIABLE_NAMES.has(normalized.toLowerCase()),
    );
}

export function normalizeResultVariableName(value) {
    const normalized = String(value || '').normalize('NFKC').trim();
    return isValidResultVariableName(normalized) ? normalized : DEFAULT_RESULT_VARIABLE_NAME;
}

function visitStrings(value, visitor, seen = new WeakSet()) {
    if (typeof value === 'string') return visitor(value);
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return value;
    seen.add(value);

    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index++) {
            value[index] = visitStrings(value[index], visitor, seen);
        }
        return value;
    }

    for (const key of Object.keys(value)) {
        value[key] = visitStrings(value[key], visitor, seen);
    }
    return value;
}

function countMarkerOccurrences(value, marker, seen = new WeakSet()) {
    if (!marker) return 0;
    if (typeof value === 'string') return value.split(marker).length - 1;
    if (!value || typeof value !== 'object') return 0;
    if (seen.has(value)) return 0;
    seen.add(value);
    const children = Array.isArray(value) ? value : Object.values(value);
    return children.reduce(
        (total, child) => total + countMarkerOccurrences(child, marker, seen),
        0,
    );
}

function replaceWrappedBlocks(text, startMarker, endMarker, replacement) {
    if (!startMarker || !endMarker) return { text, count: 0 };
    let nextText = text;
    let count = 0;
    let cursor = 0;
    while (cursor < nextText.length) {
        const start = nextText.indexOf(startMarker, cursor);
        if (start < 0) break;
        const end = nextText.indexOf(endMarker, start + startMarker.length);
        if (end < 0) break;
        const after = end + endMarker.length;
        nextText = `${nextText.slice(0, start)}${replacement()}${nextText.slice(after)}`;
        count++;
        cursor = start;
    }
    return { text: nextText, count };
}

function countWrappedBlocks(value, startMarker, endMarker, seen = new WeakSet()) {
    if (typeof value === 'string') {
        return replaceWrappedBlocks(value, startMarker, endMarker, () => '').count;
    }
    if (!value || typeof value !== 'object') return 0;
    if (seen.has(value)) return 0;
    seen.add(value);
    const children = Array.isArray(value) ? value : Object.values(value);
    return children.reduce(
        (total, child) => total + countWrappedBlocks(child, startMarker, endMarker, seen),
        0,
    );
}

function getMessageContentText(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.map(part => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        if (typeof part?.content === 'string') return part.content;
        return '';
    }).join('\n');
}

function hasNonTextMessageContent(content) {
    if (!Array.isArray(content)) return false;
    return content.some(part => {
        if (typeof part === 'string') return false;
        if (!part || typeof part !== 'object') return Boolean(part);
        const type = String(part.type || '').trim().toLowerCase();
        if (type && type !== 'text') return true;
        return typeof part.text !== 'string' && typeof part.content !== 'string';
    });
}

/**
 * Replaces an opaque SillyTavern variable marker only after the final request
 * has been assembled. Search evidence therefore never becomes the persisted
 * value of the selected local/global variable.
 */
export function replaceEphemeralResultMarkers(payload, {
    slotMarker,
    fallbackStartMarker,
    fallbackEndMarker,
    packet,
}) {
    const slotOccurrences = countMarkerOccurrences(payload, slotMarker);
    const fallbackOccurrences = countWrappedBlocks(payload, fallbackStartMarker, fallbackEndMarker);
    const hasBudgetedFallback = fallbackOccurrences > 0;
    const useVariableSlot = slotOccurrences > 0 && hasBudgetedFallback;
    const removableMessages = new Set();
    let remainingSlotOccurrences = slotOccurrences;

    if ((slotOccurrences > 0 || fallbackOccurrences > 0) && Array.isArray(payload?.messages)) {
        for (const message of payload.messages) {
            const content = getMessageContentText(message?.content);
            const withoutFallback = replaceWrappedBlocks(
                content,
                fallbackStartMarker,
                fallbackEndMarker,
                () => '',
            ).text;
            if (
                (content.includes(slotMarker)
                    || (useVariableSlot && content.includes(fallbackStartMarker)))
                && !withoutFallback.replaceAll(slotMarker, '').trim()
                && !message?.tool_calls
                && !hasNonTextMessageContent(message?.content)
            ) {
                removableMessages.add(message);
            }
        }
    }

    visitStrings(payload, text => {
        const withSlot = text.replaceAll(slotMarker, () => {
            remainingSlotOccurrences--;
            if (!hasBudgetedFallback) return '';
            // A preset may accidentally expand the same variable more than
            // once. Keep only its last position so evidence is never duplicated.
            return remainingSlotOccurrences === 0 ? packet : '';
        });
        return replaceWrappedBlocks(
            withSlot,
            fallbackStartMarker,
            fallbackEndMarker,
            () => useVariableSlot ? '' : packet,
        ).text;
    });

    if (removableMessages.size && Array.isArray(payload?.messages)) {
        payload.messages = payload.messages.filter(message => (
            !removableMessages.has(message)
            || Boolean(getMessageContentText(message?.content).trim())
            || hasNonTextMessageContent(message?.content)
        ));
    }

    return {
        slotOccurrences,
        fallbackOccurrences,
        usedVariableSlot: useVariableSlot,
        usedFallback: !useVariableSlot && hasBudgetedFallback,
        replaced: hasBudgetedFallback,
    };
}
