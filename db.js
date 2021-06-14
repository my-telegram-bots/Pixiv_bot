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
            try {
                let s = {
                    format: {},
                    default: {}
                }
                if (value.format) {
                    for (const i in value.format) {
                        if (['message', 'mediagroup_message', 'inline'].includes(i)) {
                            if (typeof value.format[i] == 'string') {
                                s.format[i] = value.format[i]
                            } else {
                                // throw 'e'
                            }
                        }
                    }
                }
                if (value.default) {
                    for (const i in value.default) {
                        if (['tags','open' , 'share', 'remove_keyboard', 'remove_caption', 'single_caption', 'album', 'desc'].includes(i)) {
                            if(typeof value.default[i] == 'boolean'){
                                s.default[i] = value.default[i]
                            } else {
                                // throw 'e'
                            }
                        }
                    }
                }
                if (flag.setting.dbless) {
                    await col.insertOne({
                        id: chat_id,
                        ...s
                    })
                } else {
                    await col.updateOne({
                        id: chat_id,
                    }, {
                        $set: s
                    })
                }
                resolve(true)
            } catch (error) {
                console.warn(error)
                resolve(false)
            }
        })
    },
    delete_setting: (chat_id) => {
        return new Promise(async (resolve, reject) => {
            let col = await db.collection('chat_setting')
            await col.deleteOne({
                id: chat_id
            })
        })
    }
}