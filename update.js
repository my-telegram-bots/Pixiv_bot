const db = require("./db")
const { sleep, asyncForEach } = require("./handlers/common")
const { update_illust } = require("./handlers/pixiv/illust")

async function update_original_file_extension() {
    await db.db_initial()
    let d = await db.collection.illust.find({}).toArray()
    console.log('load illusts from local database', d.length)
    await asyncForEach(d, async (illust, id) => {
        if ((illust.type < 2) && (!illust.imgs_.fsize || !illust.imgs_.fsize[0])) {
            console.log('converting', id, illust.id, illust.title)
            await update_illust(illust, false)
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
            await update_illust(illust, false)
            await sleep(10)
        } else {
            console.log('skip', id)
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