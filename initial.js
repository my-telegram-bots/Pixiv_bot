const fs = require('fs')

const db = require('./db')

async function handle() {
    fs.mkdirSync('./tmp')
    fs.mkdirSync('./tmp/file')
    fs.mkdirSync('./tmp/timecode')
    fs.mkdirSync('./tmp/mp4_0')
    fs.mkdirSync('./tmp/mp4_1')
    fs.mkdirSync('./tmp/ugoira')
    await db.db_initial()
    await db.collection.illust.createIndex({
        id: 1
    }, {
        unique: true,
    });
    await db.collection.user.createIndex({
        id: 1
    }, {
        unique: true,
    });
    await db.collection.novel.createIndex({
        id: 1
    }, {
        unique: true,
    });
    await db.collection.ranking.createIndex({
        id: 1
    }, {
        unique: true,
    });
    await db.collection.chat_setting.createIndex({
        id: 1
    }, {
        unique: true,
    });
    await db.collection.chat_bookmark.createIndex({
        id: 1
    }, {
        unique: true,
    });
    await db.collection.telegraph.createIndex({
        id: 1
    }, {
        unique: true,
    });
    process.exit()
}
handle()