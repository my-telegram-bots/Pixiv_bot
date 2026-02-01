import fs from 'fs'
import db from './db.js'
export async function handle() {
    mkdir('./tmp')
    mkdir('./tmp/file')
    mkdir('./tmp/timecode')
    mkdir('./tmp/mp4_0')
    mkdir('./tmp/mp4_1')
    mkdir('./tmp/mp4')
    mkdir('./tmp/ugoira')
    mkdir('./tmp/palette')
    mkdir('./tmp/gif')
    await db.db_initial()
    await create_unique_index('author')
    await create_unique_index('illust')
    await create_unique_index('novel')
    await create_unique_index('ranking')
    await create_unique_index('chat_setting')
    await db.collection.telegraph.createIndex({
        telegraph_url: 1
    }, {
        unique: true,
    })
    // Create index for tags field for fast inline search
    await db.collection.illust.createIndex({
        tags: 1
    })
    console.log('✓ Created index for illust.tags')
    process.exit()
}
/**
 * mkdir
 * @param {*} path
 */
export function mkdir(path) {
    try {
        fs.mkdirSync(path)
    }
    catch (error) {
    }
}
export async function create_unique_index(collection) {
    try {
        await db.collection[collection].createIndex({
            id: 1
        }, {
            unique: true,
        })
    }
    catch (error) {
        console.error(error)
    }
}
handle()
