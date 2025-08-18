import { promises as fsPromises } from 'fs'
import path from 'path'

/**
 * File cleanup utility to prevent disk space issues
 */
export class FileCleaner {
    constructor(config = {}) {
        this.maxAge = config.maxAge || 24 * 60 * 60 * 1000 // 24 hours default
        this.maxSize = config.maxSize || 1024 * 1024 * 1024 // 1GB default
        this.cleanupInterval = config.cleanupInterval || 60 * 60 * 1000 // 1 hour default
        this.directories = config.directories || ['./tmp']
        this.isRunning = false
    }
    
    /**
     * Start automatic cleanup
     */
    start() {
        if (this.isRunning) {
            return
        }
        
        this.isRunning = true
        console.log('✓ File cleanup scheduler started')
        
        // Run cleanup immediately
        this.cleanup().catch(console.error)
        
        // Schedule periodic cleanup
        this.intervalId = setInterval(() => {
            this.cleanup().catch(console.error)
        }, this.cleanupInterval)
    }
    
    /**
     * Stop automatic cleanup
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId)
            this.intervalId = null
        }
        this.isRunning = false
        console.log('File cleanup scheduler stopped')
    }
    
    /**
     * Perform cleanup of old and large files
     */
    async cleanup() {
        console.log('🧹 Starting file cleanup...')
        let totalCleaned = 0
        let totalSize = 0
        
        for (const directory of this.directories) {
            try {
                const { cleaned, size } = await this.cleanDirectory(directory)
                totalCleaned += cleaned
                totalSize += size
            } catch (error) {
                console.warn(`Warning: Could not clean directory ${directory}:`, error.message)
            }
        }
        
        if (totalCleaned > 0) {
            console.log(`✓ Cleaned ${totalCleaned} files, freed ${this.formatSize(totalSize)}`)
        } else {
            console.log('✓ File cleanup completed - no files needed cleaning')
        }
    }
    
    /**
     * Clean a specific directory
     */
    async cleanDirectory(directory) {
        let cleaned = 0
        let freedSize = 0
        
        try {
            await fsPromises.access(directory)
        } catch {
            // Directory doesn't exist, skip
            return { cleaned: 0, size: 0 }
        }
        
        const entries = await fsPromises.readdir(directory, { withFileTypes: true })
        const now = Date.now()
        
        for (const entry of entries) {
            const fullPath = path.join(directory, entry.name)
            
            try {
                if (entry.isDirectory()) {
                    // Recursively clean subdirectories
                    const result = await this.cleanDirectory(fullPath)
                    cleaned += result.cleaned
                    freedSize += result.size
                    
                    // Remove empty directories (but preserve important structure directories)
                    const remainingEntries = await fsPromises.readdir(fullPath)
                    const preservedDirs = [
                        './tmp', './tmp/file', './tmp/timecode', './tmp/mp4_0', './tmp/mp4_1', 
                        './tmp/mp4', './tmp/ugoira', './tmp/palette', './tmp/gif'
                    ]
                    const isImportantDir = preservedDirs.includes(fullPath)
                    if (remainingEntries.length === 0 && !isImportantDir) {
                        await fsPromises.rmdir(fullPath)
                        console.log(`Removed empty directory: ${fullPath}`)
                    }
                } else if (entry.isFile()) {
                    const stats = await fsPromises.stat(fullPath)
                    const fileAge = now - stats.mtime.getTime()
                    
                    // Check if file should be deleted (by age or if directory is too large)
                    if (fileAge > this.maxAge) {
                        await fsPromises.unlink(fullPath)
                        cleaned++
                        freedSize += stats.size
                        console.log(`Deleted old file: ${fullPath} (${this.formatAge(fileAge)} old)`)
                    }
                }
            } catch (error) {
                console.warn(`Warning: Could not process ${fullPath}:`, error.message)
            }
        }
        
        return { cleaned, size: freedSize }
    }
    
    /**
     * Check directory size and clean if necessary
     */
    async checkDirectorySize(directory) {
        try {
            const size = await this.getDirectorySize(directory)
            if (size > this.maxSize) {
                console.log(`Directory ${directory} is too large (${this.formatSize(size)}), cleaning oldest files...`)
                await this.cleanOldestFiles(directory, size - this.maxSize)
            }
        } catch (error) {
            console.warn(`Warning: Could not check size of ${directory}:`, error.message)
        }
    }
    
    /**
     * Get total size of directory
     */
    async getDirectorySize(directory) {
        let totalSize = 0
        
        try {
            const entries = await fsPromises.readdir(directory, { withFileTypes: true })
            
            for (const entry of entries) {
                const fullPath = path.join(directory, entry.name)
                
                if (entry.isDirectory()) {
                    totalSize += await this.getDirectorySize(fullPath)
                } else if (entry.isFile()) {
                    const stats = await fsPromises.stat(fullPath)
                    totalSize += stats.size
                }
            }
        } catch (error) {
            // Directory doesn't exist or can't be read
            return 0
        }
        
        return totalSize
    }
    
    /**
     * Clean oldest files until target size is reached
     */
    async cleanOldestFiles(directory, targetSize) {
        const files = []
        const entries = await fsPromises.readdir(directory, { withFileTypes: true })
        
        // Collect all files with their modification times
        for (const entry of entries) {
            if (entry.isFile()) {
                const fullPath = path.join(directory, entry.name)
                const stats = await fsPromises.stat(fullPath)
                files.push({
                    path: fullPath,
                    mtime: stats.mtime.getTime(),
                    size: stats.size
                })
            }
        }
        
        // Sort by modification time (oldest first)
        files.sort((a, b) => a.mtime - b.mtime)
        
        let deletedSize = 0
        for (const file of files) {
            if (deletedSize >= targetSize) {
                break
            }
            
            try {
                await fsPromises.unlink(file.path)
                deletedSize += file.size
                console.log(`Deleted file for space: ${file.path}`)
            } catch (error) {
                console.warn(`Could not delete ${file.path}:`, error.message)
            }
        }
    }
    
    /**
     * Format file size for display
     */
    formatSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB']
        let size = bytes
        let unitIndex = 0
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024
            unitIndex++
        }
        
        return `${size.toFixed(1)}${units[unitIndex]}`
    }
    
    /**
     * Format file age for display
     */
    formatAge(ms) {
        const minutes = Math.floor(ms / (1000 * 60))
        const hours = Math.floor(minutes / 60)
        const days = Math.floor(hours / 24)
        
        if (days > 0) return `${days}d`
        if (hours > 0) return `${hours}h`
        return `${minutes}m`
    }
}