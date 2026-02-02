import db from './db.js'
import { sleep, asyncForEach } from './handlers/index.js'
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
            if (id.length === 10) {
                new_path = [...new_path, `${id.substring(0, 4)}`]
                // pixiv's illust will be grow up to 10000000 (length 9) next year.
            } else if (id.length === 9) {
                new_path = [...new_path, `0${id.substring(0, 3)}`]
            } else {
                new_path = [...new_path, `00${id.substring(0, 2)}`]
            }
            if (!fs.existsSync(new_path.join('/'))) {
                fs.mkdirSync(new_path.join('/'))
            }
            new_path.push(f)
            console.log(`${base_path}/${f}`, '->', new_path.join('/'))
            if (process.env.confirm) {
                fs.renameSync(`${base_path}/${f}`, new_path.join('/'))
            }
        }
    })
    if (!process.env.confirm) {
        console.log(`Type confirm=1 node ${process.argv[2]} to exec`)
    }
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
// async function update_pximg_hostname() {
//     await db.db_initial()
//     let d = (await db.collection.illust.find({}).toArray())
//     console.log('load illusts from local database', d.length)
//     await asyncForEach(d, async (illust, i) => {
//         if (illust.type == 1) {

//         }
//     })
//     process.exit()
// }

async function set_storage_endpoint_for_ugoira_illust() {
    if (!process.argv[3] || !process.argv[4]) {
        console.log('usage set_storage_endpoint_for_ugoira_illust <endpoint filename txt> <endpoint name>')
        process.exit()
    }
    // ls mp4/* > output.txt or another way, one line one illust id
    let lsoutput = fs.readFileSync(process.argv[3], 'utf8')
    let endpoint_name = process.argv[4]
    // gets id (remove .mp4)
    //                                               NaN LOL
    let endpoint_ids = lsoutput.split('\n').map(x => parseInt(x.split('.')[0]))
    await db.db_initial()
    console.log('loading ugroia illusts from local database')
    let d = (await db.collection.illust.find({
        type: 2
    }).toArray())
    console.log('load ugroia illusts from local database', d.length)
    await asyncForEach(d, async (illust, i) => {
        if (endpoint_ids.includes(illust.id)) {
            if (illust.storage_endpoint != endpoint_name) {
                await db.collection.illust.updateOne({
                    id: illust.id
                }, {
                    $set: {
                        'storage_endpoint': endpoint_name
                    }
                })
                console.log('set', i, illust.id, endpoint_name)
            }
        } else {
            try {
                await db.collection.illust.updateOne({
                    id: illust.id
                }, {
                    $unset: ['storage_endpoint']
                })
            } catch (error) {

            }
            console.log('unset', i, illust.id, endpoint_name)
        }
    })
    process.exit()
}

async function set_imgs_without_i_cf_2023_may() {
    await db.db_initial()
    console.log('loading all illusts from local database')
    let offset = 0
    let d = (await db.collection.illust.find({ type: 0 }).toArray())
    console.log('load all illusts from local database', d.length)
    await sleep(10)
    await asyncForEach(d, async (illust, i) => {
        if (illust.type === 2) {
            console.log('to', i + offset, illust.id)
            if (illust.imgs_.cover_img_url) {
                if (illust.imgs_.cover_img_url.startsWith('https://i-cf.pximg.net')) {
                    console.log('set ugoira', illust.id)
                    await db.collection.illust.updateOne({
                        id: illust.id
                    }, {
                        $set: {
                            'imgs_': {
                                ...illust.imgs_,
                                cover_img_url: illust.imgs_.cover_img_url.replace('https://i-cf.pximg.net', 'https://i.pximg.net')
                            }
                        }
                    })
                }
            } else {
                console.log('warning no ugoira cover', illust.id)
            }
        } else {
            // console.log('to', i + offset, illust.id, parseInt(illust.imgs_.original_urls[0]))
            if (parseInt(illust.imgs_.original_urls[0])) {
                console.log('handle error data', i, illust.id)
                await db.collection.illust.updateOne({
                    id: illust.id
                }, {
                    $set: {
                        'imgs_': {
                            ...illust.imgs_,
                            thumb_urls: illust.imgs_.thumb_urls.filter(u => !parseInt(u)).map(u => u.replace('https://i-cf.pximg.net', 'https://i.pximg.net')),
                            regular_urls: illust.imgs_.regular_urls.filter(u => !parseInt(u)).map(u => u.replace('https://i-cf.pximg.net', 'https://i.pximg.net')),
                            original_urls: illust.imgs_.original_urls.filter(u => !parseInt(u)).map(u => u.replace('https://i-cf.pximg.net', 'https://i.pximg.net'))
                        }
                    }
                })
            } else if (illust.imgs_.original_urls[0].startsWith('https://i-cf.pximg.net')) {
                console.log('set', illust.id)
                await db.collection.illust.updateOne({
                    id: illust.id
                }, {
                    $set: {
                        'imgs_': {
                            ...illust.imgs_,
                            thumb_urls: illust.imgs_.thumb_urls.map(u => u.replace('https://i-cf.pximg.net', 'https://i.pximg.net')),
                            regular_urls: illust.imgs_.regular_urls.map(u => u.replace('https://i-cf.pximg.net', 'https://i.pximg.net')),
                            original_urls: illust.imgs_.original_urls.map(u => u.replace('https://i-cf.pximg.net', 'https://i.pximg.net')),
                        }
                    }
                })
            }
        }
    })
    process.exit()
}

async function override_user_setting_album_2024_may() {
    await db.db_initial()
    console.log('loading all chat_settings from local database')
    let d = (await db.collection.chat_setting.find().toArray())
    console.log('loaded', d.length)
    // await sleep(10)
    await asyncForEach(d, async (u, i) => {
        if (u.default && !u.default.album && typeof u.default.album == 'boolean') {
            console.log(u)
            // return
            await db.collection.chat_setting.updateOne({
                id: u.id
            }, {
                $set: {
                    default: {
                        album: true,
                        album_one: false
                    }
                }
            })
        }
    })
    process.exit()
}


async function override_user_setting_format_2025_april() {
    const origin_list = [
        "%\\#NSFW |NSFW%%\\#AI |AI%[%title%](%url%) / %id=|id% / [%author_name%](%author_url%) %p%%\n|tags%%\n|description%",
    ]
    const replace_list = [
        "%\\#NSFW |NSFW%%\\#AI |AI%[%title%](%url%) / %id\\=|id% / [%author_name%](%author_url%) %p%%\n|tags%%\n|description%",
    ]
    await db.db_initial()
    console.log('Upadting all chat_settings(format) from local database to new format')
    // await db.collection.chat_setting.updateMany(
    //     {
    //         format: {
    //             $exists: true
    //         }
    //     },
    //     {
    //         $set: {
    //             "format.version": "v1"
    //         }
    //     }
    // );
    await asyncForEach(origin_list, async (origin, i) => {
        (await db.collection.chat_setting.updateMany(
            {
                "format.message": origin,
                "format.inline": origin
            },
            {
                $set: {
                    "format.message": replace_list[i],
                    "format.inline": replace_list[i]
                },
                $unset: {
                    "format.version": true
                }
            }))
    })
    process.exit()
}

/**
 * Remove fsize field from all illusts (2025 January)
 * fsize is no longer needed - we simplified head_url to only check file existence
 */
async function remove_fsize_field_2025_january() {
    await db.db_initial()
    let d = await db.collection.illust.find({}).toArray()
    console.log('Removing fsize field from illusts in local database', d.length)

    let updated = 0
    await asyncForEach(d, async (illust, id) => {
        if (illust.imgs_ && illust.imgs_.fsize) {
            console.log('removing fsize from', id, illust.id, illust.title)
            await db.collection.illust.updateOne(
                { id: illust.id },
                { $unset: { 'imgs_.fsize': '' } }
            )
            updated++
            if (updated % 100 === 0) {
                console.log('Progress:', updated, '/', d.length)
            }
        }
    })
    console.log('Completed! Updated', updated, 'illusts')
    process.exit()
}

/**
 * Remove storage_endpoint field from all illusts (2025 January)
 * storage_endpoint feature has been removed from the codebase
 */
async function remove_storage_endpoint_2025_january() {
    await db.db_initial()
    let d = await db.collection.illust.find({ storage_endpoint: { $exists: true } }).toArray()
    console.log('Removing storage_endpoint field from illusts in local database', d.length)

    let updated = 0
    await asyncForEach(d, async (illust, id) => {
        console.log('removing storage_endpoint from', id, illust.id, illust.title)
        await db.collection.illust.updateOne(
            { id: illust.id },
            { $unset: { storage_endpoint: '' } }
        )
        updated++
        if (updated % 100 === 0) {
            console.log('Progress:', updated, '/', d.length)
        }
    })
    console.log('Completed! Updated', updated, 'illusts')
    process.exit()
}

/**
 * Create index for tags field (2026 February)
 * Improves inline search performance by allowing fast exact match queries on tags
 */
async function create_tags_index_2026_february() {
    await db.db_initial()
    console.log('Creating index for illust.tags field...')

    try {
        await db.collection.illust.createIndex({ tags: 1 })
        console.log('✓ Successfully created index for illust.tags')
    } catch (error) {
        console.error('✗ Failed to create index:', error)
    }

    process.exit()
}

/**
 * Fix ugoira type mismatch (2026 February)
 * Fixes illusts where type != 2 but imgs_ structure indicates it's a ugoira
 * Root cause: ranking.js was hardcoding type=0 for all ranking illusts
 */
async function fix_ugoira_type_mismatch_2026_february() {
    await db.db_initial()
    console.log('Finding illusts with ugoira structure but wrong type...')

    // Find all illusts where:
    // - type is not 2 (not marked as ugoira)
    // - imgs_ has cover_img_url (ugoira structure)
    // - imgs_ doesn't have original_urls (ugoira structure)
    let d = await db.collection.illust.find({
        type: { $ne: 2 },
        'imgs_.cover_img_url': { $exists: true }
    }).toArray()

    console.log(`Found ${d.length} potential ugoira illusts with wrong type`)

    let fixed = 0
    let skipped = 0

    await asyncForEach(d, async (illust, id) => {
        // Double check: make sure it's actually ugoira structure
        const hasOriginalUrls = illust.imgs_.original_urls && illust.imgs_.original_urls.length > 0
        const hasCoverImgUrl = illust.imgs_.cover_img_url

        if (hasCoverImgUrl && !hasOriginalUrls) {
            console.log(`Fixing illust ${illust.id} (${illust.title}): type ${illust.type} -> 2`)
            await db.collection.illust.updateOne(
                { id: illust.id },
                { $set: { type: 2 } }
            )
            fixed++
        } else {
            console.log(`Skipping illust ${illust.id}: has both cover_img_url and original_urls`)
            skipped++
        }

        if ((fixed + skipped) % 10 === 0) {
            console.log(`Progress: ${fixed + skipped}/${d.length} (fixed: ${fixed}, skipped: ${skipped})`)
        }
    })

    console.log(`\nCompleted!`)
    console.log(`- Fixed: ${fixed} illusts`)
    console.log(`- Skipped: ${skipped} illusts`)
    console.log(`- Total: ${d.length} illusts`)

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
