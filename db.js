const config = require('./config.json')
const { MongoClient } = require("mongodb")

module.exports = {
    db: ()=>{
        return new Promise(async (resolve, reject) => {
            MongoClient.connect(config.mongodb.uri,{useUnifiedTopology: true},(err, client) => {
                if(err)
                    reject(err)
                resolve(client.db(config.mongodb.dbname))
            })
        })
    },
    collection: (colame)=>{
        return new Promise(async (resolve, reject) => {
            MongoClient.connect(config.mongodb.uri,{useUnifiedTopology: true},(err, client) => {
                if(err)
                    reject(err)
                const db = client.db(config.mongodb.dbname)
                resolve(db.collection(colame))
            })
        })
    }
}