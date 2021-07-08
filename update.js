const db = require("./db")
const { sleep, asyncForEach } = require("./handlers/common")
const { update_illust } = require("./handlers/pixiv/illust")
const { head_url, thumb_to_all } = require("./handlers/pixiv/tools")

async function update_original_file_extension() {
    await db.db_initial()
    let d = await db.collection.illust.find({}).toArray()
    console.log('load illusts from local database', d.length)
    await asyncForEach(d, async (illust, id) => {
        if (illust.imgs_.fsize) {
            illust.imgs_.fsize.forEach(x => {
                if (isNaN(x) || !x) {
                    illust.imgs_.fsize = false
                }
            })
        }
        if ((illust.type < 2) && (!illust.imgs_.fsize || !illust.imgs_.fsize[0])) {
            console.log('converting', id, illust.id, illust.title)
            await update_illust(illust, {}, false)
            await sleep(10)
        }
    })
    process.exit()
}
async function update_db_2021_june() {
    await db.db_initial()
    let d = await db.collection.illust.find({}).toArray()
    console.log('load illusts from local database', d.length)
    await asyncForEach(d, async (illust, id) => {
        if (illust.storableTags || illust.userName || illust.createDate || !illust.imgs_ || !illust.imgs_.fsize) {
            console.log('converting', id, illust.id, illust.title)
            await update_illust(illust, {}, false)
            await sleep(10)
        } else {
            console.log('skip', id)
        }
    })
    process.exit()
}

async function update_db_2021_july() {
    await db.db_initial()
    await db.collection.dropIndexes()
    await db.collection.telegraph.createIndex({
        telegraph_url: 1
    }, {
        unique: true,
    })
    process.exit()
}

async function update_png_file_error() {
    await db.db_initial()
    let d = (await db.collection.illust.find({}).toArray()).reverse()
    console.log('load illusts from local database', d.length)
    await asyncForEach(d, async (illust, id) => {
        if(illust.imgs_.original_urls || typeof illust.imgs_.original_urls[0] == 'number' || illust.imgs_.original_urls[0].includes('.png')){
            if(typeof illust.imgs_.original_urls[0] == 'string')    illust.imgs_.original_urls[0] = await head_url(illust.imgs_.original_urls[0])
            if(illust.imgs_.original_urls[0] == 404 || typeof illust.imgs_.original_urls[0] == 'number'){
                console.log(illust.id,'png',404)
                illust.url = illust.imgs_.thumb_urls[0]
                illust.imgs_ = await thumb_to_all(illust)
            }
            await update_illust(illust, {}, false)
            await sleep(100)
        }
    })
    process.exit()
}
try {
    // just some expliot ? LOL
    eval(process.argv[2] + '()')
} catch (error) {
    console.error(error)
    process.exit()
}