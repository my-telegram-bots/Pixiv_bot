/**
 * Configuration validation and environment variable handling
 */

export class ConfigValidator {
    constructor() {
        this.errors = []
        this.warnings = []
    }
    
    /**
     * Validate required configuration fields
     */
    validateConfig(config) {
        this.errors = []
        this.warnings = []
        
        // Validate MongoDB configuration
        this.validateMongoDB(config.mongodb)
        
        // Validate Pixiv configuration
        this.validatePixiv(config.pixiv)
        
        // Validate Telegram configuration
        this.validateTelegram(config.tg)
        
        // Validate Web configuration
        this.validateWeb(config.web)
        
        return {
            isValid: this.errors.length === 0,
            errors: this.errors,
            warnings: this.warnings
        }
    }
    
    validateMongoDB(mongodb) {
        if (!mongodb) {
            this.errors.push('MongoDB configuration is missing')
            return
        }
        
        if (!mongodb.uri || mongodb.uri.trim() === '') {
            this.errors.push('MongoDB URI is required')
        } else {
            try {
                new URL(mongodb.uri)
            } catch {
                this.errors.push('MongoDB URI is not valid')
            }
        }
        
        if (!mongodb.dbname || mongodb.dbname.trim() === '') {
            this.errors.push('MongoDB database name is required')
        }
    }
    
    validatePixiv(pixiv) {
        if (!pixiv) {
            this.errors.push('Pixiv configuration is missing')
            return
        }
        
        if (!pixiv.cookie || pixiv.cookie.trim() === '') {
            this.errors.push('Pixiv cookie is required for API access')
        }
        
        if (!pixiv.ua || pixiv.ua.trim() === '') {
            this.errors.push('User-Agent string is required')
        }
        
        if (pixiv.pximgproxy && pixiv.pximgproxy.trim() !== '') {
            try {
                new URL(`https://${pixiv.pximgproxy}`)
            } catch {
                this.errors.push('Pixiv image proxy URL is not valid')
            }
        }
        
        if (pixiv.ugoiraurl && pixiv.ugoiraurl.trim() !== '') {
            try {
                new URL(pixiv.ugoiraurl)
            } catch {
                this.errors.push('Ugoira URL is not valid')
            }
        }
    }
    
    validateTelegram(tg) {
        if (!tg) {
            this.errors.push('Telegram configuration is missing')
            return
        }
        
        if (!tg.token || tg.token.trim() === '') {
            this.errors.push('Telegram bot token is required')
        } else if (!/^\d+:[A-Za-z0-9_-]+$/.test(tg.token)) {
            this.errors.push('Telegram bot token format is invalid')
        }
        
        if (!tg.master_id || typeof tg.master_id !== 'number' || tg.master_id <= 0) {
            this.errors.push('Master user ID must be a positive number')
        }
        
        if (tg.access_token && tg.access_token.trim() !== '' && !/^[a-f0-9]{64}$/.test(tg.access_token)) {
            this.warnings.push('Telegraph access token format may be invalid')
        }
        
        if (tg.refetch_api && tg.refetch_api.trim() !== '') {
            try {
                new URL(tg.refetch_api)
            } catch {
                this.errors.push('Refetch API URL is not valid')
            }
        }
    }
    
    validateWeb(web) {
        if (!web) {
            this.warnings.push('Web configuration is missing, web interface will be disabled')
            return
        }
        
        if (web.enabled && typeof web.enabled !== 'boolean') {
            this.warnings.push('Web enabled should be a boolean value')
        }
        
        if (web.port && (typeof web.port !== 'number' || web.port <= 0 || web.port > 65535)) {
            this.errors.push('Web port must be a number between 1 and 65535')
        }
        
        if (web.host && typeof web.host !== 'string') {
            this.errors.push('Web host must be a string')
        }
    }
}

/**
 * Load and validate configuration with environment variable support
 */
export async function loadAndValidateConfig() {
    let config
    
    try {
        const configModule = await import('#config')
        config = configModule.default
    } catch (error) {
        throw new Error('Failed to load config.js. Please ensure config.js exists and is based on config_sample.js')
    }
    
    // Override with environment variables if available
    config = applyEnvironmentOverrides(config)
    
    // Validate configuration
    const validator = new ConfigValidator()
    const validation = validator.validateConfig(config)
    
    if (!validation.isValid) {
        console.error('Configuration validation failed:')
        validation.errors.forEach(error => console.error(`  ERROR: ${error}`))
        throw new Error('Invalid configuration')
    }
    
    if (validation.warnings.length > 0) {
        console.warn('Configuration warnings:')
        validation.warnings.forEach(warning => console.warn(`  WARNING: ${warning}`))
    }
    
    return config
}

/**
 * Apply environment variable overrides to configuration
 */
function applyEnvironmentOverrides(config) {
    const env = process.env
    
    // MongoDB overrides
    if (env.MONGODB_URI) {
        config.mongodb.uri = env.MONGODB_URI
    }
    if (env.MONGODB_DBNAME) {
        config.mongodb.dbname = env.MONGODB_DBNAME
    }
    
    // Pixiv overrides
    if (env.PIXIV_COOKIE) {
        config.pixiv.cookie = env.PIXIV_COOKIE
    }
    if (env.PIXIV_UA) {
        config.pixiv.ua = env.PIXIV_UA
    }
    if (env.PIXIV_PROXY) {
        config.pixiv.pximgproxy = env.PIXIV_PROXY
    }
    if (env.PIXIV_UGOIRA_URL) {
        config.pixiv.ugoiraurl = env.PIXIV_UGOIRA_URL
    }
    
    // Telegram overrides
    if (env.TELEGRAM_BOT_TOKEN) {
        config.tg.token = env.TELEGRAM_BOT_TOKEN
    }
    if (env.TELEGRAM_MASTER_ID) {
        config.tg.master_id = parseInt(env.TELEGRAM_MASTER_ID)
    }
    if (env.TELEGRAPH_ACCESS_TOKEN) {
        config.tg.access_token = env.TELEGRAPH_ACCESS_TOKEN
    }
    if (env.REFETCH_API_URL) {
        config.tg.refetch_api = env.REFETCH_API_URL
    }
    
    // Web overrides
    if (env.WEB_ENABLED !== undefined) {
        config.web.enabled = env.WEB_ENABLED.toLowerCase() === 'true'
    }
    if (env.WEB_HOST) {
        config.web.host = env.WEB_HOST
    }
    if (env.WEB_PORT) {
        config.web.port = parseInt(env.WEB_PORT)
    }
    
    return config
}

/**
 * Check system dependencies
 */
export async function checkSystemDependencies() {
    const dependencies = ['ffmpeg', 'mp4fpsmod', 'unzip']
    const missing = []
    
    for (const dep of dependencies) {
        try {
            const { exec } = await import('#handlers/common')
            await exec(`which ${dep}`)
        } catch (error) {
            missing.push(dep)
        }
    }
    
    return {
        allPresent: missing.length === 0,
        missing
    }
}