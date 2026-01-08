export default {
    mongodb: {
        uri: "mongodb://127.0.0.1:27017",
        dbname: "pixiv_bot"
    },
    pixiv: {
        cookie: "",
        ua: "",
        pximgproxy: "",
        csrf: "",
        ugoiraurl: "",
        ugoira_remote: false // Set to true if using remote ugoira conversion
    },
    tg: {
        master_id: 1,
        token: "",
        access_token: "",
        salt: "",
        refetch_api: ""
    }
}