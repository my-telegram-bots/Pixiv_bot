import test from 'ava'
import {
    extractInputValues,
    extractPixivIds
} from '../handlers/telegram/input-parser.js'

const EMPTY_IDS = { illust: [], author: [], novel: [] }

const pixivMatchCases = [
    ['artwork URL', 'https://www.pixiv.net/artworks/12345678', { ...EMPTY_IDS, illust: [12345678] }],
    ['scheme-less localized URL', 'pixiv.net/en/artworks/23456789', { ...EMPTY_IDS, illust: [23456789] }],
    ['short artwork URL', 'http://pixiv.net/i/34567890', { ...EMPTY_IDS, illust: [34567890] }],
    ['legacy artwork URL', 'https://pixiv.net/member_illust.php?illust_id=45678901', { ...EMPTY_IDS, illust: [45678901] }],
    ['novel URL', 'https://pixiv.net/novel/show.php?id=56789012', { ...EMPTY_IDS, novel: [56789012] }],
    ['author URL', 'https://pixiv.net/users/67890123', { ...EMPTY_IDS, author: [67890123] }],
    ['Phixiv proxy URL', 'https://phixiv.net/artworks/78901234', { ...EMPTY_IDS, illust: [78901234] }],
    ['standalone ID', '#89012345', { ...EMPTY_IDS, illust: [89012345] }]
]

for (const [name, input, expected] of pixivMatchCases) {
    test(`Pixiv matcher handles ${name}`, t => {
        t.deepEqual(extractPixivIds(input), expected)
    })
}

test('Pixiv matcher preserves encounter order and repeated IDs within each type', t => {
    const input = [
        'https://pixiv.net/artworks/12345678',
        'https://pixiv.net/users/23456789',
        'https://pixiv.net/artworks/12345678',
        'https://pixiv.net/novel/show.php?id=34567890'
    ].join(' + ')

    t.deepEqual(extractPixivIds(input), {
        illust: [12345678, 12345678],
        author: [23456789],
        novel: [34567890]
    })
})

test('Pixiv matcher rejects foreign hosts, embedded hosts, and malformed IDs', t => {
    const input = [
        'https://example.com/artworks/12345678',
        'https://evilpixiv.net/artworks/23456789',
        'https://pixiv.net/artworks/not-a-number',
        'https://pixiv.net/member_illust.php',
        '0'
    ].join(' ')

    t.deepEqual(extractPixivIds(input), EMPTY_IDS)
})

test('Pixiv matcher scans adjacent links separated by setting markers', t => {
    t.deepEqual(
        extractPixivIds('look:https://pixiv.net/artworks/12345678+https://pixiv.net/users/23456789'),
        { illust: [12345678], author: [23456789], novel: [] }
    )
})

test('Pixiv matcher keeps the artwork identity before whitespace-free flags', t => {
    t.deepEqual(
        extractPixivIds('https://www.pixiv.net/en/artworks/131538411+file+afi'),
        { illust: [131538411], author: [], novel: [] }
    )
})

test('metadata extraction removes recognized lines and preserves aliases', t => {
    const values = extractInputValues('title=Example\nan=Artist\nau=https://example.com\nbody')

    t.is(values.title, 'Example')
    t.is(values.an, 'Artist')
    t.is(values.author_name, 'Artist')
    t.is(values.au, 'https://example.com')
    t.is(values.author_url, 'https://example.com')
    t.is(values.remainingText, 'body')
})

test('metadata lines cannot be interpreted as Pixiv candidates', t => {
    t.deepEqual(
        extractPixivIds('title=https://pixiv.net/artworks/12345678\nhttps://pixiv.net/artworks/23456789'),
        { illust: [23456789], author: [], novel: [] }
    )
})
