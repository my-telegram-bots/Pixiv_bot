import test from 'ava'
import { renderUserFacingError } from '../handlers/telegram/user-facing-error.js'

test('user-facing errors preserve a specific safe reason and code', t => {
    const error = new Error('Refreshed illustration does not match lifecycle 148841251')
    error.code = 'ILLUSTRATION_REFRESH_ID_MISMATCH'

    const message = renderUserFacingError('zh-hans', error)

    t.regex(message, /刷新图片链接/)
    t.true(message.includes('ILLUSTRATION\\_REFRESH\\_ID\\_MISMATCH'))
    t.notRegex(message, /UNEXPECTED_PROCESSING_FAILURE/)
})

test('uncoded errors preserve their sanitized reason and use the fallback code', t => {
    const message = renderUserFacingError(
        'en',
        new Error('download failed at https://secret.example/path?token=value')
    )

    t.true(message.includes('download failed at \\[URL\\]'))
    t.true(message.includes('UNEXPECTED\\_PROCESSING\\_FAILURE'))
    t.notRegex(message, /secret\.example/)
})
