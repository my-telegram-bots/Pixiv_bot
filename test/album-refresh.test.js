import test from 'ava'
import { replaceRefreshedAlbumItems } from '../handlers/telegram/illustration-lifecycle.js'

test('album refresh replaces only matching illustration items and preserves batch order', t => {
    const batch = [
        { id: 1, p: 0, media_r: 'old-1' },
        { id: 2, p: 0, media_r: 'keep-2' },
        { id: 1, p: 1, media_r: 'old-1-page-2' }
    ]
    const refreshed = {
        id: 1,
        mediagroup: [
            { id: 1, p: 0, media_r: 'new-1' },
            { id: 1, p: 1, media_r: 'new-1-page-2' }
        ]
    }

    replaceRefreshedAlbumItems(batch, refreshed)

    t.deepEqual(batch.map(item => item.media_r), ['new-1', 'keep-2', 'new-1-page-2'])
})
