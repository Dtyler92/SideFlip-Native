export class ReportPdfError extends Error {
  constructor(message, code = 'PDF_FAILED') {
    super(message)
    this.name = 'ReportPdfError'
    this.code = code
  }
}

export async function createAndShareReportPdf({ html, title = 'SideFlip private report' } = {}, { print, sharing, fileSystem, shouldContinue = () => true } = {}) {
  if (typeof html !== 'string' || !html.trim() || !print?.printToFileAsync || !sharing?.isAvailableAsync || !sharing?.shareAsync || !fileSystem?.File) {
    throw new ReportPdfError('PDF sharing is unavailable on this device.', 'PDF_UNAVAILABLE')
  }
  let generatedUri = null
  try {
    const available = await sharing.isAvailableAsync()
    if (!available) throw new ReportPdfError('PDF sharing is unavailable on this device.', 'PDF_UNAVAILABLE')
    const file = await print.printToFileAsync({ html, base64: false })
    if (!file?.uri || typeof file.uri !== 'string') throw new ReportPdfError('The PDF could not be created.', 'PDF_FAILED')
    generatedUri = file.uri
    if (!shouldContinue()) throw new ReportPdfError('Report creation was cancelled.', 'REPORT_CANCELLED')
    await sharing.shareAsync(file.uri, {
      mimeType: 'application/pdf',
      dialogTitle: title,
      UTI: 'com.adobe.pdf',
    })
    return { uri: file.uri }
  } catch (error) {
    if (error instanceof ReportPdfError) throw error
    throw new ReportPdfError('The PDF could not be created or shared. Your records were not changed.', 'PDF_FAILED')
  } finally {
    if (generatedUri) {
      try { new fileSystem.File(generatedUri).delete() } catch { /* cache cleanup is best effort */ }
    }
  }
}
