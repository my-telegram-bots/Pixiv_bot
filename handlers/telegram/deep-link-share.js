export function forceDeepLinkShare(ctx) {
    if (typeof ctx?.match !== 'string' || !ctx.match.trim() || !ctx.us) {
        return false
    }
    ctx.us.share = true
    return true
}
