export default {
    files: ['test/**/*.test.js'],
    extensions: {
        js: true
    },
    nodeArguments: [
        '--no-warnings',
        '--experimental-specifier-resolution=node'
    ],
    environmentVariables: {
        NODE_ENV: 'test'
    },
    timeout: '30s',
    concurrency: 5,
    failFast: false,
    verbose: true
}
