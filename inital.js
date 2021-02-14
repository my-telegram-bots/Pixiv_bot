const fs = require('fs')
const { MongoClient } = require("mongodb")

let config = require('./config.json')
const mc = new MongoClient(config.mongodb.uri, {
    useUnifiedTopology: true
})
async function db(){
    let illust_col = mc.db(config.mongodb.dbname).collection('illust')
    illust_col.createIndex({
        id: 1
    }, {
        unique: true, // 懒得解释了
    })
    
}
// 新建文件夹
fs.mkdirSync('./tmp')
fs.mkdirSync('./tmp/zip')
fs.mkdirSync('./tmp/timecode')
fs.mkdirSync('./tmp/mp4_0')
fs.mkdirSync('./tmp/mp4_1')
fs.mkdirSync('./tmp/ugoira')
db()