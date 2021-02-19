const config = require('./config.json')
const { MongoClient } = require("mongodb")
let db = null
MongoClient.connect(config.mongodb.uri,{useUnifiedTopology: true},(err, client) => {
    db = client.db(config.mongodb.dbname)
})

module.exports = {
    db: ()=>{
        return new Promise(async (resolve, reject) => {
            resolve(db)
        })
    },
    collection: (colame)=>{
        return new Promise(async (resolve, reject) => {
            MongoClient.connect(config.mongodb.uri,{useUnifiedTopology: true},(err, client) => {
                if(err)
                    reject(err)
                resolve(db.collection(colame))
            })
        })
    }
}