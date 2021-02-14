const fs = require('fs')

const { collection } = require('./db')

async function handle(){
    (await collection('illust')).createIndex({
        id: 1
    },{
        unique: true, // 懒得解释了
    })
    (await collection('ranking')).createIndex({
        id: 1
    },{
        unique: true,
    })
    // 新建文件夹
    fs.mkdirSync('./tmp')
    fs.mkdirSync('./tmp/zip')
    fs.mkdirSync('./tmp/timecode')
    fs.mkdirSync('./tmp/mp4_0')
    fs.mkdirSync('./tmp/mp4_1')
    fs.mkdirSync('./tmp/ugoira')
}
handle()


