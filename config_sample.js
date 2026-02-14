export default {
    mongodb: {
        uri: "mongodb://127.0.0.1:27017",
        dbname: "pixiv_bot"
    },
    postgres: {
        uri: "postgresql://user:password@localhost:5432/pixiv_bot",
        // Optional: override default pool settings
        // pool: {
        //     max: 50,                      // Maximum connections (default: 50)
        //     min: 5,                       // Minimum connections (default: 5)
        //     idleTimeoutMillis: 30000,     // Close idle after 30s (default: 30000)
        //     connectionTimeoutMillis: 3000 // Timeout acquiring connection (default: 3000)
        // }
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