import { default as axios } from 'axios'
import config from '#config'

// Rate limiting configuration
class RateLimiter {
    constructor(requestsPerMinute = 60) {
        this.requests = []
        this.maxRequests = requestsPerMinute
        this.windowMs = 60000 // 1 minute
    }
    
    async waitForPermission() {
        const now = Date.now()
        // Remove old requests outside the window
        this.requests = this.requests.filter(time => now - time < this.windowMs)
        
        if (this.requests.length >= this.maxRequests) {
            const oldestRequest = Math.min(...this.requests)
            const waitTime = this.windowMs - (now - oldestRequest)
            if (waitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime))
                return this.waitForPermission() // Check again after waiting
            }
        }
        
        this.requests.push(now)
    }
}

const pixivRateLimiter = new RateLimiter(30) // 30 requests per minute for Pixiv

// Request interceptor for rate limiting
const addRateLimitingInterceptor = (axiosInstance) => {
    axiosInstance.interceptors.request.use(async (config) => {
        await pixivRateLimiter.waitForPermission()
        return config
    })
    
    // Response interceptor for error handling
    axiosInstance.interceptors.response.use(
        response => response,
        error => {
            if (error.code === 'ECONNABORTED') {
                throw new Error(`Request timeout: ${error.config.url}`)
            }
            if (error.response?.status === 429) {
                throw new Error('Rate limit exceeded, please try again later')
            }
            throw error
        }
    )
}

export const r_p_ajax = axios.create({
    baseURL: 'https://www.pixiv.net/ajax/',
    timeout: 30000, // 30 second timeout
    headers: {
        'User-Agent': config.pixiv.ua,
        'Cookie': config.pixiv.cookie
    }
})

export const r_p = axios.create({
    baseURL: 'https://www.pixiv.net/',
    timeout: 30000, // 30 second timeout
    headers: {
        'User-Agent': config.pixiv.ua,
        'Cookie': config.pixiv.cookie,
        'x-csrf-token': config.pixiv.csrf,
        'Referer': 'https://www.pixiv.net/'
    }
})

export const r_f = axios.create({
    baseURL: 'https://api.fanbox.cc/',
    timeout: 30000, // 30 second timeout
    headers: {
        'User-Agent': config.pixiv.ua,
        'Cookie': config.pixiv.fanbox_cookie,
        'Origin': 'https://www.fanbox.cc/'
    }
})

// Add rate limiting to all Pixiv API instances
addRateLimitingInterceptor(r_p_ajax)
addRateLimitingInterceptor(r_p)
addRateLimitingInterceptor(r_f)