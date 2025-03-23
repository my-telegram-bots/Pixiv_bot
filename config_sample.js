export default {
    mongodb: {
        uri: "mongodb://127.0.0.1:27017",
        dbname: "pixiv_bot"
    },
    pixiv: {
        cookie: "",
        ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0",
        pximgproxy: "https://i.ugoira.com",
        csrf: "",
        ugoiraurl: "https://i.ugoira.com"
    },
    tg: {
        master_id: 142223838,
        token: "354505555:AAHhZPiS2Q-x0h4ibGpQCVngePAtKhlGJKg",
        access_token: "",
        salt: "",
        refetch_api: ""
    },
    web: {
        enabled: false,
        host: "127.0.0.1",
        port: 30005,
        recaptcha_key: false,
        hcaptcha_key: false
    }
}