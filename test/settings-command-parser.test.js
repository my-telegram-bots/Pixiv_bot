import test from 'ava'
import {
    SettingsCommand,
    classifySettingsCommand,
    hasNegativeDirective,
    hasPositiveDirective,
    parseSettingsInput
} from '../handlers/telegram/settings-command-parser.js'

test('settings command parser normalizes command whitespace and classifies command forms', t => {
    t.is(classifySettingsCommand(parseSettingsInput('/s')), SettingsCommand.EXPORT)
    t.is(classifySettingsCommand(parseSettingsInput('/s   reset')), SettingsCommand.RESET)
    t.is(classifySettingsCommand(parseSettingsInput('eyJmb28iOiJiYXIifQ==')), SettingsCommand.IMPORT)
    t.is(classifySettingsCommand(parseSettingsInput('/s +tags')), SettingsCommand.SAVE)
    t.is(
        classifySettingsCommand(parseSettingsInput('/s title=value'), { hasMetadata: true }),
        SettingsCommand.SAVE
    )
    t.is(classifySettingsCommand(parseSettingsInput('/s unchanged')), SettingsCommand.NONE)
})

test('settings command parser canonicalizes aliases in one pass', t => {
    const parsed = parseSettingsInput('/s +tag -desc +afi -kb +god')

    t.true(hasPositiveDirective(parsed, 'tags'))
    t.true(hasNegativeDirective(parsed, 'description'))
    t.true(hasPositiveDirective(parsed, 'append_file_immediate'))
    t.true(hasNegativeDirective(parsed, 'remove_keyboard'))
    t.true(hasPositiveDirective(parsed, 'god'))
    t.deepEqual(parsed.unknownDirectives, [])
})

test('settings command parser records both sides of conflicts for semantic resolution', t => {
    const parsed = parseSettingsInput('/s +tags -tag +kb -kb +rm -rm +overwrite -overwrite')

    for (const name of ['tags', 'remove_keyboard', 'rm', 'overwrite']) {
        t.true(hasPositiveDirective(parsed, name))
        t.true(hasNegativeDirective(parsed, name))
    }
})

test('unknown and embedded signs do not trigger a settings write', t => {
    const unknown = parseSettingsInput('/s +unknown contact=a-b@example.com')

    t.deepEqual(unknown.unknownDirectives, ['+unknown'])
    t.false(unknown.hasKnownDirectives)
    t.is(classifySettingsCommand(unknown), SettingsCommand.NONE)
    t.false(parseSettingsInput('/s text+tags').hasKnownDirectives)
})

test('punctuation terminates known, control, and unknown directives', t => {
    const parsed = parseSettingsInput('/s +tags, -overwrite; +god. +unknown!')

    t.true(hasPositiveDirective(parsed, 'tags'))
    t.true(hasNegativeDirective(parsed, 'overwrite'))
    t.true(hasPositiveDirective(parsed, 'god'))
    t.deepEqual(parsed.unknownDirectives, ['+unknown'])
})

test('settings command body is separated for Telegraph metadata parsing', t => {
    t.is(parseSettingsInput('/s +tags\ntitle=Example').body, '+tags\ntitle=Example')
    t.is(parseSettingsInput('title=Example').body, 'title=Example')
})

test('recognized Pixiv inputs accept registered flags without whitespace', t => {
    const cases = [
        'https://www.pixiv.net/en/artworks/131538411+file',
        'https://phixiv.net/artworks/131538411+file',
        '131538411+file',
        '#131538411+file'
    ]
    for (const input of cases) {
        t.true(hasPositiveDirective(parseSettingsInput(input), 'asfile'), input)
    }

    const combined = parseSettingsInput('pixiv.net/artworks/131538411+af+afi-tags')
    t.true(hasPositiveDirective(combined, 'append_file'))
    t.true(hasPositiveDirective(combined, 'append_file_immediate'))
    t.true(hasNegativeDirective(combined, 'tags'))
})

test('embedded signs and URL query values do not become suffix directives', t => {
    const rejected = [
        'text+file',
        'name+file@example.com',
        'https://example.com/artworks/131538411+file',
        'https://pixiv.net/artworks/131538411?redirect=+file',
        'https://pixiv.net/artworks/131538411+unknown+file'
    ]
    for (const input of rejected) {
        t.false(parseSettingsInput(input).hasKnownDirectives, input)
    }
})
