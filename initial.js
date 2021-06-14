const fs = require('fs')

const { collection } = require('./db')

async function handle() {
    (await collection('illust')).createIndex({
        id: 1
    }, {
        unique: true,
    });
    (await collection('user')).createIndex({
        id: 1
    }, {
        unique: true,
    });
    (await collection('novel')).createIndex({
        id: 1
    }, {
        unique: true,
    });
    (await collection('ranking')).createIndex({
        id: 1
    }, {
        unique: true,
    });
    (await collection('chat_setting')).createIndex({
        id: 1
    }, {
        unique: true,
    });
    (await collection('chat_bookmark')).createIndex({
        id: 1
    }, {
        unique: true,
    });
    (await collection('telegraph')).createIndex({
        id: 1
    }, {
        unique: true,
    });
    fs.mkdirSync('./tmp')
    fs.mkdirSync('./tmp/file')
    fs.mkdirSync('./tmp/timecode')
    fs.mkdirSync('./tmp/mp4_0')
    fs.mkdirSync('./tmp/mp4_1')
    fs.mkdirSync('./tmp/ugoira')
}
setTimeout(() => {
    handle()
}, 1000);