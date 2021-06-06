const config = require('./config.json')
const { MongoClient } = require("mongodb")
let db = null
MongoClient.connect(config.mongodb.uri, { useUnifiedTopology: true }, (err, client) => {
    db = client.db(config.mongodb.dbname)
})

module.exports = {
    db: () => {
        return new Promise(async (resolve, reject) => {
            resolve(db)
        })
    },
    collection: (colame) => {
        return new Promise(async (resolve, reject) => {
            resolve(db.collection(colame))
        })
    },
    update_setting: (value, chat_id, flag) => {
        return new Promise(async (resolve, reject) => {
            let col = await db.collection('chat_setting')
            if (flag.setting.dbless) {
                await col.insertOne({
                    id: chat_id,
                    format: {
                        message: false,
                        inline: false
                    },
                    show_tag: false
                })
            }
            try {
                // Not filter ....
                await col.updateOne({
                    id: chat_id,
                }, {
                    $set: {
                        ...value
                    }
                })
                resolve(true)
            } catch (error) {
                console.warn(error)
                reject(false)
            }
        })
    }
}