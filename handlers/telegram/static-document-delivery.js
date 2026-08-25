export function staticDeliveryPlan(settings = {}) {
    return {
        sendPhoto: !settings.asfile,
        immediateDocumentMode: settings.asfile
            ? 'file_only'
            : settings.append_file_immediate
                ? 'append_immediate'
                : null,
        queueDocument: Boolean(settings.append_file && !settings.append_file_immediate),
        // Immediate append is already interleaved after each normal album chunk.
        // Telegraph has no normal album send, so either append mode trails it.
        appendAlbumDocuments: Boolean(settings.append_file &&
            (!settings.append_file_immediate || settings.telegraph))
    }
}

export function immediateDocumentMode(settings = {}) {
    return staticDeliveryPlan(settings).immediateDocumentMode
}

export async function deliverConfiguredDocument({
    settings,
    alreadySent = false,
    sendDocument
}) {
    const mode = immediateDocumentMode(settings)
    if (!mode || alreadySent) return { mode, result: null }
    return { mode, result: await sendDocument() }
}

export async function deliverDocumentWithRefresh({ sendDocument, refresh }) {
    let result = await sendDocument()
    if (result?.kind !== 'stale_media') return result
    if (!await refresh()) return result
    result = await sendDocument()
    return result
}
