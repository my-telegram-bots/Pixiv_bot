import { _l } from '#handlers/telegram/i18n'

const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,63}$/
const MAX_REASON_LENGTH = 300

function sanitizeReason(value) {
    const reason = String(value || '')
        .replace(/https?:\/\/\S+/gi, '[URL]')
        .replace(/bot\d+:[A-Za-z0-9_-]+/g, '[BOT_TOKEN]')
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    return reason.slice(0, MAX_REASON_LENGTH)
}

function errorCode(error) {
    const candidates = [error?.code, error?.cause?.code]
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && SAFE_CODE.test(candidate)) return candidate
    }
    if (Number.isInteger(error?.error_code)) return `TELEGRAM_API_${error.error_code}`
    return 'UNEXPECTED_PROCESSING_FAILURE'
}

function errorReason(error, code) {
    const candidates = [error?.description, error?.message, error?.cause?.message]
    for (const candidate of candidates) {
        const reason = sanitizeReason(candidate)
        if (reason) return reason
    }
    return code
}

export function renderUserFacingError(language, error) {
    const code = errorCode(error)
    if (code === 'ILLUSTRATION_REFRESH_ID_MISMATCH') {
        return _l(language, 'illustration_refresh_id_mismatch')
    }
    return _l(language, 'request_processing_failed', errorReason(error, code), code)
}
