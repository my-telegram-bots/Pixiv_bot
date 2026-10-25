import { logTelegramFailure } from '#handlers/telegram/delivery-telemetry'

export function createUpdateRunnerLifecycle({
    getRunner,
    stopBackground,
    waitForStartup = async () => {},
    closeDatabase,
    log = console,
    exit = process.exit
}) {
    let shutdownPromise = null

    return {
        isStopping() {
            return shutdownPromise !== null
        },

        shutdown(signal) {
            if (shutdownPromise) {
                return shutdownPromise
            }

            shutdownPromise = Promise.resolve().then(async () => {
                let failure = null
                const stop = async (name, operation) => {
                    try {
                        await operation()
                    } catch (error) {
                        failure = true
                        logTelegramFailure({ warn: (...args) => log.error(...args) }, error, {
                            method: name,
                            errorCode: 'BOT_SHUTDOWN_FAILED'
                        })
                    }
                }

                try {
                    log.log(`${signal} received, shutting down gracefully...`)
                } catch {
                    // A failed logger must not prevent draining active work.
                }
                await stop('Telegram update runner', () => getRunner()?.stop())
                await stop('background work', stopBackground)
                await stop('startup', waitForStartup)
                await stop('database', closeDatabase)
                exit(failure ? 1 : 0)
            })

            return shutdownPromise
        }
    }
}
