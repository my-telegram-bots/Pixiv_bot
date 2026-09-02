import test from 'ava'
import { format_v3 } from '../handlers/telegram/format.js'

function settings(overrides = {}) {
    return {
        setting: { format: {} },
        tags: true,
        description: true,
        show_id: false,
        ...overrides
    }
}

const illust = {
    id: 123,
    title: 'title * [raw]',
    author_id: 456,
    author_name: 'author _raw_',
    description: 'first<br />second <tag>',
    tags: ['one', 'two_words'],
    x_restrict: 1,
    ai_type: 2,
    imgs_: { size: [{}, {}] }
}

test('format_v3 renders Rich Markdown directly from raw caption data', t => {
    const result = format_v3(illust, settings(), 'inline', -1, undefined, 'rich_markdown')
    t.true(result.includes('#NSFW #AI'))
    t.true(result.includes('[title \\* \\[raw\\]](https://www.pixiv.net/artworks/123)'))
    t.true(result.includes('[author \\_raw\\_](https://www.pixiv.net/users/456)'))
    t.true(result.includes('#one #two\\_words'))
    t.true(result.includes('> second'))
    t.false(result.includes('www\\.pixiv'))
})

test('format_v3 keeps MarkdownV2 as an explicit target and does not enable a stored v3', t => {
    const result = format_v3(illust, settings(), 'inline', 0, undefined, 'markdown_v2')
    t.true(result.includes('www\\.pixiv\\.net'))
    t.throws(
        () => format_v3(illust, settings(), 'inline', 0, undefined, 'stored_v3'),
        { message: /Unsupported format_v3 target/ }
    )
})
