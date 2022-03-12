import db from './db.js'
import { sleep, asyncForEach } from './handlers/common.js'
import { update_illust, get_illust } from './handlers/pixiv/illust.js'
import { head_url, thumb_to_all } from './handlers/pixiv/tools.js'
import fs from 'fs'
process.env.dev = 1
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
        }
        else {
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
async function move_ugoira_folder_and_index_2022_march() {
    const base_path = './tmp/mp4_1'
    await asyncForEach(fs.readdirSync(base_path), f => {
        let ff = f.split('.')
        if (!isNaN(parseInt(f[0])) && ff[ff.length - 1] === 'mp4') {
            let new_path = ['./tmp/mp4']
            const id = ff[0]
            // pixiv's illust will be grow up to 10000000 (length 9) next year.
            if (id.length > 8) {
                new_path = [...new_path, id.substr(0, 3)]
            } else {
                new_path = [...new_path, `0${id.substr(0, 2)}`]
            }
            if (!fs.existsSync(new_path.join('/'))) {
                fs.mkdirSync(new_path.join('/'))
            }
            new_path.push(f)
            fs.renameSync(`${base_path}/${f}`, new_path.join('/'))
            console.log(`${base_path}/${f}`, '->', new_path.join('/'))
        }
    })
}



async function update_png_file_error() {
    await db.db_initial()
    let d = (await db.collection.illust.find({}).toArray()).reverse()
    console.log('load illusts from local database', d.length)
    await asyncForEach(d, async (illust, id) => {
        if (illust.imgs_.original_urls || typeof illust.imgs_.original_urls[0] == 'number' || illust.imgs_.original_urls[0].includes('.png')) {
            if (typeof illust.imgs_.original_urls[0] == 'string')
                illust.imgs_.original_urls[0] = await head_url(illust.imgs_.original_urls[0])
            if (illust.imgs_.original_urls[0] == 404 || typeof illust.imgs_.original_urls[0] == 'number') {
                console.log(illust.id, 'png', 404)
                illust.url = illust.imgs_.thumb_urls[0]
                illust.imgs_ = await thumb_to_all(illust)
            }
            await update_illust(illust, {}, false)
            await sleep(100)
        }
    })
    process.exit()
}
async function update_ugoira_null_size_data() {
    await db.db_initial()
    let d = (await db.collection.illust.find({
        type: 2
    }).toArray())
    console.log('load ugroia illusts from local database', d.length)
    await asyncForEach(d, async (illust, id) => {
        try {
            if (illust.type === 2 && JSON.stringify(illust.imgs_.size).includes('null')) {
                let e = (await exec(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 './tmp/mp4_1/${illust.id}.mp4'`)).stdout.replace('\n', '').split('x')
                console.log(id, illust.id, illust.type, illust.imgs_.size, e)
                await db.collection.illust.updateOne({
                    id: illust.id
                }, {
                    $set: {
                        'imgs_.size': [{
                            width: parseInt(e[0]),
                            height: parseInt(e[1])
                        }]
                    }
                })
            }
        }
        catch (error) {
            console.log(illust.id, error)
        }
    })
    process.exit()
}
async function update_ugoira_1st_image_url() {
    await db.db_initial()
    let d = (await db.collection.illust.find({
        type: 2
    }).toArray())
    console.log('load ugroia illusts from local database', d.length)
    await asyncForEach(d, async (illust, i) => {
        try {
            if (!illust.imgs_.cover_img_url) {
                let new_illust = await get_illust(illust.id, true)
                console.log(i, new_illust.id, new_illust.imgs_.cover_img_url)
                await sleep(1000)
            }
        }
        catch (error) {
            console.error(error)
        }
    })
    process.exit()
}

try {
    // just some expliot ? LOL
    eval(process.argv[2] + '()')
}
catch (error) {
    console.error(error)
    process.exit()
}
