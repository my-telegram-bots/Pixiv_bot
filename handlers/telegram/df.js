export default {
    format: {
        telegraph: '%title% / %author_name%'
            + '\n%url%'
            + '%\n|tags%',
        message: '%\\#NSFW |NSFW%%\\#AI |AI%[%title%](%url%) / [%author_name%](%author_url%)% |p%'
            + '%\n|tags%'
            + '%\n>|description%',
        inline: '%\\#NSFW |NSFW%%\\#AI |AI%[%title%](%url%) / [%author_name%](%author_url%)% |p%'
            + '%\n|tags%'
            + '%\n>|description%',
        // single caption
        mediagroup_message: '[%mid| %%title%% |p%](%url%)'
            + '%\n|tags%'
            + '%\n>|description%',
    }
}